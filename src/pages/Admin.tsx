import { useEffect, useState } from 'react';
import { Activity, AlertCircle, ArrowLeftRight, Package, Users, Building2, ShoppingCart, BarChart3, Bell, CheckCircle, XCircle, Loader2, GraduationCap, Shield, UserCog, Truck, Save } from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Center, Component, HubTransferRequest, Profile } from '../types';
import { format } from 'date-fns';

interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  branch?: string;
  phone?: string;
  email?: string;
  center_id?: string;
  created_at: string;
}

interface PurchaseRequest {
  id: string;
  request_id: string;
  component_name: string;
  required_quantity: number;
  vendor?: string;
  estimated_cost?: number;
  destination_hub_id?: string;
  destination_hub_name?: string;
  expected_delivery_date?: string;
  remarks?: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export default function Admin() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<Center[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [transfers, setTransfers] = useState<HubTransferRequest[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'students' | 'hubs' | 'purchases'>('overview');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [centersRes, componentsRes, transfersRes, usersRes, studentsRes, purchasesRes] = await Promise.all([
        apiGet<Center[]>('/api/centers'),
        apiGet<Component[]>('/api/components'),
        apiGet<HubTransferRequest[]>('/api/hub-transfers'),
        apiGet<Profile[]>('/api/profiles'),
        apiGet<Student[]>('/api/students'),
        apiGet<PurchaseRequest[]>('/api/purchase-requests')
      ]);
      setCenters(centersRes);
      setComponents(componentsRes);
      setTransfers(transfersRes);
      setUsers(usersRes);
      setStudents(studentsRes);
      setPurchaseRequests(purchasesRes);

      const stockAlerts = components.filter(c => 
        c.available_quantity <= 0 || 
        c.available_quantity / c.total_quantity <= 0.2
      );
      setAlerts(stockAlerts);
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    } finally {
      setLoading(false);
    }
  };

  const sendStockAlertEmail = async (component: Component) => {
    try {
      await apiPost('/api/notifications/stock-alert', {
        componentName: component.name,
        currentStock: component.available_quantity,
        minimumRequired: Math.ceil(component.total_quantity * 0.2),
        centerId: component.center_id
      });
      alert('Stock alert email sent successfully!');
    } catch (e) {
      alert('Failed to send email');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Loading Admin Dashboard...</p>
    </div>
  );

  const totalInventoryValue = components.reduce((sum, c) => sum + (c.available_quantity * Number(c.unit_cost)), 0);
  const pendingTransfers = transfers.filter(t => t.status === 'pending');
  const lowStockComponents = components.filter(c => c.available_quantity <= 0 || (c.available_quantity / c.total_quantity) <= 0.2);
  const excessStockComponents = components.filter(c => (c.available_quantity / c.total_quantity) >= 0.8);
  const mainAdmins = users.filter(u => u.role === 'main_admin');
  const systemAdmins = users.filter(u => u.role === 'system_admin');
  const inventoryManagers = users.filter(u => u.role === 'center_admin');
  const studentUsers = users.filter(u => u.role === 'student');

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <Activity className="text-indigo-600" size={32} />
            Admin Dashboard
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Complete system monitoring and management
          </p>
        </div>
      </div>

      <div className="flex bg-white dark:bg-slate-900 p-2 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
        {(['overview', 'users', 'students', 'hubs', 'purchases'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-4 px-6 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'users' && 'Users & Roles'}
            {tab === 'students' && 'Students'}
            {tab === 'hubs' && 'Inventory Hubs'}
            {tab === 'purchases' && 'Purchase Requests'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-6">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                  <Building2 className="text-indigo-600 dark:text-indigo-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Hubs</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{centers.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
                  <Package className="text-emerald-600 dark:text-emerald-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory Value</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">₹{totalInventoryValue.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
                  <Bell className="text-amber-600 dark:text-amber-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock Alerts</p>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-400">{lowStockComponents.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                  <ArrowLeftRight className="text-blue-600 dark:text-blue-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Transfers</p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{pendingTransfers.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center">
                  <ShoppingCart className="text-purple-600 dark:text-purple-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Approval</p>
                  <p className="text-3xl font-black text-purple-600 dark:text-purple-400">{purchaseRequests.filter(r => r.status === 'PENDING_ADMIN_APPROVAL').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                  <CheckCircle className="text-blue-600 dark:text-blue-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved for Procurement</p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{purchaseRequests.filter(r => r.status === 'APPROVED_BY_ADMIN').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center">
                  <Truck className="text-purple-600 dark:text-purple-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivered for Confirmation</p>
                  <p className="text-3xl font-black text-purple-600 dark:text-purple-400">{purchaseRequests.filter(r => r.status === 'DELIVERED').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-pink-100 dark:bg-pink-900/30 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="text-pink-600 dark:text-pink-400" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Students</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{students.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                  <AlertCircle className="text-amber-600" size={24} />
                  Low Stock & Out of Stock
                </h2>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {lowStockComponents.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <CheckCircle size={48} className="mx-auto mb-4 text-emerald-500" />
                    <p className="text-sm font-bold uppercase tracking-widest">All stock levels are healthy!</p>
                  </div>
                ) : (
                  lowStockComponents.map((component) => (
                    <div key={component.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{component.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            {centers.find(c => c.id === component.center_id)?.name || 'Unknown Hub'}
                          </p>
                        </div>
                        <button
                          onClick={() => sendStockAlertEmail(component)}
                          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all"
                        >
                          Send Alert
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              component.available_quantity <= 0 
                                ? 'bg-rose-600' 
                                : 'bg-amber-600'
                            }`}
                            style={{ width: `${Math.min(100, (component.available_quantity / component.total_quantity) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                          {component.available_quantity} / {component.total_quantity}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                  <ShoppingCart className="text-blue-600" size={24} />
                  Approved Purchase Requests (Ready for Procurement)
                </h2>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {purchaseRequests.filter(r => r.status === 'APPROVED_BY_ADMIN').length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-sm font-bold uppercase tracking-widest">No approved purchase requests yet</p>
                  </div>
                ) : (
                  purchaseRequests.filter(r => r.status === 'APPROVED_BY_ADMIN').map((request) => (
                    <div key={request.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{request.request_id}</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{request.component_name} • {request.required_quantity} units</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            Destination: {request.destination_hub_name || centers.find(c => c.id === request.destination_hub_id)?.name || 'N/A'}
                          </p>
                          {request.vendor && <p className="text-sm text-slate-600 dark:text-slate-300">Vendor: {request.vendor}</p>}
                          {request.estimated_cost && (
                            <p className="text-sm text-slate-600 dark:text-slate-300">Est. Cost: ₹{Number(request.estimated_cost).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                <ArrowLeftRight className="text-indigo-600" size={24} />
                Recent Hub Transfers
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">From → To</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {transfers.slice(0, 10).map((t) => (
                    <tr key={t.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.component_name}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase">{t.source_center_name}</span>
                          <ArrowLeftRight size={12} className="text-slate-300" />
                          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">{t.destination_center_name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{t.quantity} units</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                          t.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                          t.status === 'main_admin_approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                          t.status === 'source_center_approved' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' :
                          t.status === 'in_transit' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                          'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                        }`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase">{format(new Date(t.created_at), 'MMM dd, yyyy')}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                    <Shield className="text-red-600 dark:text-red-400" size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Main Admins</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">{mainAdmins.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center">
                    <AlertCircle className="text-purple-600 dark:text-purple-400" size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Admins</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">{systemAdmins.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
                    <UserCog className="text-emerald-600 dark:text-emerald-400" size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory Managers</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">{inventoryManagers.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                    <GraduationCap className="text-blue-600 dark:text-blue-400" size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Users</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">{studentUsers.length}</p>
                  </div>
                </div>
              </div>
            </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">All Users</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hub</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{u.full_name}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm text-slate-600 dark:text-slate-300">{u.email}</p>
                      </td>
                      <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        u.role === 'main_admin'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : u.role === 'system_admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                          : u.role === 'center_admin'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}>
                        {u.role === 'main_admin' ? 'Main Admin' : u.role === 'system_admin' ? 'System Admin' : u.role === 'center_admin' ? 'Inventory Manager' : 'Student'}
                      </span>
                    </td>
                      <td className="px-8 py-6">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {u.center ? u.center.name : 'N/A'}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase">{format(new Date(u.created_at), 'MMM dd, yyyy')}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">All Students</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll Number</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {students.map((s) => (
                  <tr key={s.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-6">
                      <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{s.full_name}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-black text-slate-600 dark:text-slate-300">{s.roll_number}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{s.branch || 'N/A'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{s.email || 'N/A'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{s.phone || 'N/A'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {centers.find(c => c.id === s.center_id)?.name || 'N/A'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'hubs' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {centers.map((center) => (
              <div key={center.id} className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <Building2 className="text-indigo-600 dark:text-indigo-400" size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{center.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{center.location}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Components</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white">
                      {components.filter(c => c.center_id === center.id).length}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manager</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {inventoryManagers.find(m => m.center_id === center.id)?.full_name || 'Unassigned'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'purchases' && (
        <PurchaseManagementTab />
      )}
    </div>
  );
}

function PurchaseManagementTab() {
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PurchaseRequest>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { profile } = useAuth();

  const isMainAdmin = profile?.role === 'main_admin' || profile?.role?.toLowerCase() === 'system administrator';
  const isSystemAdmin = profile?.role === 'system_admin' || profile?.role?.toLowerCase() === 'master admin';
  const isInventoryManager = profile?.role === 'center_admin';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [purchasesRes, centersRes] = await Promise.all([
          apiGet<PurchaseRequest[]>('/api/purchase-requests'),
          apiGet<Center[]>('/api/centers')
        ]);
        setPurchaseRequests(purchasesRes);
        setCenters(centersRes);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const refreshData = async () => {
    const res = await apiGet<PurchaseRequest[]>('/api/purchase-requests');
    setPurchaseRequests(res);
  };

  const handleMarkOrdered = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    try {
      await apiPatch(`/api/purchase-requests/${request.id}/mark-ordered`, editForm);
      await refreshData();
      setEditingId(null);
    } catch {
      alert('Failed to mark as ordered');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkDelivered = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    try {
      await apiPatch(`/api/purchase-requests/${request.id}/mark-delivered`, {});
      await refreshData();
    } catch {
      alert('Failed to mark as delivered');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmDelivery = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    try {
      await apiPost(`/api/purchase-requests/${request.id}/confirm-delivery`, {});
      await refreshData();
    } catch {
      alert('Failed to confirm delivery');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest animate-pulse">Loading Purchase Requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">All Purchase Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Request ID</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination Hub</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {purchaseRequests.map((request) => (
                <tr key={request.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{request.request_id}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{request.component_name}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {request.destination_hub_name || centers.find(c => c.id === request.destination_hub_id)?.name || 'N/A'}
                    </p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-slate-900 dark:text-white">{request.required_quantity}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{request.vendor || 'N/A'}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      request.status === 'PENDING_ADMIN_APPROVAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                      request.status === 'APPROVED_BY_ADMIN' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                      request.status === 'ORDERED' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' :
                      request.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                      request.status === 'RECEIVED' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      request.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                    }`}>
                      {request.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase">{format(new Date(request.created_at), 'MMM dd, yyyy')}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex gap-3 justify-end">
                      {request.status === 'APPROVED_BY_ADMIN' && isSystemAdmin && (
                        editingId === request.id ? (
                          <button
                            onClick={() => handleMarkOrdered(request)}
                            disabled={processingId === request.id}
                            className="px-6 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <ShoppingCart size={16} />}
                            Mark Ordered
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(request.id);
                              setEditForm({ vendor: request.vendor, estimated_cost: request.estimated_cost, expected_delivery_date: request.expected_delivery_date, remarks: request.remarks });
                            }}
                            disabled={processingId === request.id}
                            className="px-6 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            <ShoppingCart size={16} />
                            Manage Order
                          </button>
                        )
                      )}
                      {request.status === 'ORDERED' && isSystemAdmin && (
                        <button
                          onClick={() => handleMarkDelivered(request)}
                          disabled={processingId === request.id}
                          className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <Truck size={16} />}
                          Mark Delivered
                        </button>
                      )}
                      {request.status === 'DELIVERED' && isInventoryManager && (
                        <button
                          onClick={() => handleConfirmDelivery(request)}
                          disabled={processingId === request.id}
                          className="px-6 py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                          Confirm Delivery
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Manage Order</h2>
              <button onClick={() => setEditingId(null)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
                <XCircle className="text-slate-400" size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Vendor</label>
                <input
                  type="text"
                  value={editForm.vendor || ''}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Estimated Cost</label>
                <input
                  type="number"
                  value={editForm.estimated_cost || ''}
                  onChange={(e) => setEditForm({ ...editForm, estimated_cost: Number(e.target.value) })}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Expected Delivery Date</label>
                <input
                  type="date"
                  value={editForm.expected_delivery_date || ''}
                  onChange={(e) => setEditForm({ ...editForm, expected_delivery_date: e.target.value })}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Remarks</label>
                <textarea
                  value={editForm.remarks || ''}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const request = purchaseRequests.find(r => r.id === editingId)!;
                    handleMarkOrdered(request);
                  }}
                  disabled={processingId === editingId}
                  className="px-6 py-4 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {processingId === editingId ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Mark as Ordered
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
