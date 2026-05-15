import { InventoryTransaction } from '../types';
import { format, subDays, startOfDay } from 'date-fns';
import { forecastWithLSTM } from './mlForecasting';

export interface ModelMetrics {
  mae: number;              // Mean Absolute Error
  rmse: number;             // Root Mean Square Error
  mape: number;             // Mean Absolute Percentage Error
  r2Score: number;          // R² Score (0-1, higher is better)
  accuracy: number;         // Overall accuracy percentage
  directionalAccuracy: number; // % of correct trend predictions
}

export interface EvaluationResult {
  metrics: ModelMetrics;
  testSize: number;
  trainSize: number;
  evaluationDate: string;
  analysisName: string;
}

/**
 * Split data into training and testing sets (80-20 split)
 */
function splitData(data: number[], splitRatio: number = 0.8): { train: number[]; test: number[] } {
  const splitIndex = Math.floor(data.length * splitRatio);
  return {
    train: data.slice(0, splitIndex),
    test: data.slice(splitIndex)
  };
}

/**
 * Calculate Mean Absolute Error
 */
export function calculateMAE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const errors = actual.map((a, i) => Math.abs(a - (predicted[i] || 0)));
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

/**
 * Calculate Root Mean Square Error
 */
export function calculateRMSE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const squaredErrors = actual.map((a, i) => Math.pow(a - (predicted[i] || 0), 2));
  const meanSquaredError = squaredErrors.reduce((sum, e) => sum + e, 0) / squaredErrors.length;
  return Math.sqrt(meanSquaredError);
}

/**
 * Calculate Mean Absolute Percentage Error
 */
export function calculateMAPE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const errors = actual.map((a, i) => {
    if (a === 0) return 0;
    return Math.abs((a - (predicted[i] || 0)) / a);
  });
  return (errors.reduce((sum, e) => sum + e, 0) / errors.length) * 100;
}

/**
 * Calculate R² Score (coefficient of determination)
 */
export function calculateR2Score(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  
  const mean = actual.reduce((sum, a) => sum + a, 0) / actual.length;
  const ssTotal = actual.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0);
  const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - (predicted[i] || 0), 2), 0);
  
  if (ssTotal === 0) return 0;
  return 1 - (ssRes / ssTotal);
}

/**
 * Calculate directional accuracy (% of correct trend predictions)
 */
export function calculateDirectionalAccuracy(actual: number[], predicted: number[]): number {
  if (actual.length < 2) return 0;
  
  let correctDirections = 0;
  for (let i = 1; i < actual.length; i++) {
    const actualDirection = actual[i] >= actual[i - 1] ? 1 : -1;
    const predictedDirection = predicted[i] >= predicted[i - 1] ? 1 : -1;
    if (actualDirection === predictedDirection) {
      correctDirections++;
    }
  }
  return (correctDirections / (actual.length - 1)) * 100;
}

/**
 * Evaluate model accuracy for a specific component
 */
export async function evaluateComponentForecast(
  transactions: InventoryTransaction[],
  componentId: string,
  forecastDays: number = 30
): Promise<EvaluationResult> {
  // Filter transactions for component
  const componentTransactions = transactions.filter(t => t.component_id === componentId);
  
  // Group by day and aggregate
  const dayMap = new Map<string, number>();
  componentTransactions.forEach(t => {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd');
    const current = dayMap.get(day) || 0;
    if (t.transaction_type === 'issue') {
      dayMap.set(day, current + t.quantity);
    }
  });
  
  // Get data for last 120 days
  const today = startOfDay(new Date());
  const historicalData: number[] = [];
  
  for (let i = 119; i >= 0; i--) {
    const date = format(subDays(today, i), 'yyyy-MM-dd');
    historicalData.push(dayMap.get(date) || 0);
  }
  
  // Split into train and test
  const { train: trainData, test: testData } = splitData(historicalData, 0.75);
  
  if (testData.length === 0 || trainData.length < 20) {
    return {
      metrics: {
        mae: 0,
        rmse: 0,
        mape: 0,
        r2Score: 0,
        accuracy: 0,
        directionalAccuracy: 0
      },
      testSize: testData.length,
      trainSize: trainData.length,
      evaluationDate: new Date().toISOString(),
      analysisName: `Component ${componentId}`
    };
  }
  
  // Train on training data and predict test period
  const forecastResult = await forecastWithLSTM(componentTransactions, testData.length);
  
  // Calculate metrics
  const mae = calculateMAE(testData, forecastResult.predictions.slice(0, testData.length));
  const rmse = calculateRMSE(testData, forecastResult.predictions.slice(0, testData.length));
  const mape = calculateMAPE(testData, forecastResult.predictions.slice(0, testData.length));
  const r2 = calculateR2Score(testData, forecastResult.predictions.slice(0, testData.length));
  const directionalAcc = calculateDirectionalAccuracy(
    testData,
    forecastResult.predictions.slice(0, testData.length)
  );
  
  // Overall accuracy: normalize R² to percentage and take weighted average
  const accuracy = Math.max(0, (r2 * 100 + directionalAcc) / 2);
  
  return {
    metrics: {
      mae: Math.round(mae * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      mape: Math.round(mape * 100) / 100,
      r2Score: Math.round(r2 * 10000) / 10000,
      accuracy: Math.round(accuracy * 100) / 100,
      directionalAccuracy: Math.round(directionalAcc * 100) / 100
    },
    testSize: testData.length,
    trainSize: trainData.length,
    evaluationDate: new Date().toISOString(),
    analysisName: `Component ${componentId}`
  };
}

/**
 * Evaluate overall model accuracy across all components
 */
export async function evaluateOverallModel(
  transactions: InventoryTransaction[],
  componentIds: string[],
  forecastDays: number = 30
): Promise<{
  overallMetrics: ModelMetrics;
  componentMetrics: Record<string, ModelMetrics>;
  timestamp: string;
}> {
  const componentMetrics: Record<string, ModelMetrics> = {};
  const allMetrics: ModelMetrics[] = [];
  
  for (const componentId of componentIds) {
    const result = await evaluateComponentForecast(transactions, componentId, forecastDays);
    componentMetrics[componentId] = result.metrics;
    allMetrics.push(result.metrics);
  }
  
  // Calculate averages
  const overallMetrics: ModelMetrics = {
    mae: allMetrics.reduce((sum, m) => sum + m.mae, 0) / allMetrics.length,
    rmse: allMetrics.reduce((sum, m) => sum + m.rmse, 0) / allMetrics.length,
    mape: allMetrics.reduce((sum, m) => sum + m.mape, 0) / allMetrics.length,
    r2Score: allMetrics.reduce((sum, m) => sum + m.r2Score, 0) / allMetrics.length,
    accuracy: allMetrics.reduce((sum, m) => sum + m.accuracy, 0) / allMetrics.length,
    directionalAccuracy: allMetrics.reduce((sum, m) => sum + m.directionalAccuracy, 0) / allMetrics.length
  };
  
  return {
    overallMetrics,
    componentMetrics,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate accuracy report text
 */
export function generateAccuracyReport(result: EvaluationResult): string {
  const m = result.metrics;
  const report = `
=== Model Accuracy Report ===
Analysis: ${result.analysisName}
Date: ${new Date(result.evaluationDate).toLocaleString()}

Dataset Split:
  - Training Set: ${result.trainSize} days
  - Testing Set: ${result.testSize} days

Performance Metrics:
  - Overall Accuracy: ${m.accuracy}%
  - Directional Accuracy: ${m.directionalAccuracy}%
  - R² Score: ${m.r2Score} (0-1 scale, higher is better)
  
Error Metrics:
  - Mean Absolute Error (MAE): ${m.mae} units
  - Root Mean Square Error (RMSE): ${m.rmse} units
  - Mean Absolute Percentage Error (MAPE): ${m.mape}%

Interpretation:
  - MAE: Average prediction error in units
  - RMSE: Penalizes larger errors more than MAE
  - MAPE: Percentage-based error (good for comparing different scales)
  - R² Score: Explains variance (>0.7 is good, >0.85 is excellent)
  - Directional Accuracy: % of correct trend predictions
  `;
  return report.trim();
}
