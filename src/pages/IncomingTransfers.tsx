
import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle, Inbox, Truck } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { TransferRequest as NewTransferRequest } from '../types';
import { format } from 'date-fns';

export default function IncomingTransfers() {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<NewTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiGet<NewTransferRequest[]>('/api/transfer-requests');
      setTransfers(res);
    } catch (e) {
      console.error('Failed to fetch incoming transfers:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async (transfer: NewTransferRequest) => {
    try {
      await apiPost(`/api/transfer-requests/${transfer.id}/confirm-receipt`, {});
      await fetchData();
    } catch (e) {
      alert('Failed to confirm receipt');
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
    (t) => profile?.center_id && t.destination_hub_id === profile.center_id
  );

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Incoming Transfers
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Receive and confirm incoming transfer requests to your hub
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800">
        <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Transfers to Receive
          </h3>
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400">
            {filteredTransfers.length}
          </span>
        </div>
        {filteredTransfers.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={40} />
            <p className="text-sm font-bold text-slate-500">No incoming transfers</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTransfers.map((transfer) => (
              <div key={transfer.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                      <Truck size={24} />
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
                          Quantity
                        </p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                          {transfer.quantity} units
                        </p>
                      </div>
                      {transfer.shipment_date && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                            Shipment Date
                          </p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">
                            {format(new Date(transfer.shipment_date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
                      {transfer.status.toLowerCase() === 'in_transit' && (
                        <button
                          onClick={() => handleConfirmReceipt(transfer)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all"
                        >
                          <CheckCircle size={14} />
                          Confirm Receipt
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
    </div>
  );
}
