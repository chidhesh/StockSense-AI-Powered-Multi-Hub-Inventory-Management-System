import { query } from './server/src/config/db.js';
import { format, subDays, startOfDay } from 'date-fns';

// Minimal implementation of the forecasting logic for accuracy checking
function linearRegression(x, y) {
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

async function checkSystemAccuracy() {
  try {
    console.log('--- Inventory Forecasting Accuracy Report ---');
    
    const { rows: components } = await query('SELECT id, name FROM components');
    const { rows: transactions } = await query('SELECT * FROM inventory_transactions WHERE transaction_type = \'issue\'');
    
    if (transactions.length === 0) {
      console.log('No issue transactions found. Accuracy cannot be calculated yet.');
      process.exit(0);
    }

    let totalSystemAccuracy = 0;
    let componentsWithData = 0;

    for (const comp of components) {
      const compTxs = transactions.filter(t => t.component_id === comp.id);
      if (compTxs.length < 5) continue; // Skip items with too little data

      const dayMap = new Map();
      compTxs.forEach(t => {
        const day = format(new Date(t.created_at), 'yyyy-MM-dd');
        dayMap.set(day, (dayMap.get(day) || 0) + t.quantity);
      });

      const today = startOfDay(new Date());
      const x = [];
      const y = [];
      const actuals = [];

      // Use last 30 days for testing accuracy
      for (let i = 30; i >= 0; i--) {
        const date = format(subDays(today, i), 'yyyy-MM-dd');
        const actual = dayMap.get(date) || 0;
        x.push(30 - i);
        y.push(actual);
        actuals.push(actual);
      }

      const { slope, intercept } = linearRegression(x, y);
      
      let sumError = 0;
      let count = 0;

      for (let i = 0; i < x.length; i++) {
        const predicted = Math.max(0, Math.round(intercept + slope * i));
        const actual = actuals[i];
        
        if (actual > 0) {
          sumError += Math.abs(actual - predicted) / actual;
          count++;
        }
      }

      if (count > 0) {
        const mape = (sumError / count) * 100;
        const accuracy = Math.max(0, 100 - mape);
        totalSystemAccuracy += accuracy;
        componentsWithData++;
        console.log(`- ${comp.name.padEnd(25)}: ${accuracy.toFixed(2)}% Accuracy`);
      }
    }

    if (componentsWithData > 0) {
      const finalAccuracy = totalSystemAccuracy / componentsWithData;
      console.log('\n-------------------------------------------');
      console.log(`OVERALL SYSTEM ACCURACY: ${finalAccuracy.toFixed(2)}%`);
      console.log(`(Based on ${componentsWithData} active components)`);
      console.log('-------------------------------------------');
    } else {
      console.log('Not enough historical data to calculate accuracy for any component.');
    }

  } catch (error) {
    console.error('Error calculating accuracy:', error);
  } finally {
    process.exit(0);
  }
}

checkSystemAccuracy();
