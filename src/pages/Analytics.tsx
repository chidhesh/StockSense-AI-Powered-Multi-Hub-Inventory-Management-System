import { useEffect, useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  BarChart3, 
  Target, 
  Cpu, 
  ShoppingBag, 
  ExternalLink, 
  Send, 
  Lightbulb, 
  AlertTriangle, 
  Package, 
  DollarSign, 
  TrendingUp as TrendUp, 
  Users, 
  Bell, 
  Mail, 
  Activity, 
  CheckCircle, 
  Settings2, 
  MapPin, 
  Building2, 
  ArrowLeftRight, 
  FileText, 
  CheckCircle2, 
  Calendar, 
  Grid
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { Link, useLocation } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Component, InventoryTransaction, ComponentForecast, ForecastingParameters } from '../types';
import { forecastAllComponents, calculateAccuracy } from '../lib/forecasting';
import { enhancedForecast } from '../lib/mlForecasting';
import { useStockNotifications } from '../hooks/useStockNotifications';

export default function Analytics() {
  const { profile } = useAuth();
  const location = useLocation();
  const stateCenterId = location.state?.centerId;
  const stateCenterName = location.state?.centerName;
  
  const [components, setComponents] = useState<Component[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [forecasts, setForecasts] = useState<ComponentForecast[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<ComponentForecast | null>(null);
  const [hubForecasts, setHubForecasts] = useState<{
    hubName: string;
    location: string;
    currentStock: number;
    predictedDemand: number;
    trend: string;
    coveragePct: number;
    coverageLabel: string;
  }[]>([]);
  const [demandHeatmap, setDemandHeatmap] = useState<{
    hubs: string[];
    categories: string[];
    values: number[][];
    maxValue: number;
  }>({ hubs: [], categories: [], values: [], maxValue: 1 });
  const [heatmapData, setHeatmapData] = useState<{ day: string; value: number; label: string }[]>([]);
  const [autoRequests, setAutoRequests] = useState<any[]>([]);
  const [loading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [categoryUsage, setCategoryUsage] = useState<{ category: string; issued: number; returned: number; damaged: number }[]>([]);
  
  // Analytics Parameters
  const [parameters, setParameters] = useState<ForecastingParameters>({
    forecastDays: 30,
    lowStockThreshold: 20,
    highStockThreshold: 80,
    urgencyThreshold: 7,
    historicalDays: 90
  });
  const [showConfig, setShowConfig] = useState(false);

  // Master Admin Recommendation System
  const [masterAdminRecommendations, setMasterAdminRecommendations] = useState<{
    id: string;
    type: 'procurement' | 'budget' | 'inventory' | 'performance';
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    impact: string;
    action?: string;
    link?: string;
    metric?: number;
    trend?: 'up' | 'down' | 'stable';
  }[]>([]);

  const isMasterAdmin = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  const isInventoryManager = profile?.role === 'center_admin' || (profile?.role?.toLowerCase()?.includes('inventory manager') ?? false);

  // Stock Notification System
  const { 
    loading: notificationLoading, 
    checkStockLevels, 
    sendLowStockAlert, 
    sendHighStockAlert 
  } = useStockNotifications();
  
  const [stockCheckResult, setStockCheckResult] = useState<{
    lowStock: any[];
    highStock: any[];
    summary: { totalComponents: number; lowStockCount: number; highStockCount: number };
  } | null>(null);
  const [notificationSent, setNotificationSent] = useState<{ lowStock: boolean; highStock: boolean }>({ lowStock: false, highStock: false });
  const [emailInput, setEmailInput] = useState('');
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [adminProfiles, setAdminProfiles] = useState<{ id: string; email: string; full_name: string }[]>([]);

  // Fetch system administrators
  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const users = await apiGet<any[]>('/api/profiles');
        const admins = users
          .filter(u => u.role === 'master_admin' || u.role?.toLowerCase() === 'system administrator')
          .map(u => ({ id: u.id, email: u.email, full_name: u.full_name }));
        setAdminProfiles(admins);
        if (admins.length > 0 && !emailInput) {
          setEmailInput(admins[0].email);
        }
      } catch (err) {
        console.error('Error fetching admin profiles:', err);
      }
    };
    if (isInventoryManager) fetchAdmins();
  }, [isInventoryManager]);

  // Generate Master Admin Recommendations based on inventory data
  const generateMasterAdminRecommendations = (
    comps: Component[],
    txs: InventoryTransaction[]
  ) => {
    const recommendations: typeof masterAdminRecommendations = [];
    
    // 1. Low stock alerts (at or below 20%)
    const lowStockItems = comps.filter(c => c.available_quantity <= c.total_quantity * 0.2);
    if (lowStockItems.length > 0) {
      recommendations.push({
        id: 'rec-1',
        type: 'inventory',
        title: 'Low Stock Alert',
        description: `${lowStockItems.length} items are running low and need immediate procurement attention.`,
        priority: 'high',
        impact: 'Prevent stockouts',
        action: 'View in Dashboard',
        link: '/dashboard', // Linking to filtered inventory is most direct
        metric: lowStockItems.length,
        trend: 'down'
      });
    }
    
    // Analyze high-value components
    const highValueItems = comps.filter(c => c.unit_cost > 1000);
    if (highValueItems.length > 0) {
      const totalValue = highValueItems.reduce((sum, c) => sum + (c.available_quantity * c.unit_cost), 0);
      recommendations.push({
        id: 'rec-2',
        type: 'budget',
        title: 'High-Value Inventory Optimization',
        description: `${highValueItems.length} high-value components worth ₹${totalValue.toLocaleString()} in stock. Consider reviewing holding costs.`,
        priority: 'medium',
        impact: 'Cost optimization',
        action: 'View Reports',
        link: '/reports',
        metric: totalValue,
        trend: 'stable'
      });
    }
    
    // Analyze usage patterns
    const issueCount = txs.filter(t => t.transaction_type === 'issue').length;
    const returnCount = txs.filter(t => t.transaction_type === 'return').length;
    const returnRate = issueCount > 0 ? (returnCount / issueCount) * 100 : 0;
    
    if (returnRate > 15) {
      recommendations.push({
        id: 'rec-3',
        type: 'performance',
        title: 'High Return Rate Detected',
        description: `Return rate is ${returnRate.toFixed(1)}%, which is above the recommended threshold. Investigate quality issues.`,
        priority: 'high',
        impact: 'Quality improvement',
        action: 'Analyze Transactions',
        link: '/transactions',
        metric: returnRate,
        trend: 'up'
      });
    }
    
    // Demand forecasting insight
    const activeComponents = comps.filter(c => c.status === 'active').length;
    recommendations.push({
      id: 'rec-5',
      type: 'inventory',
      title: 'Inventory Health Score',
      description: `${activeComponents} of ${comps.length} components are active. ${comps.length - activeComponents} need attention or restocking.`,
      priority: 'medium',
      impact: 'Operational efficiency',
      action: 'Dashboard Overview',
      link: '/dashboard',
      metric: Math.round((activeComponents / comps.length) * 100) || 0,
      trend: 'stable'
    });
    
    setMasterAdminRecommendations(recommendations);
  };

  useEffect(() => {
    fetchData();
  }, [profile, parameters]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const centerId = stateCenterId || (!isMasterAdmin ? profile?.center_id : undefined);
      const compsUrl = centerId ? `/api/components?center_id=${centerId}` : '/api/components';
      const txsUrl = centerId ? `/api/inventory-transactions?center_id=${centerId}&limit=5000` : '/api/inventory-transactions?limit=5000';

      const [comps, txs] = await Promise.all([
        apiGet<Component[]>(compsUrl),
        apiGet<InventoryTransaction[]>(txsUrl),
      ]);

      setComponents(Array.isArray(comps) ? comps : []);
      setTransactions(Array.isArray(txs) ? txs : []);

      const validComps = Array.isArray(comps) ? comps : [];
      const validTxs = Array.isArray(txs) ? txs : [];

      // If Master Admin, aggregate forecasting by hub
      const centersRes = isMasterAdmin ? await apiGet<any[]>('/api/centers') : [];
      const calculatedHubForecasts = isMasterAdmin ? await Promise.all(
        centersRes.map(async center => {
          const centerComps = validComps.filter(c => String(c.center_id) === String(center.id));
          const centerTxs = validTxs.filter(t => String(t.center_id) === String(center.id));
          const totalStock = centerComps.reduce((sum, c) => sum + c.available_quantity, 0);
          
          const hubFc = centerComps.length > 0
            ? await Promise.all(
                centerComps.map(c => enhancedForecast(c.id, c.name, centerTxs, parameters.forecastDays, parameters.historicalDays))
              )
            : [];
          
          const avgPredicted = hubFc.reduce((sum, f) => sum + f.next_30_days, 0);

          const predictedDemand = Math.round(avgPredicted);
          const coveragePct = predictedDemand > 0
            ? Math.min(100, Math.round((totalStock / predictedDemand) * 100))
            : totalStock > 0 ? 100 : 0;
          const coverageLabel = predictedDemand === 0
            ? 'No demand forecast yet'
            : coveragePct >= 80
              ? 'Stock covers forecast'
              : coveragePct >= 40
                ? 'Monitor — may need restock'
                : 'Low coverage — restock soon';

          return {
            hubName: center.name,
            location: center.location || '',
            currentStock: totalStock,
            predictedDemand,
            trend: predictedDemand > totalStock * 0.8 ? 'increasing' : 'stable',
            coveragePct,
            coverageLabel,
          };
        })
      ) : [];

      setHubForecasts(calculatedHubForecasts);

      if (isMasterAdmin && centersRes.length > 0) {
        const categories = [...new Set(validComps.map((c) => c.category).filter(Boolean))].sort();
        const heatmapValues = centersRes.map((center) =>
          categories.map((cat) =>
            validTxs
              .filter((t) => {
                if (t.center_id !== center.id || t.transaction_type !== 'issue') return false;
                const comp = validComps.find((c) => c.id === t.component_id);
                return comp?.category === cat;
              })
              .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0)
          )
        );
        const maxValue = Math.max(1, ...heatmapValues.flat());
        setDemandHeatmap({
          hubs: centersRes.map((c) => c.name),
          categories,
          values: heatmapValues,
          maxValue,
        });
      } else {
        setDemandHeatmap({ hubs: [], categories: [], values: [], maxValue: 1 });
      }

      const isLowStock = (c: Component) =>
        c.status === 'low_stock' ||
        (c.total_quantity > 0 && c.available_quantity > 0 && c.available_quantity <= Math.max(2, Math.ceil(c.total_quantity * 0.2)));
      const isOutOfStock = (c: Component) =>
        c.status === 'out_of_stock' || c.available_quantity === 0;

      const restockCandidates = validComps.filter(c => isLowStock(c) || isOutOfStock(c));
      const forecastTargets = [
        ...new Map(
          [...restockCandidates, ...validComps.slice(0, 10)].map((c) => [c.id, c])
        ).values(),
      ];

      // Use the advanced LSTM model for forecasting with configurable days
      const fc = await Promise.all(
        forecastTargets.map(c => enhancedForecast(c.id, c.name, validTxs, parameters.forecastDays, parameters.historicalDays))
      );
      // Calculate Heatmap Data (Usage by Day of Week)
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const usageByDay = new Array(7).fill(0).map((_, i) => ({
        day: dayNames[i],
        value: 0,
        label: `${dayNames[i]} Usage`
      }));

      validTxs.forEach(t => {
        if (t.transaction_type === 'issue') {
          const day = new Date(t.created_at).getDay();
          usageByDay[day].value += t.quantity;
        }
      });
      setHeatmapData(usageByDay);

      // Generate Auto Purchase Requests (low + out of stock)
      const needsRestock = validComps.filter(c => isLowStock(c) || isOutOfStock(c));
      const autoReqs = needsRestock.map(c => {
        const componentForecast = fc.find(f => f.component_id === c.id);
        const shortfall = Math.max(0, c.total_quantity - c.available_quantity);
        const needed = (componentForecast?.next_30_days || 0) + shortfall;
        const suggestedQty = Math.max(needed, isOutOfStock(c) ? Math.max(5, Math.ceil(c.total_quantity * 0.3)) : 10);
        return {
          component_id: c.id,
          name: c.name,
          category: c.category,
          current_stock: c.available_quantity,
          total_stock: c.total_quantity,
          predicted_demand: componentForecast?.next_30_days || 0,
          suggested_quantity: suggestedQty,
          estimated_cost: suggestedQty * (Number(c.unit_cost) || 100),
          vendor: 'Preferred Vendor',
          urgency: isOutOfStock(c) ? 'critical' : 'high',
        };
      });
      setAutoRequests(autoReqs);

      setForecasts(fc);
      if (fc.length > 0) setSelectedForecast(fc[0]);

      const catMap = new Map<string, { issued: number; returned: number; damaged: number }>();
      validComps.forEach(c => {
        if (!catMap.has(c.category)) catMap.set(c.category, { issued: 0, returned: 0, damaged: 0 });
      });
      validTxs.forEach(t => {
        const comp = validComps.find(c => c.id === t.component_id);
        if (!comp) return;
        const cat = catMap.get(comp.category);
        if (!cat) return;
        if (t.transaction_type === 'issue') cat.issued += t.quantity;
        else if (t.transaction_type === 'return') cat.returned += t.quantity;
        else if (t.transaction_type === 'damaged') cat.damaged += t.quantity;
      });

      setCategoryUsage(Array.from(catMap.entries()).map(([category, v]) => ({ category, ...v })));
      
      // Generate Master Admin Recommendations based on fetched data
      if (isMasterAdmin) {
        generateMasterAdminRecommendations(validComps, validTxs);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setComponents([]);
      setTransactions([]);
      setForecasts([]);
      setCategoryUsage([]);
      setAutoRequests([]);
    } finally {
      setDataLoading(false);
    }
  };

  // Stock Notification Handlers
  const handleCheckStockLevels = async () => {
    try {
      const result = await checkStockLevels(undefined, parameters.lowStockThreshold, parameters.highStockThreshold);
      setStockCheckResult(result);
      setNotificationSent({ lowStock: false, highStock: false });
    } catch (err) {
      console.error('Error checking stock levels:', err);
    }
  };

  const handleSendLowStockAlert = async () => {
    if (!emailInput) return;
    try {
      const result = await sendLowStockAlert(
        emailInput, 
        undefined, 
        parameters.lowStockThreshold,
        profile?.full_name,
        profile?.center?.name || stateCenterName
      );
      const success = result?.success && result.results.some(r => r.success);
      if (success) {
        setNotificationSent(prev => ({ ...prev, lowStock: true }));
      } else {
        const errorMessage = result?.results?.map(r => r.error).filter(Boolean).join('; ') || 'Failed to send low stock alert';
        console.error('Low stock alert failed:', errorMessage);
        // Clean up internal error messages for user display
        const displayError = errorMessage.includes('self-signed certificate') 
          ? 'Network Security Error: The mail server is using an untrusted certificate. I have applied a fix to the backend, please restart the server.' 
          : errorMessage;
        alert(displayError);
      }
    } catch (err) {
      console.error('Error sending low stock alert:', err);
      alert('An error occurred while sending the low stock alert. Check console for details.');
    }
  };

  const handleSendHighStockAlert = async () => {
    if (!emailInput) return;
    try {
      const result = await sendHighStockAlert(
        emailInput, 
        undefined, 
        parameters.highStockThreshold,
        profile?.full_name,
        profile?.center?.name || stateCenterName
      );
      const success = result?.success && result.results.some(r => r.success);
      if (success) {
        setNotificationSent(prev => ({ ...prev, highStock: true }));
      } else {
        const errorMessage = result?.results?.map(r => r.error).filter(Boolean).join('; ') || 'Failed to send high stock alert';
        console.error('High stock alert failed:', errorMessage);
        // Clean up internal error messages for user display
        const displayError = errorMessage.includes('self-signed certificate') 
          ? 'Network Security Error: The mail server is using an untrusted certificate. I have applied a fix to the backend, please restart the server.' 
          : errorMessage;
        alert(displayError);
      }
    } catch (err) {
      console.error('Error sending high stock alert:', err);
      alert('An error occurred while sending the high stock alert. Check console for details.');
    }
  };

  const forecastChartData = useMemo(() => {
    if (!selectedForecast) return [];
    return selectedForecast.forecast.map((point) => {
      const isFuture = point.actual === undefined;
      return {
        date: point.date,
        actual: isFuture ? null : (point.actual ?? 0),
        predicted: point.predicted ?? 0,
      };
    });
  }, [selectedForecast]);

  const forecastYMax = useMemo(() => {
    if (!forecastChartData.length) return 4;
    const peak = Math.max(
      ...forecastChartData.map(d => Math.max(d.actual ?? 0, d.predicted ?? 0))
    );
    return Math.max(2, Math.ceil(peak * 1.25));
  }, [forecastChartData]);

  const forecastProjectionDate = useMemo(
    () => forecastChartData.find(p => p.actual === null)?.date,
    [forecastChartData]
  );

  if (dataLoading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Running Neural Sync...</p>
    </div>
  );

  const accuracy = selectedForecast ? calculateAccuracy(selectedForecast.forecast) : 0;

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <BarChart3 size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Intelligence Center</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Predictive Analytics • <span className="text-indigo-600 dark:text-indigo-400">Inventory Forecasting</span>
            {stateCenterName && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex inline-items items-center gap-1 w-fit mt-1">
                <MapPin size={10} /> {stateCenterName}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`p-3 rounded-xl transition-all ${showConfig ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800'}`}
          >
            <Settings2 size={20} />
          </button>
          <button 
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl border border-slate-100 dark:border-slate-800 font-black text-[10px] uppercase tracking-widest"
          >
            <Activity size={16} className="text-indigo-600" /> Refresh Intelligence
          </button>
        </div>
      </div>

      {/* Hub-Wide Forecasting Overview - Only for System Admin */}
      {isMasterAdmin && hubForecasts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Multi-Hub Demand Outlook</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                {hubForecasts.length} registered hub{hubForecasts.length !== 1 ? 's' : ''} • {parameters.forecastDays}-day forecast
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {hubForecasts.map((hub, idx) => (
              <div key={idx} className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-500/30 transition-all group">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{hub.hubName}</p>
                <p className="text-[9px] font-bold text-indigo-500 flex items-center gap-1 mb-3">
                  <MapPin size={10} /> {hub.location || 'Location N/A'}
                </p>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white">{hub.predictedDemand}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Units needed (forecast)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-700 dark:text-slate-200">{hub.currentStock}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">In stock now</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Coverage</span>
                    <span className="text-[9px] font-black text-slate-900 dark:text-white">{hub.coveragePct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${hub.coveragePct < 40 ? 'bg-rose-500' : hub.coveragePct < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${hub.coveragePct}%` }}
                    />
                  </div>
                  <p className="text-[8px] font-bold text-slate-500 uppercase mt-2">{hub.coverageLabel}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 h-80 w-full min-h-[320px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hubForecasts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis 
                  dataKey="hubName" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#f1f5f9' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} />
                <Bar dataKey="currentStock" name="Current Stock" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="predictedDemand" name="Predicted Demand" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {isMasterAdmin && demandHeatmap.hubs.length > 0 && demandHeatmap.categories.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-violet-50 dark:bg-violet-900/20 text-violet-600 rounded-lg">
              <Grid size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Demand Forecast Heatmap</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase">
                Issued units by hub and category — darker cells mean higher historical demand (used for forecasting)
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr>
                  <th className="text-left text-[9px] font-black text-slate-400 uppercase p-2">Hub</th>
                  {demandHeatmap.categories.map((cat) => (
                    <th key={cat} className="text-center text-[8px] font-black text-slate-400 uppercase p-2 max-w-[72px]">
                      {cat.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demandHeatmap.hubs.map((hub, rowIdx) => (
                  <tr key={hub}>
                    <td className="text-[9px] font-black text-slate-700 dark:text-slate-300 p-2 whitespace-nowrap">{hub}</td>
                    {demandHeatmap.values[rowIdx]?.map((val, colIdx) => {
                      const intensity = val / demandHeatmap.maxValue;
                      const bg = intensity > 0.75 ? 'bg-indigo-700' : intensity > 0.5 ? 'bg-indigo-500' : intensity > 0.25 ? 'bg-indigo-300' : intensity > 0 ? 'bg-indigo-100' : 'bg-slate-100 dark:bg-slate-800';
                      return (
                        <td key={colIdx} className="p-1">
                          <div
                            className={`${bg} rounded-lg h-10 flex items-center justify-center text-[10px] font-black ${intensity > 0.4 ? 'text-white' : 'text-slate-600'}`}
                            title={`${hub} • ${demandHeatmap.categories[colIdx]}: ${val} units issued`}
                          >
                            {val > 0 ? val : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase">
            <span>Low demand</span>
            <div className="flex gap-1">
              <div className="w-4 h-4 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="w-4 h-4 bg-indigo-100 rounded" />
              <div className="w-4 h-4 bg-indigo-300 rounded" />
              <div className="w-4 h-4 bg-indigo-500 rounded" />
              <div className="w-4 h-4 bg-indigo-700 rounded" />
            </div>
            <span>High demand</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Intensity Heatmap */}
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <Grid size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Weekly Usage Pattern</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase">Issues by day of week (all hubs)</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-between items-end">
            {(() => {
              const maxVal = Math.max(1, ...heatmapData.map(d => d.value));
              return heatmapData.map((data, idx) => {
                const intensity = data.value / maxVal;
                const bg = intensity > 0.7 ? 'bg-indigo-600' : 
                          intensity > 0.4 ? 'bg-indigo-400' : 
                          intensity > 0.1 ? 'bg-indigo-200' : 
                          'bg-slate-100 dark:bg-slate-800';
                
                // Scale height between 40px and 150px based on relative value
                const height = 40 + (intensity * 110);
                
                return (
                  <div key={idx} className="flex-1 min-w-[60px] text-center space-y-3">
                    <div 
                      className={`w-full rounded-2xl transition-all duration-500 hover:scale-110 cursor-pointer ${bg}`}
                      style={{ height: `${height}px` }}
                      title={`${data.value} units issued`}
                    />
                    <p className="text-[10px] font-black text-slate-400 uppercase">{data.day}</p>
                  </div>
                );
              });
            })()}
          </div>
          <div className="mt-8 flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Low Usage</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-slate-100 dark:bg-slate-800 rounded-sm" />
              <div className="w-3 h-3 bg-indigo-200 rounded-sm" />
              <div className="w-3 h-3 bg-indigo-400 rounded-sm" />
              <div className="w-3 h-3 bg-indigo-600 rounded-sm" />
            </div>
            <span>High Usage</span>
          </div>
        </div>

        {/* Automatic Purchase Requests */}
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <ShoppingBag size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Auto Purchase Requests</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase">ML-driven procurement suggestions</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all">
              Approve All
            </button>
          </div>

          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {autoRequests.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={32} />
                <p className="text-[10px] font-black text-slate-400 uppercase">Stock levels are optimal</p>
              </div>
            ) : (
              autoRequests.map((req) => (
                <div key={req.component_id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm shrink-0">
                        <Package size={16} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">{req.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{req.category}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                        req.urgency === 'critical'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}
                    >
                      {req.urgency}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[9px] font-bold uppercase text-slate-500">
                    <div>
                      <p className="text-slate-400 mb-0.5">Current</p>
                      <p className="text-slate-900 dark:text-white font-black">{req.current_stock} / {req.total_stock}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 mb-0.5">30d Demand</p>
                      <p className="text-slate-900 dark:text-white font-black">{Math.round(req.predicted_demand)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 mb-0.5">Order Qty</p>
                      <p className="text-indigo-600 dark:text-indigo-400 font-black">{req.suggested_quantity}</p>
                    </div>
                    <div className="text-right sm:text-left">
                      <p className="text-slate-400 mb-0.5">Est. Cost</p>
                      <p className="text-emerald-600 font-black">₹{req.estimated_cost.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] font-bold text-slate-400 uppercase">Vendor: {req.vendor}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-indigo-600" />
            <span className="text-xs font-medium text-gray-500">Total Components</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{components.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-green-600" />
            <span className="text-xs font-medium text-gray-500">Total Issued</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {transactions.filter(t => t.transaction_type === 'issue').reduce((s, t) => s + t.quantity, 0)}
          </p>
        </div>
      </div>

      {!isMasterAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Component Forecasts</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {forecasts.map(fc => (
                <button
                  key={fc.component_id}
                  onClick={() => setSelectedForecast(fc)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selectedForecast?.component_id === fc.component_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">{fc.component_name}</p>
                    <div className={`flex items-center gap-1 text-xs font-medium ${fc.trend === 'increasing' ? 'text-green-600' : fc.trend === 'decreasing' ? 'text-red-600' : 'text-gray-500'}`}>
                      {fc.trend === 'increasing' ? <TrendingUp size={12} /> : fc.trend === 'decreasing' ? <TrendingDown size={12} /> : <Minus size={12} />}
                      {fc.trend}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Next 30d: <span className="font-semibold text-gray-700">{fc.next_30_days} units</span></p>
                </button>
              ))}
              {forecasts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Add components and transactions to see forecasts</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {selectedForecast ? `Neural Forecast: ${selectedForecast.component_name}` : 'Select a component'}
                </h3>
                {selectedForecast && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Prediction based on {parameters.historicalDays} days of historical data
                  </p>
                )}
              </div>
              {selectedForecast && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Actual</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 rounded-lg">
                    <div className="w-2 h-2 border-b-2 border-dashed border-orange-500" />
                    <span className="text-[10px] font-black text-orange-700 uppercase tracking-widest">Predicted</span>
                  </div>
                </div>
              )}
            </div>
            
            {selectedForecast ? (
              <div className="space-y-6">
                <div className="w-full min-h-[400px] bg-slate-50/50 p-4 rounded-2xl border border-slate-100 relative">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={forecastChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} 
                        tickLine={false} 
                        axisLine={false}
                        interval={3} 
                      />
                      <YAxis 
                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} 
                        tickLine={false} 
                        axisLine={false}
                        domain={[0, forecastYMax]}
                        allowDecimals={false}
                        label={{ value: 'Units', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          borderRadius: '12px', 
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                          padding: '12px'
                        }}
                        itemStyle={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}
                        formatter={(value: number, name: string) => [
                          value != null ? `${value} units` : '—',
                          name === 'actual' ? 'Actual Usage' : 'Predicted Demand'
                        ]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="line"
                        wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}
                      />
                      {forecastProjectionDate && (
                        <ReferenceLine 
                          x={forecastProjectionDate} 
                          stroke="#6366f1" 
                          strokeDasharray="5 5" 
                          label={{ value: 'Forecast Start', position: 'top', fill: '#6366f1', fontSize: 10, fontWeight: '900' }} 
                        />
                      )}
                      <Line 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#6366f1" 
                        strokeWidth={3} 
                        dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} 
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        name="Actual Usage" 
                        connectNulls={false} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="predicted" 
                        stroke="#f97316" 
                        strokeWidth={3} 
                        strokeDasharray="8 4" 
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          if (cx == null || cy == null || !(payload?.predicted > 0)) return null;
                          const isFuture = payload.actual === null;
                          return (
                            <circle cx={cx} cy={cy} r={isFuture ? 4 : 3} fill="#f97316" stroke="#fff" strokeWidth={2} />
                          );
                        }}
                        activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                        name="Predicted Demand" 
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Expected Demand</p>
                    <p className="text-xl font-black text-indigo-900">{selectedForecast.next_30_days} Units</p>
                    <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-tight mt-1">Total projected for next 30 days</p>
                  </div>
                  <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100">
                    <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">Predicted Demand</p>
                    <p className="text-xl font-black text-orange-900">
                      {forecastChartData.filter(p => p.actual === null).reduce((s, p) => s + (p.predicted ?? 0), 0)} Units
                    </p>
                    <p className="text-[9px] font-bold text-orange-600 uppercase tracking-tight mt-1">Next {parameters.forecastDays} days forecast</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Recommendation</p>
                    <p className="text-xl font-black text-slate-900">
                      {selectedForecast.trend === 'increasing' ? 'Buy Soon' : 'Optimal'}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight mt-1">
                      Current trend is {selectedForecast.trend}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 text-slate-300 border-2 border-dashed border-slate-100 rounded-2xl">
                <Activity size={48} className="mb-4 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">Select an asset from the list to view neural insights</p>
              </div>
            )}
          </div>
        </div>
      )}


      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Usage by Category</h3>
        {categoryUsage.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No transaction data available</div>
        ) : (
          <div className="w-full min-h-[400px] relative">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={categoryUsage} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="issued" name="Issued" fill="#0F62FE" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returned" name="Returned" fill="#2DC653" radius={[4, 4, 0, 0]} />
                <Bar dataKey="damaged" name="Damaged" fill="#FF4D4F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Master Admin Recommendation System - Only visible to master_admin */}
      {isMasterAdmin && masterAdminRecommendations.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Lightbulb size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">AI-Powered Recommendations</h3>
                <p className="text-xs text-indigo-600">Smart insights for master administrators</p>
              </div>
            </div>
            <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
              {masterAdminRecommendations.length} Insights
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {masterAdminRecommendations.map((rec) => (
              <div 
                key={rec.id}
                className={`relative bg-white rounded-xl border p-4 hover:shadow-lg transition-all cursor-pointer group ${
                  rec.priority === 'high' 
                    ? 'border-red-200 hover:border-red-300' 
                    : rec.priority === 'medium'
                    ? 'border-yellow-200 hover:border-yellow-300'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {rec.priority === 'high' && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} /> URGENT
                  </div>
                )}
                
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${
                    rec.type === 'procurement' ? 'bg-blue-100' :
                    rec.type === 'budget' ? 'bg-green-100' :
                    rec.type === 'inventory' ? 'bg-purple-100' :
                    'bg-orange-100'
                  }`}>
                    {rec.type === 'procurement' ? <ShoppingBag size={16} className="text-blue-600" /> :
                     rec.type === 'budget' ? <DollarSign size={16} className="text-green-600" /> :
                     rec.type === 'inventory' ? <Package size={16} className="text-purple-600" /> :
                     <Users size={16} className="text-orange-600" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                      {rec.title}
                    </h4>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                      {rec.type} • {rec.impact}
                    </p>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  {rec.description}
                </p>
                
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  {rec.metric !== undefined && (
                    <div className="flex items-center gap-1">
                      {rec.trend === 'up' ? <TrendUp size={12} className="text-green-500" /> :
                       rec.trend === 'down' ? <TrendingDown size={12} className="text-red-500" /> :
                       <Minus size={12} className="text-gray-400" />}
                      <span className="text-xs font-semibold text-gray-700">
                        {typeof rec.metric === 'number' && rec.metric > 1000 
                          ? `₹${rec.metric.toLocaleString()}` 
                          : rec.metric}
                        {rec.type === 'inventory' && typeof rec.metric === 'number' && rec.metric <= 100 ? '%' : ''}
                      </span>
                    </div>
                  )}
                  {rec.action && (
                    <Link 
                      to={rec.link || '#'} 
                      className="text-[10px] font-medium text-indigo-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform hover:underline"
                    >
                      {rec.action} <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Configuration Panel */}
      {/* <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Settings2 size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Analytics Parameters</h3>
              <p className="text-xs text-gray-500">Configure forecasting and alert thresholds</p>
            </div>
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-slate-600 hover:text-slate-900 font-medium text-sm flex items-center gap-1"
          >
            {showConfig ? 'Hide Settings' : 'Adjust Parameters'}
          </button>
        </div>

        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 pt-4 border-t border-gray-100 animate-in fade-in duration-300">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Forecast Days</label>
              <input
                type="number"
                value={parameters.forecastDays}
                onChange={(e) => setParameters({ ...parameters, forecastDays: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Low Stock %</label>
              <input
                type="number"
                value={parameters.lowStockThreshold}
                onChange={(e) => setParameters({ ...parameters, lowStockThreshold: parseInt(e.target.value) || 20 })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">High Stock %</label>
              <input
                type="number"
                value={parameters.highStockThreshold}
                onChange={(e) => setParameters({ ...parameters, highStockThreshold: parseInt(e.target.value) || 80 })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Urgency (Days)</label>
              <input
                type="number"
                value={parameters.urgencyThreshold}
                onChange={(e) => setParameters({ ...parameters, urgencyThreshold: parseInt(e.target.value) || 7 })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">History (Days)</label>
              <input
                type="number"
                value={parameters.historicalDays}
                onChange={(e) => setParameters({ ...parameters, historicalDays: parseInt(e.target.value) || 90 })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
        )}
      </div> */}

      {/* Stock Alert Notification Panel - Inventory Manager Only */}
      {isInventoryManager && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-600 rounded-lg">
                <Bell size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Stock Alert Notifications</h3>
                <p className="text-xs text-amber-600">Send SMS & Email alerts for stock levels</p>
              </div>
            </div>
            <button
              onClick={() => setShowNotificationPanel(!showNotificationPanel)}
              className="text-amber-600 hover:text-amber-700 font-medium text-sm flex items-center gap-1"
            >
              {showNotificationPanel ? 'Hide Panel' : 'Configure Alerts'}
            </button>
          </div>

          {showNotificationPanel && (
            <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
              <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Recipient Email/Phone</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Enter recipient email or mobile number..."
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleCheckStockLevels}
                    disabled={notificationLoading}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {notificationLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Activity size={16} />}
                    Check Levels
                  </button>
                </div>
              </div>

              {stockCheckResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingDown size={18} className="text-red-500" />
                        <h4 className="text-sm font-bold text-gray-900">Low Stock ({stockCheckResult.summary.lowStockCount})</h4>
                      </div>
                      <button
                        onClick={handleSendLowStockAlert}
                        disabled={notificationSent.lowStock || !emailInput}
                        className={`p-2 rounded-lg transition-all ${notificationSent.lowStock ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        title="Send Alert"
                      >
                        {notificationSent.lowStock ? <CheckCircle size={18} /> : <Send size={18} />}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                      {stockCheckResult.lowStock.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-red-50 rounded-lg">
                          <span className="font-medium text-red-900">{item.name}</span>
                          <span className="font-bold text-red-600">{item.currentQty} left</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-500" />
                        <h4 className="text-sm font-bold text-gray-900">High Usage ({stockCheckResult.summary.highStockCount})</h4>
                      </div>
                      <button
                        onClick={handleSendHighStockAlert}
                        disabled={notificationSent.highStock || !emailInput}
                        className={`p-2 rounded-lg transition-all ${notificationSent.highStock ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                        title="Send Alert"
                      >
                        {notificationSent.highStock ? <CheckCircle size={18} /> : <Send size={18} />}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                      {stockCheckResult.highStock.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-blue-50 rounded-lg">
                          <span className="font-medium text-blue-900">{item.name}</span>
                          <span className="font-bold text-blue-600">{item.currentQty} in stock</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { label: 'Increasing Demand', items: forecasts.filter(f => f.trend === 'increasing'), color: 'text-green-600', bg: 'bg-green-50', icon: TrendingUp },
          { label: 'Stable Demand', items: forecasts.filter(f => f.trend === 'stable'), color: 'text-gray-600', bg: 'bg-gray-50', icon: Minus },
          { label: 'Decreasing Demand', items: forecasts.filter(f => f.trend === 'decreasing'), color: 'text-red-600', bg: 'bg-red-50', icon: TrendingDown },
        ].map(({ label, items, color, bg, icon: Icon }) => (
          <div key={label} className={`${bg} rounded-xl border border-gray-200 p-4`}>
            <div className={`flex items-center gap-2 mb-3 ${color}`}>
              <Icon size={16} />
              <span className="text-sm font-semibold">{label}</span>
              <span className="ml-auto text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-gray-700">{items.length}</span>
            </div>
            {items.slice(0, 4).map(f => (
              <div key={f.component_id} className="flex justify-between py-1 text-xs">
                <span className="text-gray-700 truncate">{f.component_name}</span>
                <span className={`font-medium ${color}`}>{f.next_30_days}u/mo</span>
              </div>
            ))}
            {items.length === 0 && <p className="text-xs text-gray-400">No components</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
