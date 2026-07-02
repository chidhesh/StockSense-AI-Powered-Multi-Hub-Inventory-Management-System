
import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle, XCircle, Package, Send, Loader2, Truck } from 'lucide-react';
import { apiGet, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { TransferRequest as NewTransferRequest } from '../types';
import { format } from 'date-fns';

export default function TransferRequests() {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<NewTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<NewTransferRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiGet<NewTransferRequest[]>('/api/transfer-requests');
      setTransfers(res);
    } catch (e) {
      console.error('Failed to fetch transfer requests:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transfer: NewTransferRequest) => {
    try {
      await apiPatch(`/api/transfer-requests/${transfer.id}/approve`, { action: 'approve' });
      await fetchData();
    } catch (e) {
      alert('Failed to approve transfer');
    }
  };

  const handleReject = async () => {
    if (!selectedTransfer) return;
    try {
      await apiPatch(`/api/transfer-requests/${selectedTransfer.id}/approve`, {
        action: 'reject',
        reason: rejectReason,
      });
      await fetchData();
      setRejectModalOpen(false);
      setSelectedTransfer(null);
      setRejectReason('');
    } catch (e) {
      alert('Failed to reject transfer');
    }
  };

  const handleShip = async (transfer: NewTransferRequest) => {
    try {
      await apiPatch(`/api/transfer-requests/${transfer.id}/ship`, {});
      await fetchData();
    } catch (e) {
      alert('Failed to mark as shipped');
    }
  };

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';
    switch (normalizedStatus) {
      case 'pending':
        return (
          <span className="px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-[10px] font-black uppercase">
            Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-[10px] font-black uppercase">
            Approved
          </span>
        );
      case 'in_transit':
        return (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-full text-[10px] font-black uppercase">
            In Transit
          </span>
        );
      case 'completed':
        return (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full text-[10px] font-black uppercase">
            Completed
          </span>
        );
      case 'rejected':
        return (
          <span className="px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-full text-[10px] font-black uppercase">
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest animate-pulse">Syncing Transfers...</p>
      </div>
    );
  }

  const filteredTransfers = transfers.filter(
    (t) => profile?.center_id && t.source_hub_id === profile.center_id
  );

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Transfer Requests
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Approve, reject, and ship transfer requests from your hub
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800">
        <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Requests to Approve & Send
          </h3>
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400">
            {filteredTransfers.length}
          </span>
        </div>
        {filteredTransfers.length === 0 ? (
          <div className="p-12 text-center">
            <Send className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={40} />
            <p className="text-sm font-bold text-slate-500">No pending transfer requests</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTransfers.map((transfer) => (
              <div key={transfer.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 rounded-xl">
                      <Package size={24} />
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black text-slate-900 dark:text-white">
                          {transfer.component_name}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px]">
                          <span className="font-black text-slate-600 dark:text-slate-400 uppercase">
                            Request ID: {transfer.request_id}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-slate-500 uppercase">
                            Created: {format(new Date(transfer.created_at), 'MMM dd, yyyy hh:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">{getStatusBadge(transfer.status)}</div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Source Hub
                        </p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                          {transfer.source_hub_name}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Destination Hub
                        </p>
                        <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                          {transfer.destination_hub_name}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Quantity
                        </p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                          {transfer.quantity} units
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Reason
                        </p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                          {transfer.reason || 'Stock replenishment'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
                      {transfer.status.toLowerCase() === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(transfer)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all"
                          >
                            <CheckCircle size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTransfer(transfer);
                              setRejectModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-red-700 transition-all"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </>
                      )}
                      {transfer.status.toLowerCase() === 'approved' && (
                        <button
                          onClick={() => handleShip(transfer)}
                          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-yellow-700 transition-all"
                        >
                          <Truck size={14} />
                          Mark as Shipped
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-black mb-4 text-slate-900 dark:text-white">Reject Transfer Request</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Please enter a reason for rejecting this transfer request for {selectedTransfer.component_name}.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Enter reason..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setRejectModalOpen(false);
                  setSelectedTransfer(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 rounded-xl text-sm font-black text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
