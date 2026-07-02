import { InventoryTransaction, ForecastPoint, ComponentForecast } from '../types';
import { format, subDays, addDays, startOfDay } from 'date-fns';

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept };
}

function groupByDay(transactions: InventoryTransaction[]): Map<string, number> {
  const map = new Map<string, number>();
  transactions.forEach(t => {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd');
    const current = map.get(day) || 0;
    if (t.transaction_type === 'issue') {
      map.set(day, current + t.quantity);
    } else if (t.transaction_type === 'return') {
      // Net demand decreases when items are returned
      map.set(day, Math.max(0, current - t.quantity));
    }
  });
  return map;
}

export function forecastDemand(
  componentId: string,
  componentName: string,
  transactions: InventoryTransaction[],
  forecastDays = 30
): ComponentForecast {
  const filtered = transactions.filter(t => t.component_id === componentId);
  const dayMap = groupByDay(filtered);

  const today = startOfDay(new Date());
  const historicalPoints: ForecastPoint[] = [];
  const x: number[] = [];
  const y: number[] = [];
  
  // Calculate last 30 days total historical usage
  let historical30Days = 0;
  for (let i = 30; i >= 1; i--) {
    const date = format(subDays(today, i), 'yyyy-MM-dd');
    historical30Days += dayMap.get(date) || 0;
  }

  for (let i = 60; i >= 0; i--) {
    const date = format(subDays(today, i), 'yyyy-MM-dd');
    const actual = dayMap.get(date) || 0;
    historicalPoints.push({ date, actual, predicted: 0 });
    x.push(60 - i);
    y.push(actual);
  }

  const { slope, intercept } = linearRegression(x, y);

  historicalPoints.forEach((p, i) => {
    p.predicted = Math.max(0, Math.round(intercept + slope * i));
  });

  const futurePoints: ForecastPoint[] = [];
  let next30Total = 0;

  for (let i = 1; i <= forecastDays; i++) {
    const date = format(addDays(today, i), 'yyyy-MM-dd');
    const predicted = Math.max(0, Math.round(intercept + slope * (60 + i)));
    next30Total += predicted;
    futurePoints.push({ date, predicted });
  }

  const trend: ComponentForecast['trend'] =
    slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';

  return {
    component_id: componentId,
    component_name: componentName,
    forecast: [...historicalPoints.slice(-14), ...futurePoints],
    trend,
    next_30_days: next30Total,
    historical_30_days: historical30Days,
  };
}

export function forecastAllComponents(
  transactions: InventoryTransaction[],
  components: { id: string; name: string }[]
): ComponentForecast[] {
  return components.map(c =>
    forecastDemand(c.id, c.name, transactions)
  );
}

export function calculateAccuracy(forecast: ForecastPoint[]): number {
  const withActual = forecast.filter(p => p.actual !== undefined && p.actual !== null);
  if (withActual.length === 0) return 0;

  const mape = withActual.reduce((sum, p) => {
    if (p.actual === 0) return sum;
    return sum + Math.abs((p.actual! - p.predicted) / p.actual!) * 100;
  }, 0) / withActual.length;

  return Math.max(0, Math.round(100 - mape));
}
