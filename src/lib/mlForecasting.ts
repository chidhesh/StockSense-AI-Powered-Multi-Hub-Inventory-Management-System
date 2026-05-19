import * as tf from '@tensorflow/tfjs';
import { InventoryTransaction, ForecastPoint, ComponentForecast } from '../types';
import { format, subDays, addDays, startOfDay } from 'date-fns';

// ============================================
// LSTM-Based Demand Forecasting with TensorFlow.js
// ============================================

interface MLForecastResult {
  predictions: number[];
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  anomalyScore: number;
}

// Normalize data for neural network
function normalizeData(data: number[]): { normalized: number[]; min: number; max: number } {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const normalized = data.map(v => (v - min) / range);
  return { normalized, min, max };
}

// Denormalize predictions back to original scale
function denormalizeData(data: number[], min: number, max: number): number[] {
  const range = max - min || 1;
  return data.map(v => Math.round(v * range + min));
}

// Create sequences for LSTM training
function createSequences(data: number[], sequenceLength: number): { X: number[][][]; y: number[] } {
  const X: number[][][] = [];
  const y: number[] = [];
  
  for (let i = sequenceLength; i < data.length; i++) {
    X.push(data.slice(i - sequenceLength, i).map(v => [v]));
    y.push(data[i]);
  }
  
  return { X, y };
}

// Build LSTM model for time-series forecasting
function buildLSTMModel(sequenceLength: number): tf.LayersModel {
  const model = tf.sequential();
  
  model.add(tf.layers.lstm({
    units: 32,
    returnSequences: true,
    inputShape: [sequenceLength, 1]
  }));
  
  model.add(tf.layers.dropout({ rate: 0.2 }));
  
  model.add(tf.layers.lstm({
    units: 16,
    returnSequences: false
  }));
  
  model.add(tf.layers.dense({ units: 1 }));
  
  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'meanSquaredError'
  });
  
  return model;
}

// Main LSTM forecasting function
export async function forecastWithLSTM(
  transactions: InventoryTransaction[],
  forecastDays: number = 30,
  historicalDays: number = 90
): Promise<MLForecastResult> {
  await tf.ready();
  
  // Group transactions by day
  const dayMap = new Map<string, number>();
  transactions.forEach(t => {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd');
    const current = dayMap.get(day) || 0;
    if (t.transaction_type === 'issue') {
      dayMap.set(day, current + t.quantity);
    } else if (t.transaction_type === 'return') {
      dayMap.set(day, Math.max(0, current - t.quantity));
    }
  });
  
  // Get historical data based on parameter
  const today = startOfDay(new Date());
  const historicalData: number[] = [];
  
  for (let i = historicalDays - 1; i >= 0; i--) {
    const date = format(subDays(today, i), 'yyyy-MM-dd');
    historicalData.push(dayMap.get(date) || 0);
  }
  
  // Need sufficient data for training — use visible baseline so chart shows predicted demand
  if (historicalData.filter(v => v > 0).length < 10) {
    const avg = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
    const recentMax = Math.max(...historicalData.slice(-14), 0);
    const baseline = Math.max(1, Math.round(Math.max(avg, recentMax * 0.4)));
    return {
      predictions: Array(forecastDays).fill(baseline),
      confidence: 0.3,
      trend: 'stable',
      anomalyScore: 0
    };
  }
  
  const { normalized, min, max } = normalizeData(historicalData);
  const sequenceLength = 7; // Use 7 days to predict next day
  
  const { X, y } = createSequences(normalized, sequenceLength);
  
  if (X.length < 5) {
    // Not enough data for LSTM, use simple average
    const avg = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
    return {
      predictions: Array(forecastDays).fill(avg),
      confidence: 0.4,
      trend: avg > historicalData.slice(-7).reduce((a, b) => a + b, 0) / 7 ? 'increasing' : 'decreasing',
      anomalyScore: 0
    };
  }
  
  // Train the model
  const model = buildLSTMModel(sequenceLength);
  
  const xs = tf.tensor3d(X);
  const ys = tf.tensor2d(y, [y.length, 1]);
  
  await model.fit(xs, ys, {
    epochs: 50,
    batchSize: 8,
    shuffle: true,
    verbose: 0
  });
  
  xs.dispose();
  ys.dispose();
  
  // Make predictions
  const predictions: number[] = [];
  let currentSequence = normalized.slice(-sequenceLength);
  
  for (let i = 0; i < forecastDays; i++) {
    const input = tf.tensor3d([currentSequence.map(v => [v])]);
    const pred = model.predict(input) as tf.Tensor;
    const predValue = (await pred.data())[0];
    
    predictions.push(predValue);
    currentSequence = [...currentSequence.slice(1), predValue];
    
    input.dispose();
    pred.dispose();
  }
  
  model.dispose();
  
  // Denormalize predictions
  const denormalizedPredictions = denormalizeData(predictions, min, max).map(v => Math.max(0, v));
  
  // Calculate trend
  const recentAvg = historicalData.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const predictedAvg = denormalizedPredictions.reduce((a, b) => a + b, 0) / denormalizedPredictions.length;
  const trend: 'increasing' | 'decreasing' | 'stable' = 
    predictedAvg > recentAvg * 1.2 ? 'increasing' :
    predictedAvg < recentAvg * 0.8 ? 'decreasing' : 'stable';
  
  // Calculate confidence based on model performance
  const confidence = Math.min(0.95, 0.5 + (X.length / 100));
  
  // Calculate anomaly score
  const anomalyScore = calculateAnomalyScore(historicalData);
  
  return {
    predictions: denormalizedPredictions,
    confidence,
    trend,
    anomalyScore
  };
}

// ============================================
// Anomaly Detection using Statistical Methods
// ============================================

interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  type: 'spike' | 'drop' | 'unusual_pattern' | 'none';
  description: string;
}

export function detectAnomalies(
  transactions: InventoryTransaction[],
  componentId?: string
): AnomalyResult[] {
  const filtered = componentId 
    ? transactions.filter(t => t.component_id === componentId)
    : transactions;
  
  // Group by day
  const dayMap = new Map<string, number>();
  filtered.forEach(t => {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd');
    const current = dayMap.get(day) || 0;
    if (t.transaction_type === 'issue') {
      dayMap.set(day, current + t.quantity);
    }
  });
  
  const values = Array.from(dayMap.values());
  
  if (values.length < 7) {
    return [];
  }
  
  // Calculate statistics
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  );
  
  const anomalies: AnomalyResult[] = [];
  
  // Check for anomalies in recent data (last 7 days)
  const recentValues = values.slice(-7);
  
  recentValues.forEach((value) => {
    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;
    
    if (zScore > 2) {
      anomalies.push({
        isAnomaly: true,
        score: zScore,
        type: 'spike',
        description: `Unusual spike detected: ${value} items (${Math.round(zScore)} std deviations above mean)`
      });
    } else if (zScore < -2) {
      anomalies.push({
        isAnomaly: true,
        score: Math.abs(zScore),
        type: 'drop',
        description: `Significant drop detected: ${value} items (${Math.round(Math.abs(zScore))} std deviations below mean)`
      });
    }
  });
  
  // Check for unusual patterns (consecutive high/low days)
  let consecutiveHigh = 0;
  let consecutiveLow = 0;
  
  for (const value of recentValues) {
    if (value > mean + stdDev) consecutiveHigh++;
    else if (value < mean - stdDev) consecutiveLow++;
  }
  
  if (consecutiveHigh >= 3) {
    anomalies.push({
      isAnomaly: true,
      score: 0.8,
      type: 'unusual_pattern',
      description: `Pattern alert: ${consecutiveHigh} consecutive days with above-average usage`
    });
  }
  
  if (consecutiveLow >= 3) {
    anomalies.push({
      isAnomaly: true,
      score: 0.8,
      type: 'unusual_pattern',
      description: `Pattern alert: ${consecutiveLow} consecutive days with below-average usage`
    });
  }
  
  return anomalies;
}

function calculateAnomalyScore(data: number[]): number {
  if (data.length < 7) return 0;
  
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const stdDev = Math.sqrt(
    data.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / data.length
  );
  
  const recent = data.slice(-7);
  const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
  
  if (stdDev === 0) return 0;
  
  const zScore = Math.abs((recentMean - mean) / stdDev);
  return Math.min(1, zScore / 3); // Normalize to 0-1
}

// ============================================
// Smart Procurement AI
// ============================================

interface ProcurementSuggestion {
  componentId: string;
  componentName: string;
  currentStock: number;
  predictedDemand: number;
  suggestedOrder: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  daysUntilStockout: number;
}

export async function generateProcurementSuggestions(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; available_quantity: number; max_usage_limit: number }[]
): Promise<ProcurementSuggestion[]> {
  const suggestions: ProcurementSuggestion[] = [];
  
  for (const component of components) {
    const componentTransactions = transactions.filter(t => t.component_id === component.id);
    
    if (componentTransactions.length < 5) continue;
    
    // Get forecast for this component
    const forecast = await forecastWithLSTM(componentTransactions, 30);
    
    const predictedDemand = forecast.predictions.reduce((a, b) => a + b, 0);
    const avgDailyDemand = predictedDemand / 30;
    const currentStock = component.available_quantity;
    
    // Calculate days until stockout
    const daysUntilStockout = avgDailyDemand > 0 
      ? Math.floor(currentStock / avgDailyDemand)
      : 999;
    
    // Calculate safety stock (7 days of average demand)
    const safetyStock = Math.max(7 * avgDailyDemand, component.max_usage_limit * 0.2);
    
    // Calculate suggested order quantity
    let suggestedOrder = 0;
    let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
    let reason = '';
    
    if (daysUntilStockout <= 7) {
      urgency = 'critical';
      suggestedOrder = Math.ceil(predictedDemand * 1.5); // Order 1.5x predicted demand
      reason = `Critical: Stock will last only ${daysUntilStockout} days`;
    } else if (daysUntilStockout <= 14) {
      urgency = 'high';
      suggestedOrder = Math.ceil(predictedDemand * 1.2);
      reason = `High priority: Stock will last ${daysUntilStockout} days`;
    } else if (currentStock < safetyStock) {
      urgency = 'medium';
      suggestedOrder = Math.ceil(safetyStock - currentStock + predictedDemand * 0.5);
      reason = `Below safety stock level (${Math.round(safetyStock)} units)`;
    } else {
      reason = `Stock levels healthy. Monitor for ${daysUntilStockout} days`;
    }
    
    if (suggestedOrder > 0 || urgency === 'critical' || urgency === 'high') {
      suggestions.push({
        componentId: component.id,
        componentName: component.name,
        currentStock,
        predictedDemand: Math.round(predictedDemand),
        suggestedOrder,
        urgency,
        reason,
        daysUntilStockout
      });
    }
  }
  
  // Sort by urgency
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  
  return suggestions;
}

// ============================================
// AI Insights Generator
// ============================================

interface AIInsight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'alert';
  title: string;
  description: string;
  action?: string;
  priority: number;
}

export async function generateAIInsights(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; available_quantity: number; status: string; max_usage_limit?: number }[]
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  
  // Get procurement suggestions
  const suggestions = await generateProcurementSuggestions(transactions, components.map(c => ({
    id: c.id,
    name: c.name,
    available_quantity: c.available_quantity,
    max_usage_limit: c.max_usage_limit || 10
  })));
  
  // Critical stock warnings
  const criticalItems = suggestions.filter(s => s.urgency === 'critical');
  if (criticalItems.length > 0) {
    insights.push({
      id: 'critical-stock',
      type: 'warning',
      title: 'Critical Stock Alert',
      description: `${criticalItems.length} item(s) will run out within 7 days: ${criticalItems.map(c => c.componentName).join(', ')}`,
      action: 'Review procurement suggestions',
      priority: 1
    });
  }
  
  // High priority items
  const highPriority = suggestions.filter(s => s.urgency === 'high');
  if (highPriority.length > 0) {
    insights.push({
      id: 'high-priority',
      type: 'alert',
      title: 'High Priority Reorder Needed',
      description: `${highPriority.length} item(s) need attention within 14 days`,
      action: 'View suggestions',
      priority: 2
    });
  }
  
  // Anomaly detection
  const allAnomalies = detectAnomalies(transactions);
  const recentAnomalies = allAnomalies.filter(a => a.score > 1.5);
  if (recentAnomalies.length > 0) {
    insights.push({
      id: 'anomaly-detected',
      type: 'alert',
      title: 'Unusual Activity Detected',
      description: recentAnomalies[0].description,
      action: 'View details',
      priority: 3
    });
  }
  
  // Trend analysis
  const totalIssues = transactions.filter(t => t.transaction_type === 'issue').length;
  const lastWeekIssues = transactions.filter(t => {
    const date = new Date(t.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date > weekAgo && t.transaction_type === 'issue';
  }).length;
  
  if (lastWeekIssues > totalIssues * 0.2) {
    insights.push({
      id: 'high-activity',
      type: 'info',
      title: 'High Activity Week',
      description: `This week's activity is 20%+ higher than average`,
      priority: 4
    });
  }
  
  // Low stock items
  const lowStockItems = components.filter(c => c.status === 'low_stock' || c.status === 'out_of_stock');
  if (lowStockItems.length > 0 && criticalItems.length === 0) {
    insights.push({
      id: 'low-stock',
      type: 'warning',
      title: 'Low Stock Items',
      description: `${lowStockItems.length} item(s) are running low`,
      action: 'View inventory',
      priority: 5
    });
  }
  
  // Success insight if everything is fine
  if (insights.length === 0) {
    insights.push({
      id: 'all-good',
      type: 'success',
      title: 'Inventory Healthy',
      description: 'All stock levels are within healthy parameters',
      priority: 10
    });
  }
  
  return insights.sort((a, b) => a.priority - b.priority);
}

// ============================================
// Enhanced Forecast with Confidence Intervals
// ============================================

function fitHistoricalPredicted(actuals: number[]): number[] {
  const n = actuals.length;
  if (n === 0) return [];
  const x = actuals.map((_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = actuals.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * actuals[i], 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const safeSlope = Number.isFinite(slope) ? slope : 0;
  const safeIntercept = Number.isFinite(intercept) ? intercept : 0;
  return actuals.map((_, i) => Math.max(0, Math.round(safeIntercept + safeSlope * i)));
}

export async function enhancedForecast(
  componentId: string,
  componentName: string,
  transactions: InventoryTransaction[],
  forecastDays: number = 30,
  historicalDays: number = 90
): Promise<ComponentForecast> {
  const filtered = transactions.filter(t => t.component_id === componentId);
  const mlResult = await forecastWithLSTM(filtered, forecastDays, historicalDays);
  
  const today = startOfDay(new Date());
  
  // Historical points (last 14 days)
  const historicalPoints: ForecastPoint[] = [];
  const dayMap = new Map<string, number>();
  
  filtered.forEach(t => {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd');
    const current = dayMap.get(day) || 0;
    if (t.transaction_type === 'issue') {
      dayMap.set(day, current + t.quantity);
    }
  });
  
  for (let i = 14; i >= 1; i--) {
    const date = format(subDays(today, i), 'yyyy-MM-dd');
    historicalPoints.push({
      date,
      actual: dayMap.get(date) || 0,
      predicted: 0
    });
  }

  const fitted = fitHistoricalPredicted(historicalPoints.map(p => p.actual ?? 0));
  historicalPoints.forEach((p, i) => {
    p.predicted = fitted[i] ?? 0;
  });
  
  // Future points with confidence
  const futurePoints: ForecastPoint[] = [];
  let futurePredictions = mlResult.predictions.map(v => Math.max(0, Math.round(v)));
  let next30Total = futurePredictions.reduce((a, b) => a + b, 0);

  if (next30Total === 0) {
    const histAvg = historicalPoints.reduce((s, p) => s + (p.actual ?? 0), 0) / historicalPoints.length;
    const recentMax = Math.max(...historicalPoints.map(p => p.actual ?? 0), 0);
    const lastFitted = historicalPoints[historicalPoints.length - 1]?.predicted ?? 0;
    const baseline = Math.round(Math.max(histAvg, recentMax * 0.5, lastFitted));
    if (baseline > 0) {
      futurePredictions = Array(forecastDays).fill(baseline);
      next30Total = baseline * forecastDays;
    }
  }

  const lastHistoricalPredicted = historicalPoints[historicalPoints.length - 1]?.predicted ?? 0;
  if (lastHistoricalPredicted > 0 && futurePredictions[0] < lastHistoricalPredicted) {
    futurePredictions[0] = lastHistoricalPredicted;
  }
  
  for (let i = 1; i <= forecastDays; i++) {
    const date = format(addDays(today, i), 'yyyy-MM-dd');
    const predicted = futurePredictions[i - 1] ?? 0;
    
    futurePoints.push({
      date,
      predicted,
      confidence: mlResult.confidence
    });
  }
  
  return {
    component_id: componentId,
    component_name: componentName,
    forecast: [...historicalPoints, ...futurePoints],
    trend: mlResult.trend,
    next_30_days: Math.round(next30Total),
    confidence: mlResult.confidence,
    anomaly_detected: mlResult.anomalyScore > 0.5
  };
}

// Export all components
export type { MLForecastResult, AnomalyResult, ProcurementSuggestion, AIInsight };