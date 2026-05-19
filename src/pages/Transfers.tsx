import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle, XCircle, Clock, Loader2, Plus, Info, MapPin, Package, AlertCircle } from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { HubTransferRequest, Center, Component } from '../types';
import { format } from 'date-fns';

export default function Transfers() {
  const { profile } = useAuth();
  const isMaster = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  
  const [transfers, setTransfers] = useState<HubTransferRequest[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [form, setForm] = useState({
    source_center_id: '',
    destination_center_id: '',
    component_id: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const centerQuery = !isMaster ? `?center_id=${profile?.center_id}` : '';
      const [transfersRes, centersRes, componentsRes] = await Promise.all([
        apiGet<HubTransferRequest[]>(`/api/hub-transfers${centerQuery}`),
        apiGet<Center[]>('/api/centers'),
        apiGet<Component[]>('/api/components')
      ]);
      setTransfers(transfersRes);
      setCenters(centersRes);
      setComponents(componentsRes);
    } catch (e) {
      console.error('Failed to fetch transfers', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTransfer = async () => {
    if (!form.source_center_id || !form.destination_center_id || !form.component_id || form.quantity <= 0) {
      setError('Please fill all required fields');
      return;
    }
    if (form.source_center_id === form.destination_center_id) {
      setError('Source and Destination hubs cannot be the same');
      return;
    }

    const sourceComp = components.find(c => c.id === form.component_id && c.center_id === form.source_center_id);
    if (!sourceComp || sourceComp.available_quantity < form.quantity) {
      setError('Insufficient stock in source hub');
      return;
    }

    setSaving(true);
    try {
      await apiPost('/api/hub-transfers', {
        ...form,
        requested_by: profile?.id
      });
      setShowModal(false);
      setForm({ source_center_id: '', destination_center_id: '', component_id: '', quantity: 1, notes: '' });
      await fetchData();
    } catch (e) {
      setError('Failed to create transfer request');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await apiPatch(`/api/hub-transfers/${id}`, {
        status,
        approved_by: profile?.id
      });
      await fetchData();
    } catch (e) {
      alert('Failed to update transfer status');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="px-3 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 rounded-full text-[10px] font-black uppercase">Pending Approval</span>;
      case 'approved': return <span className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-full text-[10px] font-black uppercase">Approved</span>;
      case 'completed': return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase">Completed</span>;
      case 'rejected': return <span className="px-3 py-1 bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 rounded-full text-[10px] font-black uppercase">Rejected</span>;
      default: return null;
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Syncing Transfers...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Hub Transfers
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Manage inter-hub component movements
          </p>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-[20px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all font-black text-[10px] uppercase tracking-widest"
        >
          <Plus size={18} /> New Transfer Request
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {transfers.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-20 text-center border border-slate-100 dark:border-slate-800">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <ArrowLeftRight className="text-slate-300 dark:text-slate-600" size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">No Transfer Requests</h3>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">Inventory movements will appear here</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">From → To</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {transfers.map((t) => (
                  <tr key={t.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                          <Package size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.component_name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{format(new Date(t.created_at), 'MMM dd, yyyy')}</p>
                        </div>
                      </div>
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
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="px-8 py-6 text-right">
                      {isMaster && t.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(t.id, 'approved')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                            title="Approve"
                          >
                            <CheckCircle size={20} />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(t.id, 'rejected')}
                            className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            title="Reject"
                          >
                            <XCircle size={20} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-lg p-10 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">New Transfer</h2>
              <button onClick={() => setShowModal(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
                <XCircle className="text-slate-400" size={24} />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <AlertCircle size={20} />
                <p className="text-[10px] font-black uppercase tracking-widest">{error}</p>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Source Hub</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <select
                    value={form.source_center_id}
                    onChange={(e) => setForm({ ...form, source_center_id: e.target.value, component_id: '' })}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                  >
                    <option value="">Select Source</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Component to Transfer</label>
                <div className="relative">
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <select
                    value={form.component_id}
                    onChange={(e) => setForm({ ...form, component_id: e.target.value })}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                    disabled={!form.source_center_id}
                  >
                    <option value="">Select Component</option>
                    {components
                      .filter(c => c.center_id === form.source_center_id && c.available_quantity > 0)
                      .map(c => <option key={c.id} value={c.id}>{c.name} ({c.available_quantity} available)</option>)
                    }
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Destination Hub</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <select
                    value={form.destination_center_id}
                    onChange={(e) => setForm({ ...form, destination_center_id: e.target.value })}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                  >
                    <option value="">Select Destination</option>
                    {centers.filter(c => c.id !== form.source_center_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                />
              </div>

              <button
                onClick={handleCreateTransfer}
                disabled={saving}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 disabled:opacity-50 transition-all font-black text-[10px] uppercase tracking-[0.2em] mt-4"
              >
                {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
