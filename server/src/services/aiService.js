import pool from "../config/db.js";
import qrcode from "qrcode";

// ==============================================
// Step 1: Demand Forecasting (XGBoost-like Regressor)
// ==============================================
export async function forecastDemand(componentId, centerId) {
  try {
    // Get historical transaction data
    const result = await pool.query(
      `SELECT
        DATE_TRUNC('month', created_at) as month,
        SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END) as issues,
        SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END) as returns
       FROM inventory_transactions
       WHERE component_id = $1 AND center_id = $2
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC
       LIMIT 12`,
      [componentId, centerId]
    );

    const data = result.rows;

    if (data.length < 2) {
      return {
        forecastQuantity: 10, // default if no data
        confidenceScore: 0.6,
        forecastDate: new Date(),
        historicalData: data,
      };
    }

    const netUsage = data.map(row => row.issues - row.returns);
    const averageUsage = netUsage.reduce((sum, val) => sum + val, 0) / netUsage.length;

    const forecastQuantity = Math.max(1, Math.ceil(averageUsage * 1.5));
    const confidenceScore = Math.min(0.95, 0.5 + (data.length * 0.05));

    return {
      forecastQuantity,
      confidenceScore,
      forecastDate: new Date(),
      historicalData: data,
    };
  } catch (err) {
    console.error("Forecast demand error:", err);
    return {
      forecastQuantity: 10,
      confidenceScore: 0.5,
      forecastDate: new Date(),
      historicalData: [],
    };
  }
}

// ==============================================
// Step 2: Transfer vs Purchase Decision (Random Forest-like Classifier)
// ==============================================
export async function decideTransferOrPurchase(componentId, centerId, requiredQuantity) {
  try {
    // First get the component name for display, and get all same components by component_id across all hubs
    const componentResult = await pool.query(
      "SELECT name, unit_cost, min_stock_threshold FROM components WHERE id = $1",
      [componentId]
    );

    const component = componentResult.rows[0];
    if (!component) {
      throw new Error(`Component with id ${componentId} not found`);
    }

    const unitCost = component.unit_cost || 100;
    const componentName = component.name;
    const safetyStock = component.min_stock_threshold || 10;

    // Get ALL hubs with this component (not just those with excess), by component name (same component type)
    // Important: We fetch all hubs that have this component type, regardless of current stock level
    const allHubStockResult = await pool.query(
      `SELECT
        c.id as center_id,
        c.name as center_name,
        comp.available_quantity as current_stock,
        COALESCE(comp.min_stock_threshold, $1) as safety_stock,
        GREATEST(0, comp.available_quantity - COALESCE(comp.min_stock_threshold, $1)) as transferable
       FROM components comp
       JOIN centers c ON comp.center_id = c.id
       WHERE comp.name = $2
         AND comp.center_id != $3
       ORDER BY center_name`,
      [safetyStock, componentName, centerId]
    );

    const allHubStock = allHubStockResult.rows;
    const totalTransferable = allHubStock.reduce((sum, hub) => sum + hub.transferable, 0);

    // Calculate decision
    let decisionType, confidenceScore, reason;

    if (totalTransferable >= requiredQuantity) {
      decisionType = "TRANSFER";
      confidenceScore = 0.9;
      reason = "Enough stock exists in other hubs.";
    } else {
      decisionType = "PURCHASE";
      confidenceScore = 0.85;
      reason = `Total transferable stock (${totalTransferable}) is less than required quantity (${requiredQuantity}).`;
    }

    // Prepare debug info
    const debugInfo = {
      component: componentName,
      required: requiredQuantity,
      hubAnalysis: allHubStock.map(hub => ({
        centerName: hub.center_name,
        currentStock: hub.current_stock,
        safetyStock: hub.safety_stock,
        transferable: hub.transferable
      })),
      totalTransferable,
      decision: decisionType,
      reason
    };

    // Return availableExcess for backwards compatibility, and debug info
    const availableExcess = allHubStock.filter(hub => hub.transferable > 0).map(hub => ({
      center_id: hub.center_id,
      center_name: hub.center_name,
      available_quantity: hub.current_stock,
      min_stock_threshold: hub.safety_stock,
      excess_stock: hub.transferable
    }));

    return {
      decisionType,
      confidenceScore,
      reason,
      availableExcess,
      debugInfo
    };
  } catch (err) {
    console.error("Decision error:", err);
    throw err; // Re-throw instead of defaulting to purchase
  }
}

// ==============================================
// Step 3: Transfer Allocation Engine (Greedy Allocation)
// ==============================================
export async function allocateTransfers(availableExcess, requiredQuantity, componentId, destinationCenterId) {
  const allocationPlan = [];
  let remaining = requiredQuantity;

  // Sort by most excess first
  const sortedExcess = [...availableExcess].sort((a, b) => b.excess_stock - a.excess_stock);

  for (const source of sortedExcess) {
    if (remaining <= 0) break;

    const transferAmount = Math.min(source.excess_stock, remaining);
    allocationPlan.push({
      sourceHubId: source.center_id,
      source_hub_id: source.center_id,
      sourceHubName: source.center_name,
      source_hub_name: source.center_name,
      destinationHubId: destinationCenterId,
      destination_hub_id: destinationCenterId,
      componentId,
      component_id: componentId,
      transferQuantity: transferAmount,
      transfer_quantity: transferAmount,
    });

    remaining -= transferAmount;
  }

  return {
    allocationPlan,
    totalTransferred: requiredQuantity - remaining,
    remainingToPurchase: remaining,
  };
}

// ==============================================
// Step 4: QR Code Generation
// ==============================================
export async function generateQRCode(data) {
  try {
    const qrString = JSON.stringify(data);
    const qrDataUrl = await qrcode.toDataURL(qrString);
    return qrDataUrl;
  } catch (err) {
    console.error("QR code generation error:", err);
    return null;
  }
}

export default {
  forecastDemand,
  decideTransferOrPurchase,
  allocateTransfers,
  generateQRCode,
};
