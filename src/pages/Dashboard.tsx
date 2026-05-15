import { useCallback, useEffect, useState } from 'react';
import { 
  Package, AlertTriangle, CheckCircle, TrendingUp, 
  Building2, Activity, Zap, Plus,
  ArrowUpRight, ArrowDownRight, Clock, ChevronRight,
  Brain, Sparkles, AlertCircle, Bell, Mail, Send, TrendingDown, History,
  LayoutDashboard, Search, Filter, Database,
  Server, Users, ShoppingCart, Smartphone
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import { format, formatDistanceToNow, subDays, startOfDay } from 'date-fns';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeProvider';
import { Component, InventoryTransaction, AIInsight, ProcurementSuggestion, ComponentPopularity, StudentUsageStats } from '../types';
import {
  generateAIInsights, generateProcurementSuggestions, 
  getComponentPopularity, getStudentUsageAnalytics, 
  getDashboardSummary
} from '../lib/analytics';
import { useStockNotifications } from '../hooks/useStockNotifications';

const COLORS = ['#0366FF', '#6366F1', '#10B981', '#F59E0B', '#EF4444'];

export default function Dashboard() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const stateCenterId = location.state?.centerId;
  const normalizedRole = profile?.role?.toLowerCase() || '';
  const isMaster = normalizedRole === 'master_admin' || normalizedRole === 'system administrator';
  const isManager = normalizedRole === 'center_admin';
  const isStudent = normalizedRole === 'student';
  const isInventoryManager = isManager || normalizedRole.includes('inventory manager') || normalizedRole.includes('inventory_manager');
  const hubName = profile?.center?.name || profile?.center?.location || '';

  const [stats, setStats] = useState({
    totalComponents: 0, totalQuantity: 0, availableQty: 0,
    lowStock: 0, outOfStock: 0, expired: 0, centersCount: 0, todayIssued: 0, todayReturned: 0,
    damagedToday: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<InventoryTransaction[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; issued: number; returned: number }[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Component[]>([]);
  const [centerPerformance, setCenterPerformance] = useState<{ name: string; activity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  
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

  // AI/ML State
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [procurementSuggestions, setProcurementSuggestions] = useState<ProcurementSuggestion[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  
  // Analytics State
  const [popularComponents, setPopularComponents] = useState<ComponentPopularity[]>([]);
  const [studentStats, setStudentStats] = useState<StudentUsageStats[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [dashboardSummary, setDashboardSummary] = useState<{
    total_students: number;
    active_students_this_month: number;
    most_popular_component: string;
    fastest_moving_component: string;
    components_needing_replacement: number;
    average_utilization_rate: number;
  } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const master = profile.role === 'master_admin' || profile.role?.toLowerCase() === 'system administrator';
    const centerId = stateCenterId || (!master ? (profile.center_id || profile.center?.id || '') : '');
    
    try {
      // Force cache-busting by adding a timestamp
      const timestamp = Date.now();
      const [components, transactions, centersList, studentsList] = await Promise.all([
        apiGet<Component[]>(`/api/components?t=${timestamp}`),
        apiGet<InventoryTransaction[]>(`/api/inventory-transactions?limit=2000&t=${timestamp}`),
        master ? apiGet<any[]>(`/api/centers?t=${timestamp}`) : Promise.resolve([]),
        apiGet<any[]>(`/api/students?t=${timestamp}`)
      ]);

      const filteredComponents = centerId ? components.filter(c => c.center_id === centerId) : components;
      const filteredTransactions = centerId ? (transactions || []).filter(t => t.center_id === centerId) : (transactions || []);

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayTx = filteredTransactions.filter(t => {
        const txDate = new Date(t.created_at);
        txDate.setHours(0, 0, 0, 0);
        return format(txDate, 'yyyy-MM-dd') === todayStr;
      });

      const lowStockList = filteredComponents.filter(c => 
        ['low_stock', 'out_of_stock'].includes(c.status) || c.available_quantity <= 2
      );

      // Update center performance
      if (master && centersList.length) {
        const perf = centersList.map(c => {
          const activity = filteredTransactions.filter(t => t.center_id === c.id).length;
          return { name: c.name, activity };
        }).sort((a, b) => b.activity - a.activity);
        setCenterPerformance(perf);
      }

      setStats({
        totalComponents: filteredComponents.length,
        totalQuantity: filteredComponents.reduce((s, c) => s + c.total_quantity, 0),
        availableQty: filteredComponents.reduce((s, c) => s + c.available_quantity, 0),
        lowStock: filteredComponents.filter(c => c.status === 'low_stock' || (c.available_quantity > 0 && c.available_quantity <= Math.max(2, Math.ceil(c.total_quantity * 0.2)))).length,
        outOfStock: filteredComponents.filter(c => c.status === 'out_of_stock' || c.available_quantity === 0).length,
        expired: filteredComponents.filter(c => c.status === 'expired' || c.status === 'defective').length,
        centersCount: Array.isArray(centersList) ? centersList.length : 0,
        todayIssued: todayTx.filter(t => t.transaction_type === 'issue').reduce((s, t) => s + t.quantity, 0),
        todayReturned: todayTx.filter(t => t.transaction_type === 'return').reduce((s, t) => s + t.quantity, 0),
        damagedToday: todayTx.filter(t => t.transaction_type === 'damaged').reduce((s, t) => s + t.quantity, 0),
      });

      setRecentTransactions(filteredTransactions.slice(0, 8));

      const catMap = new Map<string, number>();
      filteredComponents.forEach(c => catMap.set(c.category, (catMap.get(c.category) || 0) + c.total_quantity));
      setCategoryData(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })));

      const trend = [];
      const todayDate = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        const dayTx = filteredTransactions.filter(t => {
          const txDate = new Date(t.created_at);
          txDate.setHours(0, 0, 0, 0);
          const dCompare = new Date(d);
          dCompare.setHours(0, 0, 0, 0);
          return format(txDate, 'yyyy-MM-dd') === format(dCompare, 'yyyy-MM-dd');
        });
        trend.push({
          date: format(d, 'MMM dd'),
          issued: dayTx.filter(t => t.transaction_type === 'issue').reduce((s, t) => s + t.quantity, 0),
          returned: dayTx.filter(t => t.transaction_type === 'return').reduce((s, t) => s + t.quantity, 0),
        });
      }
      setTrendData(trend);
      setLowStockItems(lowStockList.slice(0, 5) as Component[]);
      
      setMlLoading(true);
      try {
        const [insights, suggestions] = await Promise.all([
          generateAIInsights(filteredTransactions, filteredComponents.map(c => ({
            id: c.id,
            name: c.name,
            available_quantity: c.available_quantity,
            status: c.status
          }))),
          generateProcurementSuggestions(filteredTransactions, filteredComponents.map(c => ({
            id: c.id,
            name: c.name,
            available_quantity: c.available_quantity,
            max_usage_limit: c.max_usage_limit
          })))
        ]);
        setAiInsights(insights);
        setProcurementSuggestions(suggestions.slice(0, 3));
      } catch (mlError) {
        console.error('ML Analysis error:', mlError);
      } finally {
        setMlLoading(false);
      }
      
      try {
        const [popular, students, summary] = await Promise.all([
          Promise.resolve(getComponentPopularity(filteredTransactions, filteredComponents, 30)),
          Promise.resolve(getStudentUsageAnalytics(filteredTransactions, filteredComponents)),
          Promise.resolve(getDashboardSummary(filteredTransactions, filteredComponents))
        ]);
        
        // Add Hub info to student stats
        const studentsWithHub = students.map(s => {
          const studentInfo = (studentsList || []).find((sl: any) => sl.id === s.student_id);
          const hubInfo = (centersList || []).find((cl: any) => cl.id === studentInfo?.center_id);
          return { ...s, hub_id: studentInfo?.center_id, hub_name: hubInfo?.name || 'Local Hub' };
        });

        const activeMonthly = (studentsList || []).filter((s: any) => {
          const sDate = new Date(s.created_at || Date.now());
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return sDate >= monthAgo;
        }).length;

        setPopularComponents(popular.slice(0, 5));
        
        // Filter student stats if centerId is provided via state
        const filteredStudentStats = stateCenterId 
          ? studentsWithHub.filter(s => s.hub_id === stateCenterId)
          : studentsWithHub;
          
        setStudentStats(filteredStudentStats.slice(0, 5));
        setStudentCount((studentsList || []).length);
        setDashboardSummary({
          ...summary,
          total_students: studentsList.length, // Exact total count
          active_students_this_month: activeMonthly
        });
      } catch (analyticsError) {
        console.error('Analytics computation error:', analyticsError);
      }
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    } finally {
      setLoading(false);
    }
  }, [profile, stateCenterId]);

  const handleReseed = async () => {
    if (!confirm('This will clear all current transactions/inventory and add demo data. Continue?')) return;
    setLoading(true);
    try {
      await apiPost('/api/admin/reseed', {});
      await fetchDashboardData();
      alert('Dashboard populated with demo data successfully!');
    } catch (e) {
      alert('Failed to reseed: ' + (e as any).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Analyzing Assets...</p>
      </div>
    );
  }

  const navCenterState = stateCenterId ? { centerId: stateCenterId } : {};

  return (
    <div className="space-y-10 pb-20 max-w-[1400px] mx-auto text-slate-900 dark:text-slate-100 transition-colors duration-500">
      {/* Modern Clean Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight uppercase">
            {isMaster
              ? 'SYSTEM ADMINISTRATOR DASHBOARD'
              : isInventoryManager
                ? hubName
                  ? `${hubName.toUpperCase()} DASHBOARD`
                  : 'INVENTORY MANAGER DASHBOARD'
                : 'STUDENT DASHBOARD'}
          </h1>

          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">
            Welcome back, <span className="text-indigo-600 dark:text-indigo-400 font-bold">{profile?.full_name}</span> • {format(new Date(), 'EEEE, MMMM do')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData()}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-bold text-xs uppercase tracking-widest"
          >
            <Activity size={16} className="text-indigo-600 dark:text-indigo-400" /> Refresh Data
          </button>
          {/* {isMaster && (
            <button
              onClick={handleReseed}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all font-bold text-xs uppercase tracking-widest"
            >
              <Database size={16} /> Reseed Demo
            </button>
          )} */}
        </div>
      </div>

      {/* Role-Specific Overview Section */}
      {isMaster && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 group hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl">
                <Server size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">System Health</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">All Nodes Online</p>
              </div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-[98%]" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Server Load: 12% • DB Usage: 4%</p>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 group hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                <Building2 size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Multi-Center Ops</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{stats.centersCount} Active Hubs</p>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">100% Operational Compliance</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 group hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <Users size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Global Users</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{dashboardSummary?.total_students || 0} Registered</p>
              </div>
            </div>
            <Link to="/users" className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-widest">Manage User Access →</Link>
          </div>
        </div>
      )}

      {isManager && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl">
                <ShoppingCart size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Reorder Queue</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{stats.lowStock} Low Items</p>
              </div>
            </div>
            <Link to="/inventory" className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest block text-center">Quick Restock</Link>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                <Users size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Hub Team</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{studentCount} Students</p>
              </div>
            </div>
            <Link to="/students" className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-widest">View Roster →</Link>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl">
                <Smartphone size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Registry Operations</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">Active Session</p>
              </div>
            </div>
            <Link to="/qr-management" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest block text-center">Open QR Terminal</Link>
          </div>
        </div>
      )}

      {isStudent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Current Holdings</h3>
            <div className="space-y-4">
              {studentStats[0]?.usage_history?.length > 0 ? (
                studentStats[0].usage_history.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Package size={18} className="text-indigo-600" />
                      <span className="text-sm font-bold">{item.component_name}</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Due soon</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 italic uppercase">No active borrowings</p>
              )}
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <History size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">History</span>
              </button>
              <button className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <CheckCircle size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Returns</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          {
            label: 'Total Assets',
            value: stats.totalComponents,
            icon: Package,
            color: 'indigo',
            detail: `${stats.availableQty} available`,
            onClick: () => navigate('/inventory', { state: navCenterState })
          },
          {
            label: 'Low Stock',
            value: stats.lowStock,
            icon: AlertTriangle,
            color: 'amber',
            detail: stats.lowStock > 0 ? 'Restock needed' : 'Levels healthy',
            onClick: () => navigate('/inventory', { state: { ...navCenterState, filter: 'low_stock' } })
          },
          {
            label: 'Out Of Stock',
            value: stats.outOfStock,
            icon: AlertCircle,
            color: 'rose',
            detail: stats.outOfStock > 0 ? 'Immediate action' : 'No stockouts',
            onClick: () => navigate('/inventory', { state: { ...navCenterState, filter: 'out_of_stock' } })
          },
          {
            label: 'Borrowed Today',
            value: stats.todayIssued,
            icon: Activity,
            color: 'blue',
            detail: `+${stats.todayReturned} returned`,
            onClick: () => navigate('/transactions', { state: navCenterState })
          },
          { label: 'System Health', value: stats.totalComponents > 0 ? Math.round((stats.availableQty / stats.totalQuantity) * 100) : 100, icon: CheckCircle, color: 'emerald', detail: 'Operational', isPercent: true }
        ].map((stat, i) => (
          <button
            type="button"
            key={i}
            onClick={stat.onClick}
            className={`bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow group text-left ${stat.onClick ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400 rounded-2xl group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
              {stat.value}{stat.isPercent ? '%' : ''}
            </h2>
            <p className={`text-[10px] font-bold mt-2 uppercase tracking-widest ${stat.color === 'amber' && stats.lowStock > 0 ? 'text-amber-600 dark:text-amber-400 animate-pulse' : 'text-slate-400 dark:text-slate-500'}`}>
              {stat.detail}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Analytics Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-8">
            <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Inventory Liquidity</h3>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">14-day asset movement trend</p>
          </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Returned</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Issued</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="issuedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="returnedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="issued" stroke="#10b981" strokeWidth={3} fill="url(#issuedGrad)" />
                <Area type="monotone" dataKey="returned" stroke="#6366f1" strokeWidth={3} fill="url(#returnedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 uppercase tracking-tighter">Stock Allocation</h3>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-8 uppercase tracking-widest">Distribution by category</p>
          <div className="flex-1 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5} dataKey="value">
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full mt-8 space-y-3">
              {categoryData.slice(0, 4).map((cat, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100/50 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{cat.name}</span>
                  </div>
                  <span className="text-xs font-black text-slate-900 dark:text-white">{cat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Priority Alerts & AI Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Critical Alerts Table */}
        <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Stock Alerts</h3>
            <Link to="/inventory" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 transition-colors">
              Inventory <ChevronRight size={14} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Item</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Qty</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {lowStockItems.length > 0 ? (
                  lowStockItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                            <Package size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="text-sm font-black text-slate-700 dark:text-slate-300">{item.available_quantity}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                          item.status === 'out_of_stock' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'out_of_stock' ? 'bg-red-600' : 'bg-amber-600'}`} />
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-8 py-16 text-center text-slate-400 dark:text-slate-500 font-bold uppercase text-xs tracking-widest">
                      <CheckCircle size={32} className="mx-auto mb-4 opacity-20 text-emerald-500" />
                      All healthy
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI & Activity Column */}
        <div className="space-y-8">
          {/* AI Insights */}
          <div className="bg-slate-900 dark:bg-black p-8 rounded-[40px] shadow-2xl border border-white/5 hover:border-indigo-500/30 transition-all duration-500 group relative overflow-hidden">
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-600/10 blur-[100px] -z-10" />
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                  <Sparkles className="text-indigo-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">AI Predictions</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Demand Forecasting</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {aiInsights.length > 0 ? aiInsights.slice(0, 2).map((insight, idx) => (
                <div key={idx} className="p-5 bg-slate-800/50 dark:bg-slate-900/50 rounded-[24px] border border-white/5 hover:bg-slate-800 transition-all">
                  <span className="text-xs font-black text-slate-100 uppercase tracking-tight block mb-2">{insight.title}</span>
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed">{insight.description}</p>
                </div>
              )) : (
                <div className="text-center py-10 opacity-30">
                  <Brain size={32} className="mx-auto mb-2 text-indigo-400 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Analyzing Data Patterns...</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 group/live">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-slate-600 dark:text-slate-400" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Live Activity</h3>
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-100 dark:before:bg-slate-800">
              {recentTransactions.length > 0 ? recentTransactions.slice(0, 4).map((tx) => (
                <div key={tx.id} className="relative pl-8 group/tx">
                  <div className={`absolute left-0 top-0 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900 shadow-sm flex items-center justify-center z-10 ${
                    tx.transaction_type === 'issue' ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}>
                    {tx.transaction_type === 'issue' ? <ArrowUpRight size={10} className="text-white" /> : <ArrowDownRight size={10} className="text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-1">
                      {tx.component_name}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      {tx.transaction_type === 'issue' ? 'Issued' : 'Returned'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">
                      {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center py-4">No recent activity</p>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-6 rounded-[24px] text-center hover:scale-105 transition-transform cursor-pointer border border-slate-200 dark:border-white/5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Users</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{dashboardSummary?.total_students || 0}</p>
            </div>
            <div className="glass-card p-6 rounded-[24px] text-center hover:scale-105 transition-transform cursor-pointer border border-slate-200 dark:border-white/5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Usage Rate</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{dashboardSummary?.average_utilization_rate || 0}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
