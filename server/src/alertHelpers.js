const VENDOR_BY_CATEGORY = {
  Microcontrollers: 'Tech Components Hub, Bangalore',
  Sensors: 'Sensor World, Hyderabad',
  Power: 'Power Electronics Ltd, Pune',
  Accessories: 'IoT Supplies Co, Chennai',
  default: 'Tech Components Hub, Bangalore',
};

const pickVendor = (category) =>
  VENDOR_BY_CATEGORY[category] || VENDOR_BY_CATEGORY.default;

const estimateWeeklyDemand = (component, lowThreshold) => {
  const usageLimit = Number(component.max_usage_limit) || 10;
  const usageCount = Number(component.usage_count) || 0;
  const fromUsage = Math.ceil(usageLimit * 0.5 + usageCount * 0.1);
  return Math.max(lowThreshold, fromUsage, 12);
};

const recommendOrderQuantity = (available, lowThreshold, weeklyDemand) => {
  const target = Math.max(lowThreshold * 2, weeklyDemand * 2);
  return Math.max(1, target - available);
};

/**
 * Build low-stock, shortage, and purchase-recommendation payloads from component rows.
 * @param {Array<Record<string, unknown>>} components
 */
export function buildInventoryAlertsFromComponents(components = []) {
  const low_stock_alerts = [];
  const shortage_alerts = [];
  const purchase_recommendations = [];

  for (const component of components) {
    const name = component.name;
    if (!name) continue;

    const available = Number(component.available_quantity) || 0;
    const total = Number(component.total_quantity) || 0;
    const lowThreshold = Math.max(1, Math.ceil(total * 0.2));
    const predictedWeeklyDemand = estimateWeeklyDemand(component, lowThreshold);
    const suggestedVendor = pickVendor(component.category);
    const unitCost = Number(component.unit_cost) || 0;
    const isOutOfStock = available === 0 || component.status === 'out_of_stock';
    const isLowStock =
      !isOutOfStock &&
      (component.status === 'low_stock' || available <= lowThreshold);

    if (isOutOfStock) {
      const orderQty = Math.max(predictedWeeklyDemand * 2, lowThreshold * 3, 10);
      shortage_alerts.push({
        componentName: name,
        category: component.category || 'General',
        currentStock: available,
        courseName: component.course_name || null,
        urgency: 'critical',
        suggestedVendor,
      });
      purchase_recommendations.push({
        componentName: name,
        quantityToOrder: orderQty,
        estimatedCost: Number((orderQty * unitCost).toFixed(2)),
        suggestedVendor,
        reason: `Out of stock — urgent restock needed${component.course_name ? ` for ${component.course_name}` : ''}.`,
      });
      continue;
    }

    if (isLowStock) {
      low_stock_alerts.push({
        componentName: name,
        currentStock: available,
        minimumRequired: lowThreshold,
        predictedWeeklyDemand,
        suggestedVendor,
      });

      const orderQty = recommendOrderQuantity(available, lowThreshold, predictedWeeklyDemand);
      purchase_recommendations.push({
        componentName: name,
        quantityToOrder: orderQty,
        estimatedCost: Number((orderQty * unitCost).toFixed(2)),
        suggestedVendor,
        reason: `Below safety stock (${available}/${lowThreshold}) — forecasted weekly demand: ${predictedWeeklyDemand} units.`,
      });
    }
  }

  const purchase_reason =
    purchase_recommendations.length > 0
      ? `Automated procurement suggestions for ${purchase_recommendations.length} component(s) based on current stock and usage forecasts.`
      : '';

  return {
    low_stock_alerts,
    shortage_alerts,
    purchase_recommendations,
    purchase_reason,
  };
}
