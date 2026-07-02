import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ArrowLeftRight, Package, MapPin, TrendingUp, Info } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { StockAlert, Center, Component, HubTransferRequest } from '../types';
import { format } from 'date-fns';

export default function SystemAdmin() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [transfers, setTransfers] = useState<HubTransferRequest[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<StockAlert | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedSplits, setSelectedSplits] = useState<{ source_center_id: string; quantity: number }[]>([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [alertsRes, centersRes, componentsRes, transfersRes] = await Promise.all([
        apiGet<StockAlert[]>('/api/stock-alerts'),
        apiGet<Center[]>('/api/centers'),
        apiGet<Component[]>('/api/components'),
        apiGet<HubTransferRequest[]>('/api/hub-transfers')
      ]);
      setAlerts(alertsRes);
      setCenters(centersRes);
      setComponents(componentsRes);
      setTransfers(transfersRes);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSplitTransfer = async () => {
    if (!selectedAlert || selectedSplits.length === 0) return;
    
    try {
      await apiPost('/api/hub-transfers/split', {
        destination_center_id: selectedAlert.center_id,
        component_id: selectedAlert.component_id,
        requested_by: profile?.id,
        notes: `Split transfer for ${selectedAlert.component_name} - low stock at ${selectedAlert.center_name}`,
        splits: selectedSplits
      });
      
      setShowTransferModal(false);
      setSelectedAlert(null);
      setSelectedSplits([]);
      await fetchAllData();
    } catch (error) {
      console.error('Failed to create transfer:', error);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'low_stock': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'out_of_stock': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTransferStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-black">Pending</span>;
      case 'main_admin_approved': return <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-black">Main Admin Approved</span>;
      case 'source_center_approved': return <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-black">Source Center Approved</span>;
      case 'in_transit': return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-black">In Transit</span>;
      case 'completed': return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">Completed</span>;
      case 'rejected': return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-black">Rejected</span>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest animate-pulse">Loading System Admin Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <AlertTriangle className="text-indigo-600" size={32} />
            System Admin Dashboard
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Monitor stock levels and manage inter-hub transfers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={20} className="text-red-500" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Out of Stock</p>
          </div>
          <p className="text-3xl font-black">{alerts.filter(a => a.status === 'out_of_stock').length}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock</p>
          </div>
          <p className="text-3xl font-black">{alerts.filter(a => a.status === 'low_stock').length}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <ArrowLeftRight size={20} className="text-blue-500" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Transfers</p>
          </div>
          <p className="text-3xl font-black">{transfers.filter(t => t.status === 'pending').length}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Package size={20} className="text-emerald-500" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Centers</p>
          </div>
          <p className="text-3xl font-black">{centers.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 rounded-[24px] p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-600" />
            Stock Alerts
          </h2>
          
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto mb-4 text-emerald-500" size={48} />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">All stock levels are healthy!</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {alerts.map((alert) => (
                <div 
                  key={alert.id} 
                  className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                  onClick={() => {
                    setSelectedAlert(alert);
                    if (alert.transfer_options) {
                      setSelectedSplits(alert.transfer_options.map(opt => ({
                        source_center_id: opt.source_center_id,
                        quantity: opt.suggested_transfer_quantity
                      })));
                    }
                    setShowTransferModal(true);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{alert.component_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        <MapPin size={12} />
                        {alert.center_name}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusBadgeClass(alert.status)}`}>
                      {alert.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {alert.available_quantity} / {alert.total_quantity} available
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-black ${
                        alert.recommendation === 'transfer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                      }`}>
                        {alert.recommendation === 'transfer' ? 'TRANSFER' : 'PURCHASE'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-full rounded-full ${alert.status === 'out_of_stock' ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, (alert.available_quantity / alert.total_quantity) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[24px] p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-indigo-600" />
            Recent Transfer Requests
          </h2>
          
          {transfers.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight className="mx-auto mb-4 text-slate-300" size={48} />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No transfer requests yet</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {transfers.slice(0, 10).map((transfer) => (
                <div key={transfer.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{transfer.component_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        {transfer.source_center_name} → {transfer.destination_center_name}
                      </p>
                    </div>
                    {getTransferStatusBadge(transfer.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600 dark:text-slate-400">Qty: {transfer.quantity}</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase">{format(new Date(transfer.created_at), 'MMM dd')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTransferModal && selectedAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Create Transfer Request</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedAlert.component_name} for {selectedAlert.center_name}</p>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
                <CheckCircle className="text-slate-400" size={24} />
              </button>
            </div>

            <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
              <div className="flex items-start gap-3">
                <Info className="text-amber-600 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Predicted Demand: {selectedAlert.predicted_demand_30_days} units</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Current stock: {selectedAlert.available_quantity} / {selectedAlert.total_quantity}</p>
                </div>
              </div>
            </div>

            {selectedAlert.transfer_options && selectedAlert.transfer_options.length > 0 ? (
              <div className="space-y-4 mb-8">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Available Centers</h3>
                {selectedAlert.transfer_options.map((option) => (
                  <div key={option.source_center_id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{option.source_center_name}</p>
                        <p className="text-xs text-slate-500">Excess Available: {option.available_excess} units</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600">Qty:</label>
                        <input
                          type="number"
                          min="0"
                          max={option.available_excess}
                          value={selectedSplits.find(s => s.source_center_id === option.source_center_id)?.quantity || 0}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 0;
                            setSelectedSplits(prev => {
                              const existing = prev.find(s => s.source_center_id === option.source_center_id);
                              if (existing) {
                                return prev.map(s => s.source_center_id === option.source_center_id ? { ...s, quantity: qty } : s);
                              }
                              return [...prev, { source_center_id: option.source_center_id, quantity: qty }];
                            });
                          }}
                          className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-8 p-6 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-900/30 text-center">
                <TrendingUp className="mx-auto mb-3 text-purple-600" size={28} />
                <p className="text-sm font-black text-purple-900 dark:text-purple-300">No excess stock available at other centers</p>
                <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">Recommendation: Purchase new stock</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              {selectedAlert.transfer_options && selectedAlert.transfer_options.length > 0 && (
                <button
                  onClick={handleCreateSplitTransfer}
                  disabled={selectedSplits.reduce((sum, s) => sum + s.quantity, 0) === 0}
                  className="flex-1 py-4 px-6 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Create Transfer Request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
