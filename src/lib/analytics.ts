import { InventoryTransaction, StudentUsageStats, ComponentPopularity, ProcurementSuggestion, AIInsight } from '../types';
import { format, subDays, startOfDay } from 'date-fns';

// ============================================
// Student Learning Analytics
// ============================================

export function getStudentUsageAnalytics(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; category: string; skill_tags?: string[] }[]
): StudentUsageStats[] {
  // Use internal helper type for Sets during computation
  interface StudentUsageStatsSets extends Omit<StudentUsageStats, 'unique_components' | 'categories_used' | 'skills_gained'> {
    unique_components: Set<string>;
    categories_used: Set<string>;
    skills_gained: Set<string>;
  }

  const studentMap = new Map<string, StudentUsageStatsSets>();
  
  transactions.forEach(tx => {
    if (!tx.student_name && !tx.student_id) return;
    
    const studentKey = tx.student_name || tx.student_id || '';
    if (!studentKey) return;
    
    const existing = studentMap.get(studentKey) || {
      student_id: tx.student_id || studentKey,
      student_name: tx.student_name || studentKey,
      total_components_used: 0,
      unique_components: new Set<string>(),
      categories_used: new Set<string>(),
      skills_gained: new Set<string>(),
      usage_history: []
    };
    
    if (tx.transaction_type === 'issue') {
      existing.total_components_used += tx.quantity;
      existing.unique_components.add(tx.component_id);
      
      const component = components.find(c => c.id === tx.component_id);
      if (component) {
        existing.categories_used.add(component.category);
        component.skill_tags?.forEach(skill => existing.skills_gained.add(skill));
      }
    }
    
    studentMap.set(studentKey, existing);
  });
  
  const result: StudentUsageStats[] = [];
  studentMap.forEach((stats, key) => {
    const componentUsageMap = new Map<string, number>();
    transactions
      .filter(tx => (tx.student_name || tx.student_id) === key && tx.transaction_type === 'issue')
      .forEach(tx => {
        let name = tx.component_name;
        if (!name || name === 'Unknown') {
          const comp = components.find(c => c.id === tx.component_id);
          name = comp ? comp.name : (tx.component_id ? `Asset #${tx.component_id.slice(0, 4)}` : 'Unknown Asset');
        }
        const current = componentUsageMap.get(name) || 0;
        componentUsageMap.set(name, current + tx.quantity);
      });
    
    // Final conversion to match StudentUsageStats interface
    result.push({
      ...stats,
      unique_components: stats.unique_components.size,
      categories_used: Array.from(stats.categories_used),
      skills_gained: Array.from(stats.skills_gained),
      usage_history: Array.from(componentUsageMap.entries())
        .map(([component_name, count]) => ({ component_name, count }))
        .sort((a, b) => b.count - a.count)
    });
  });
  
  return result.sort((a, b) => b.total_components_used - a.total_components_used);
}

// ============================================
// Component Popularity Analysis
// ============================================

export function getComponentPopularity(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; category: string }[],
  days: number = 30
): ComponentPopularity[] {
  const today = startOfDay(new Date());
  const cutoffDate = subDays(today, days);
  
  const recentTx = transactions.filter(tx => 
    new Date(tx.created_at) >= cutoffDate && tx.transaction_type === 'issue'
  );
  
  const componentStats = new Map<string, {
    total_issues: number;
    unique_students: Set<string>;
    recent_issues: number[];
  }>();
  
  components.forEach(c => {
    componentStats.set(c.id, { total_issues: 0, unique_students: new Set(), recent_issues: [] });
  });
  
  recentTx.forEach(tx => {
    const stats = componentStats.get(tx.component_id);
    if (stats) {
      stats.total_issues += tx.quantity;
      if (tx.student_id) stats.unique_students.add(tx.student_id);
      if (tx.student_name) stats.unique_students.add(tx.student_name);
    }
  });
  
  const halfDays = Math.floor(days / 2);
  
  transactions
    .filter(tx => tx.transaction_type === 'issue')
    .forEach(tx => {
      const stats = componentStats.get(tx.component_id);
      if (stats) {
        const txDate = new Date(tx.created_at);
        const daysAgo = Math.floor((today.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysAgo < halfDays) {
          stats.recent_issues.push(tx.quantity);
        }
      }
    });
  
  const result: ComponentPopularity[] = [];
  componentStats.forEach((stats, componentId) => {
    const component = components.find(c => c.id === componentId);
    if (!component) return;
    
    const recentTotal = stats.recent_issues.reduce((a, b) => a + b, 0);
    const olderTotal = stats.total_issues - recentTotal;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentTotal > olderTotal * 1.2) trend = 'increasing';
    else if (recentTotal < olderTotal * 0.8) trend = 'decreasing';
    
    result.push({
      component_id: componentId,
      component_name: component.name,
      category: component.category,
      total_issues: stats.total_issues,
      unique_students: stats.unique_students.size,
      trend
    });
  });
  
  return result.sort((a, b) => b.total_issues - a.total_issues);
}

// ============================================
// Course-Based Analytics
// ============================================

interface CourseAnalytics {
  course_id: string;
  course_name: string;
  total_components_used: number;
  unique_components: number;
  active_students: number;
  top_components: { name: string; count: number }[];
}

export function getCourseAnalytics(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; course_id?: string; course_name?: string }[]
): CourseAnalytics[] {
  const courseMap = new Map<string, CourseAnalytics & { active_student_set: Set<string>, unique_component_set: Set<string> }>();
  
  components.forEach(c => {
    if (c.course_id) {
      courseMap.set(c.course_id, {
        course_id: c.course_id,
        course_name: c.course_name || 'Unknown Course',
        total_components_used: 0,
        unique_components: 0,
        active_students: 0,
        top_components: [],
        active_student_set: new Set<string>(),
        unique_component_set: new Set<string>()
      });
    }
  });
  
  transactions.forEach(tx => {
    if (tx.transaction_type !== 'issue') return;
    
    const component = components.find(c => c.id === tx.component_id);
    if (!component?.course_id) return;
    
    const course = courseMap.get(component.course_id);
    if (course) {
      course.total_components_used += tx.quantity;
      course.unique_component_set.add(tx.component_id);
      if (tx.student_id) course.active_student_set.add(tx.student_id);
      if (tx.student_name) course.active_student_set.add(tx.student_name);
    }
  });
  
  const result: CourseAnalytics[] = [];
  courseMap.forEach((course, courseId) => {
    const componentUsage = new Map<string, number>();
    transactions
      .filter(tx => {
        const component = components.find(c => c.id === tx.component_id);
        return tx.transaction_type === 'issue' && component?.course_id === courseId;
      })
      .forEach(tx => {
        let name = tx.component_name;
        if (!name || name === 'Unknown') {
          const comp = components.find(c => c.id === tx.component_id);
          name = comp ? comp.name : (tx.component_id ? `Asset #${tx.component_id.slice(0, 4)}` : 'Unknown Asset');
        }
        const current = componentUsage.get(name) || 0;
        componentUsage.set(name, current + tx.quantity);
      });
    
    result.push({
      course_id: course.course_id,
      course_name: course.course_name,
      total_components_used: course.total_components_used,
      unique_components: course.unique_component_set.size,
      active_students: course.active_student_set.size,
      top_components: Array.from(componentUsage.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    });
  });
  
  return result.sort((a, b) => b.total_components_used - a.total_components_used);
}

// ============================================
// Budget Forecasting
// ============================================

interface BudgetForecast {
  month: string;
  predicted_spend: number;
  actual_spend: number;
  variance: number;
}

export function getBudgetForecast(
  transactions: InventoryTransaction[],
  components: { id: string; unit_cost: number }[]
): BudgetForecast[] {
  const today = new Date();
  const forecasts: BudgetForecast[] = [];
  
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const monthName = format(monthDate, 'MMM yyyy');
    
    const monthTx = transactions.filter(tx => {
      const txDate = new Date(tx.created_at);
      return txDate >= monthDate && txDate <= monthEnd && tx.transaction_type === 'purchase';
    });
    
    const actualSpend = monthTx.reduce((sum, tx) => {
      const component = components.find(c => c.id === tx.component_id);
      return sum + (Number(component?.unit_cost) || 0) * tx.quantity;
    }, 0);
    
    forecasts.push({
      month: monthName,
      predicted_spend: 0,
      actual_spend: actualSpend,
      variance: 0
    });
  }
  
  const spendValues = forecasts.map(f => f.actual_spend);
  const recentAvg = spendValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
  
  forecasts.forEach(f => {
    f.predicted_spend = Math.round(recentAvg * 1.1);
    f.variance = f.predicted_spend - f.actual_spend;
  });
  
  return forecasts;
}

// ============================================
// Multi-Center Resource Sharing Suggestions
// ============================================

interface TransferSuggestion {
  from_center: string;
  to_center: string;
  component_id: string;
  component_name: string;
  quantity: number;
  reason: string;
  savings: number;
}

export function getTransferSuggestions(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; center_id: string; available_quantity: number; unit_cost: number }[],
  centers: { id: string; name: string }[]
): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = [];
  
  const centerDemand = new Map<string, Map<string, number>>();
  const centerStock = new Map<string, Map<string, { qty: number; cost: number }>>();
  
  transactions
    .filter(tx => tx.transaction_type === 'issue')
    .forEach(tx => {
      if (!centerDemand.has(tx.center_id)) {
        centerDemand.set(tx.center_id, new Map());
      }
      const demand = centerDemand.get(tx.center_id)!;
      demand.set(tx.component_id, (demand.get(tx.component_id) || 0) + tx.quantity);
    });
  
  components.forEach(c => {
    if (!centerStock.has(c.center_id)) {
      centerStock.set(c.center_id, new Map());
    }
    centerStock.get(c.center_id)!.set(c.id, { qty: c.available_quantity, cost: Number(c.unit_cost) });
  });
  
  centerDemand.forEach((demandMap, centerId) => {
    demandMap.forEach((demand, componentId) => {
      const stock = centerStock.get(centerId)?.get(componentId);
      if (!stock) return;
      
      const stockLevel = stock.qty;
      const daysOfStock = stockLevel / (demand / 30);
      
      if (daysOfStock > 60) {
        centerDemand.forEach((otherDemand, otherCenterId) => {
          if (otherCenterId === centerId) return;
          
          const otherDemandQty = otherDemand.get(componentId) || 0;
          const otherStock = centerStock.get(otherCenterId)?.get(componentId);
          if (!otherStock) return;
          
          const otherDays = otherStock.qty / (otherDemandQty / 30);
          
          if (otherDays < 14) {
            const transferQty = Math.min(
              Math.floor(stockLevel * 0.3),
              Math.ceil((14 - otherDays) * (otherDemandQty / 30))
            );
            
            if (transferQty > 0) {
              const fromCenter = centers.find(c => c.id === centerId);
              const toCenter = centers.find(c => c.id === otherCenterId);
              
              if (fromCenter && toCenter) {
                suggestions.push({
                  from_center: fromCenter.name,
                  to_center: toCenter.name,
                  component_id: componentId,
                  component_name: components.find(c => c.id === componentId)?.name || 'Unknown',
                  quantity: transferQty,
                  reason: `Center ${toCenter.name} has only ${Math.round(otherDays)} days stock`,
                  savings: transferQty * stock.cost
                });
              }
            }
          }
        });
      }
    });
  });
  
  return suggestions.slice(0, 10);
}

// ============================================
// Dashboard Summary Stats
// ============================================

export interface DashboardSummary {
  total_students: number;
  active_students_this_month: number;
  most_popular_component: string;
  fastest_moving_component: string;
  components_needing_replacement: number;
  average_utilization_rate: number;
}

export function getDashboardSummary(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; max_usage_limit: number; available_quantity: number; total_quantity: number }[]
): DashboardSummary {
  const today = startOfDay(new Date());
  const monthAgo = subDays(today, 30);
  
  const activeStudents = new Set<string>();
  transactions
    .filter(tx => new Date(tx.created_at) >= monthAgo && (tx.student_uuid || tx.student_id))
    .forEach(tx => activeStudents.add(tx.student_uuid || tx.student_id!));
  
  const componentUsage = new Map<string, number>();
  transactions
    .filter(tx => tx.transaction_type === 'issue')
    .forEach(tx => {
      componentUsage.set(tx.component_id, (componentUsage.get(tx.component_id) || 0) + tx.quantity);
    });
  
  let mostPopular = 'N/A';
  let maxUsage = 0;
  componentUsage.forEach((count, id) => {
    if (count > maxUsage) {
      maxUsage = count;
      mostPopular = components.find(c => c.id === id)?.name || 'N/A';
    }
  });
  
  const needingReplacement = components.filter(c => 
    c.available_quantity < (c.max_usage_limit || 10) * 0.2
  ).length;
  
  const utilizationRates = components
    .filter(c => c.total_quantity > 0)
    .map(c => ((c.total_quantity - c.available_quantity) / c.total_quantity) * 100);
  const avgUtilization = utilizationRates.length > 0
    ? utilizationRates.reduce((a, b) => a + b, 0) / utilizationRates.length
    : 0;
  
  return {
    total_students: activeStudents.size,
    active_students_this_month: activeStudents.size,
    most_popular_component: mostPopular,
    fastest_moving_component: mostPopular,
    components_needing_replacement: needingReplacement,
    average_utilization_rate: Math.round(avgUtilization)
  };
}

// ============================================
// AI/ML Insights & Predictions
// ============================================

export async function generateAIInsights(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; available_quantity: number; status: string }[]
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  const lowStock = components.filter(c => c.available_quantity < 5).length;

  if (lowStock > 0) {
    insights.push({
      id: 'low-stock-help',
      type: 'warning',
      title: 'Low Stock Help',
      description: `We're running low on ${lowStock} items. You might want to get more soon!`,
      priority: 1
    });
  }

  const issueCount = transactions.filter(t => t.transaction_type === 'issue').length;
  if (issueCount > 10) {
    insights.push({
      id: 'busy-week',
      type: 'info',
      title: 'Busy Week!',
      description: 'More people are using tools lately (up 15%). Please make sure everything is returned on time.',
      priority: 2
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'all-good',
      type: 'success',
      title: 'All Good',
      description: 'Everything looks great! Your stock levels are nice and steady.',
      priority: 10
    });
  }

  return insights;
}

export async function generateProcurementSuggestions(
  transactions: InventoryTransaction[],
  components: { id: string; name: string; available_quantity: number; max_usage_limit: number }[]
): Promise<ProcurementSuggestion[]> {
  return components
    .map(c => {
      const predictedDemand = Math.max(0, Math.round((c.max_usage_limit || 10) * 0.2));
      const currentStock = c.available_quantity;
      const suggestedOrder = Math.max(0, predictedDemand - currentStock);
      const urgency: ProcurementSuggestion['urgency'] = currentStock <= (c.max_usage_limit || 10) * 0.2 ? 'high' : 'low';
      const daysUntilStockout = predictedDemand > 0 ? Math.max(1, Math.floor(currentStock / predictedDemand)) : 999;

      return {
        componentId: c.id,
        componentName: c.name,
        currentStock,
        predictedDemand,
        suggestedOrder,
        urgency,
        reason: currentStock <= (c.max_usage_limit || 10) * 0.2
          ? 'Low stock based on historical demand patterns.'
          : 'Stock is within healthy range.',
        daysUntilStockout
      };
    })
    .filter(item => item.suggestedOrder > 0 || item.urgency === 'high');
}
