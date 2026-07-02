import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowLeftRight, ShoppingCart, CheckCircle, XCircle, Loader2, AlertTriangle, Zap, Package } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { ReplenishmentRequest, Notification } from '../types';
import { format } from 'date-fns';

export default function AIInventoryDecisionCenter() {
  const { profile } = useAuth();
  const normalizedRole = profile?.role?.toLowerCase() || '';
  const isSystemAdmin = normalizedRole === 'system_admin' || normalizedRole.includes('system administrator') || profile?.email === 'system@techhub.in' || profile?.email === 'admin@techhub.in';

  const [replenishmentRequests, setReplenishmentRequests] = useState<ReplenishmentRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [replenishmentRes, notificationsRes] = await Promise.all([
        apiGet<ReplenishmentRequest[]>('/api/replenishment-requests'),
        apiGet<Notification[]>('/api/notifications')
      ]);
      setReplenishmentRequests(replenishmentRes);
      setNotifications(notificationsRes);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTransferRequests = async (request: ReplenishmentRequest) => {
    setProcessingRequest(request.id);
    try {
      await apiPost(`/api/replenishment-requests/${request.id}/generate-transfer-requests`, {});
      await fetchData();
      alert('Transfer requests generated successfully!');
    } catch (error) {
      console.error('Error generating transfer requests:', error);
      alert('Failed to generate transfer requests');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleGeneratePurchaseRequest = async (request: ReplenishmentRequest) => {
    setProcessingRequest(request.id);
    try {
      await apiPost(`/api/replenishment-requests/${request.id}/generate-purchase-request`, {});
      await fetchData();
      alert('Purchase request generated successfully!');
    } catch (error) {
      console.error('Error generating purchase request:', error);
      alert('Failed to generate purchase request');
    } finally {
      setProcessingRequest(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
        <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest animate-pulse">Initializing AI Decision Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <Zap size={32} className="text-yellow-500" />
            AI Inventory Decision Center
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Review and approve AI-powered replenishment decisions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={20} className="text-amber-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Review</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {replenishmentRequests.filter(r => r.status === 'AI_REVIEW_COMPLETE').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <ShoppingCart size={20} className="text-indigo-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transfer Decisions</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {replenishmentRequests.filter(r => r.ai_decision_type === 'TRANSFER').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp size={20} className="text-emerald-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Purchase Decisions</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {replenishmentRequests.filter(r => r.ai_decision_type === 'PURCHASE').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <Package size={20} className="text-purple-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Requests</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {replenishmentRequests.length}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-[32px] overflow-hidden border border-white/40 dark:border-slate-800/40">
        <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6">
          <h2 className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Replenishment Requests</h2>
        </div>

        <div className="p-8 space-y-6">
          {replenishmentRequests.length === 0 ? (
            <div className="text-center py-16">
              <Package size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase">No replenishment requests</p>
            </div>
          ) : (
            replenishmentRequests.map(request => (
              <div key={request.id} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">{request.request_id}</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{request.component_name} • {format(new Date(request.created_at), 'MMM dd, yyyy')}</p>
                  </div>
                  <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                    request.status === 'PENDING_AI_REVIEW' ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' :
                    request.status === 'AI_REVIEW_COMPLETE' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' :
                    ['TRANSFER_REQUESTS_GENERATED', 'PURCHASE_REQUEST_GENERATED'].includes(request.status) ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' :
                    request.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' :
                    'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800'
                  }`}>
                    {request.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Stock</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{request.current_quantity}</p>
                    <p className="text-[10px] text-slate-400 uppercase mt-1">Threshold: {request.min_stock_threshold || 0}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Required Quantity</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{request.required_quantity}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Forecasted Demand</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{request.ai_forecast_quantity || 0}</p>
                    <p className="text-[10px] text-slate-400 uppercase mt-1">
                      Confidence: {Math.round((Number(request.ai_forecast_confidence) || 0) * 100)}%
                    </p>
                  </div>
                </div>

                {request.ai_decision_type && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">AI Decision</p>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                          request.ai_decision_type === 'TRANSFER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {request.ai_decision_type}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          {Math.round((Number(request.ai_decision_confidence) || 0) * 100)}% confident
                        </span>
                      </div>
                    </div>

                    {request.ai_reason && (
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-xl">
                        <p className="text-[10px] font-black text-yellow-700 dark:text-yellow-400 uppercase tracking-widest mb-2">AI Reason</p>
                        <p className="text-xs font-bold text-yellow-900 dark:text-yellow-200">{request.ai_reason}</p>
                      </div>
                    )}
                  </div>
                )}

                {request.ai_decision_type === 'TRANSFER' && (
      <>
        {/* Allocation Calculation Display */}
        {request.ai_debug_info && request.ai_debug_info.hubAnalysis && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-4">
            <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-3">Allocation Calculation</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-amber-100 dark:bg-amber-900/30">
                  <tr>
                    <th className="px-3 py-2 rounded-tl-lg">Hub Name</th>
                    <th className="px-3 py-2">Current Stock</th>
                    <th className="px-3 py-2">Threshold</th>
                    <th className="px-3 py-2">Forecast</th>
                    <th className="px-3 py-2 rounded-tr-lg">Transferable</th>
                  </tr>
                </thead>
                <tbody>
                  {request.ai_debug_info.hubAnalysis.map((hub: any, idx: number) => (
                    <tr key={idx} className="border-b border-amber-200 dark:border-amber-800 last:border-0">
                      <td className="px-3 py-2 font-bold">{hub.centerName}</td>
                      <td className="px-3 py-2">{hub.currentStock}</td>
                      <td className="px-3 py-2">{hub.safetyStock}</td>
                      <td className="px-3 py-2">{Math.max(1, Math.ceil((hub.safetyStock || 10) * 0.5))}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded text-xs font-black ${hub.transferable > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {hub.transferable}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {request.ai_debug_info.totalTransferable !== undefined && (
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-3">Total Transferable: {request.ai_debug_info.totalTransferable} units</p>
            )}
          </div>
        )}

        {/* Recommended Allocation */}
        {request.ai_transfer_allocation && Array.isArray(request.ai_transfer_allocation) && request.ai_transfer_allocation.length > 0 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Recommended Allocation</p>
            <div className="space-y-3">
              {request.ai_transfer_allocation.map((plan: any, index: number) => (
                <div key={index} className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{plan.sourceHubName || plan.sourceHubId}</span>
                    <ArrowLeftRight size={14} className="text-slate-400" />
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{request.center_name}</span>
                  </div>
                  <span className="text-[11px] font-black text-slate-900 dark:text-white">{plan.transferQuantity || plan.quantity} units</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )}

                {request.ai_decision_type === 'PURCHASE' && (
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    {request.ai_purchase_estimated_cost && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Cost</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">₹{(Number(request.ai_purchase_estimated_cost) || 0).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Debug Panel */}
                {request.ai_debug_info && (
                  <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl space-y-4">
                    <h4 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={16} /> AI Decision Debug Panel
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Component</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{request.ai_debug_info.component}</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Required Quantity</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{request.ai_debug_info.required}</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Transferable</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{request.ai_debug_info.totalTransferable}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Hub Analysis</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase">
                            <tr>
                              <th className="px-4 py-2 rounded-tl-xl">Hub</th>
                              <th className="px-4 py-2">Current Stock</th>
                              <th className="px-4 py-2">Safety Stock</th>
                              <th className="px-4 py-2 rounded-tr-xl">Transferable</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {request.ai_debug_info.hubAnalysis.map((hub: any, index: number) => (
                              <tr key={index} className="border-t border-slate-200 dark:border-slate-700">
                                <td className="px-4 py-2 font-bold">{hub.centerName}</td>
                                <td className="px-4 py-2">{hub.currentStock}</td>
                                <td className="px-4 py-2">{hub.safetyStock}</td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-1 rounded-lg text-xs font-black ${hub.transferable > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    {hub.transferable}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Decision</p>
                        <p className={`text-sm font-black ${request.ai_debug_info.decision === 'TRANSFER' ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {request.ai_debug_info.decision}
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Reason</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{request.ai_debug_info.reason}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  {request.status === 'AI_REVIEW_COMPLETE' && request.ai_decision_type === 'TRANSFER' && (
                    <button
                      onClick={() => handleGenerateTransferRequests(request)}
                      disabled={processingRequest === request.id}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {processingRequest === request.id ? <Loader2 size={16} className="animate-spin" /> : null}
                      Generate Transfer Requests
                    </button>
                  )}
                  {request.status === 'AI_REVIEW_COMPLETE' && request.ai_decision_type === 'PURCHASE' && (
                    <button
                      onClick={() => handleGeneratePurchaseRequest(request)}
                      disabled={processingRequest === request.id}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {processingRequest === request.id ? <Loader2 size={16} className="animate-spin" /> : null}
                      Generate Purchase Request
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
