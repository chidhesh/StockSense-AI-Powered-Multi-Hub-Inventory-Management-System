import { useEffect, useState, useRef } from 'react';
import { ShoppingCart, CheckCircle, XCircle, Loader2, Pencil, Save, Package, AlertTriangle } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { PurchaseRequest } from '../types';
import { format } from 'date-fns';
import { useLocation } from 'react-router-dom';

export default function PurchaseApprovalCenter() {
  const { profile } = useAuth();
  const location = useLocation();
  const normalizedRole = profile?.role?.toLowerCase() || '';
  const isMainAdmin = normalizedRole === 'main_admin' || normalizedRole.includes('master admin');
  const isSystemAdmin = normalizedRole === 'system_admin' || normalizedRole === 'master_admin';
  const isInventoryManager = normalizedRole === 'center_admin';

  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PurchaseRequest>>({});
  const selectedRequestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading && selectedRequestRef.current) {
      selectedRequestRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading]);

  const fetchData = async () => {
    setLoading(true);
    apiGet<PurchaseRequest[]>('/api/purchase-requests')
      .then(setPurchaseRequests)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleEdit = (request: PurchaseRequest) => {
    setEditingId(request.id);
    setEditForm({
      required_quantity: request.required_quantity,
      vendor: request.vendor,
      estimated_cost: request.estimated_cost,
      expected_delivery_date: request.expected_delivery_date,
      remarks: request.remarks,
    });
  };

  const handleSaveEdit = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    try {
      await apiPatch(`/api/purchase-requests/${request.id}`, editForm);
      await fetchData();
      setEditingId(null);
    } catch (error) {
      console.error('Edit error:', error);
      alert('Failed to save changes');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleApprove = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    apiPatch(`/api/purchase-requests/${request.id}/approve`, {})
      .then(fetchData)
      .catch(() => alert('Failed to approve'))
      .finally(() => setProcessingId(null));
  };

  const handleReject = async (request: PurchaseRequest) => {
    setProcessingId(request.id);
    apiPatch(`/api/purchase-requests/${request.id}/reject`, {})
      .then(fetchData)
      .catch(() => alert('Failed to reject'))
      .finally(() => setProcessingId(null));
  };

  const handleMarkOrdered = async (request: PurchaseRequest, formData?: any) => {
    setProcessingId(request.id);
    try {
      await apiPatch(`/api/purchase-requests/${request.id}/mark-ordered`, formData || {});
      await fetchData();
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
      await fetchData();
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
      await fetchData();
    } catch {
      alert('Failed to confirm delivery');
    } finally {
      setProcessingId(null);
    }
  };



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Loading Purchase Requests...</p>
    </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <ShoppingCart size={32} className="text-indigo-600" />
            Purchase Approval Center
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Approve and manage purchase requests
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={20} className="text-amber-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Approval</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'PENDING_ADMIN_APPROVAL').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle size={20} className="text-blue-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved by Admin</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'APPROVED_BY_ADMIN').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <ShoppingCart size={20} className="text-purple-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordered</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'ORDERED').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <Package size={20} className="text-emerald-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivered</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'DELIVERED').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle size={20} className="text-green-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Completed</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'COMPLETED').length}
          </p>
        </div>
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <XCircle size={20} className="text-rose-600" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejected</p>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            {purchaseRequests.filter(r => r.status === 'REJECTED').length}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-[32px] overflow-hidden border border-white/40 dark:border-slate-800/40">
        <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6">
          <h2 className="text-[12px] font-black text-slate-400 uppercase tracking-widest">All Purchase Requests</h2>
        </div>

        <div className="p-8 space-y-6">
          {purchaseRequests.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase">No Purchase Requests</p>
            </div>
          ) : (
            purchaseRequests.map(request => {
              const isSelected = (location.state as any)?.requestId === request.request_id || (location.state as any)?.referenceId === request.request_id;
              return (
                <div
                  key={request.id}
                  ref={isSelected ? selectedRequestRef : null}
                  className={`border rounded-2xl p-6 space-y-6 transition-all duration-300 ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/50 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-slate-100 dark:border-slate-800'
                  }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">{request.request_id}</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                      {request.component_name} • {format(new Date(request.created_at), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
            request.status === 'PENDING_ADMIN_APPROVAL' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' :
            request.status === 'APPROVED_BY_ADMIN' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' :
            request.status === 'ORDERED' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' :
            request.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' :
            request.status === 'COMPLETED' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' :
            'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800'
          }`}>
            {request.status}
          </span>
                </div>

                {editingId === request.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</label>
                      <input
                        type="number"
                        value={editForm.required_quantity}
                        onChange={(e) => setEditForm({ ...editForm, required_quantity: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</label>
                      <input
                        type="text"
                        value={editForm.vendor}
                        onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.estimated_cost}
                        onChange={(e) => setEditForm({ ...editForm, estimated_cost: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expected Delivery Date</label>
                      <input
                        type="date"
                        value={editForm.expected_delivery_date}
                        onChange={(e) => setEditForm({ ...editForm, expected_delivery_date: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks</label>
                      <textarea
                        value={editForm.remarks}
                        onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                        rows={2}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                    <div className="flex gap-3 justify-end col-span-2 pt-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(request)}
                        disabled={processingId === request.id}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {processingId === request.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Destination Hub</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{request.destination_hub_name || request.destination_hub_id}</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Quantity</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{request.required_quantity}</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Cost</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">₹{(Number(request.estimated_cost) || 0).toFixed(2)}</p>
                    </div>
                    {request.vendor && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Vendor</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{request.vendor}</p>
                      </div>
                    )}
                    {request.expected_delivery_date && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Expected Delivery</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{format(new Date(request.expected_delivery_date), 'MMM dd, yyyy')}</p>
                      </div>
                    )}
                    {request.remarks && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remarks</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{request.remarks}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  {/* Main Admin actions: Approve/Reject Pending requests */}
                  {request.status === 'PENDING_ADMIN_APPROVAL' && !editingId && isMainAdmin && (
                    <>
                      <button
                        onClick={() => handleEdit(request)}
                        disabled={processingId === request.id}
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        <Pencil size={16} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleReject(request)}
                        disabled={processingId === request.id}
                        className="px-6 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={processingId === request.id}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                    </>
                  )}

                  {/* System Admin actions: Update vendor and mark as Ordered when Approved */}
                  {(request.status === 'APPROVED_BY_ADMIN') && isSystemAdmin && (
                    <>
                      {editingId === request.id ? (
                        <>
                          <button
                            onClick={handleCancelEdit}
                            className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleMarkOrdered(request, editForm)}
                            disabled={processingId === request.id}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <ShoppingCart size={16} />}
                            Mark Ordered
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEdit(request)}
                          disabled={processingId === request.id}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          <Pencil size={16} />
                          Update Vendor & Order
                        </button>
                      )}
                    </>
                  )}

                  {/* System Admin: Mark as Delivered when Ordered */}
                  {request.status === 'ORDERED' && isSystemAdmin && (
                    <button
                      onClick={() => handleMarkDelivered(request)}
                      disabled={processingId === request.id}
                      className="px-6 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {processingId === request.id ? <Loader2 className="animate-spin" size={16} /> : <Package size={16} />}
                      Mark Delivered
                    </button>
                  )}

                  {/* Inventory Manager: Confirm Delivery when Delivered */}
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
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
