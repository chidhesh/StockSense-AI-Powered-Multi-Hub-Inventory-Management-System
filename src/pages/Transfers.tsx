import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
  Truck,
  Inbox,
  Send,
  Clock,
  History
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { HubTransferRequest, TransferRequest as NewTransferRequest, Center, Component } from '../types';
import { format } from 'date-fns';

type TabType = 'transfer-requests' | 'incoming-transfers' | 'transfer-history';

export default function Transfers() {
  const { profile } = useAuth();
  const normalizedRole = profile?.role?.toLowerCase() || '';
  const isMainAdmin = normalizedRole === 'main_admin' || normalizedRole.includes('master admin') || normalizedRole.includes('top level admin');
  const isCenterAdmin = normalizedRole === 'center_admin' || normalizedRole.includes('inventory manager');
  const isSystemAdmin = normalizedRole === 'system_admin' || normalizedRole.includes('system administrator');
  
  const [activeTab, setActiveTab] = useState<TabType>('transfer-requests');
  const [hubTransfers, setHubTransfers] = useState<HubTransferRequest[]>([]);
  const [aiTransfers, setAiTransfers] = useState<NewTransferRequest[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const centerQuery = isCenterAdmin ? `?center_id=${profile?.center_id}` : '';
      const [hubTransfersRes, aiTransfersRes, centersRes, componentsRes] = await Promise.all([
        apiGet<HubTransferRequest[]>(`/api/hub-transfers${centerQuery}`),
        apiGet<NewTransferRequest[]>('/api/transfer-requests'),
        apiGet<Center[]>('/api/centers'),
        apiGet<Component[]>('/api/components')
      ]);
      setHubTransfers(hubTransfersRes);
      setAiTransfers(aiTransfersRes);
      setCenters(centersRes);
      setComponents(componentsRes);
    } catch (e) {
      console.error('Failed to fetch transfers:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';
    switch (normalizedStatus) {
      case 'pending':
      case 'pending approval':
        return <span className="px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-[10px] font-black uppercase">Pending Approval</span>;
      case 'main_admin_approved':
      case 'approved':
        return <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-[10px] font-black uppercase">Approved</span>;
      case 'source_center_approved':
        return <span className="px-3 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-[10px] font-black uppercase">Source Approved</span>;
      case 'in_transit':
      case 'in transit':
        return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-full text-[10px] font-black uppercase">In Transit</span>;
      case 'delivered':
        return <span className="px-3 py-1 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 rounded-full text-[10px] font-black uppercase">Delivered</span>;
      case 'completed':
        return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full text-[10px] font-black uppercase">Completed</span>;
      case 'rejected':
        return <span className="px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-full text-[10px] font-black uppercase">Rejected</span>;
      default:
        return null;
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await apiPatch(`/api/hub-transfers/${id}`, {
        status,
        user_id: profile?.id
      });
      await fetchData();
    } catch (e) {
      alert('Failed to update transfer status');
    }
  };

  const handleAiTransferAction = async (id: string, action: string) => {
    try {
      if (action === 'confirm-delivery') {
        await apiPost(`/api/transfer-requests/${id}/confirm-delivery`, {});
      } else {
        await apiPatch(`/api/transfer-requests/${id}/approve`, { status: action });
      }
      await fetchData();
    } catch (e) {
      alert('Failed to update transfer');
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

  const filterTransfers = () => {
    let sourceTransfers = aiTransfers.filter(t => t.source_hub_id === profile?.center_id);
    let destinationTransfers = aiTransfers.filter(t => t.destination_hub_id === profile?.center_id);
    let historyTransfers = [...aiTransfers];

    if (isSystemAdmin || isMainAdmin) {
      sourceTransfers = aiTransfers.filter(t => ['Pending Approval', 'Approved', 'Rejected'].includes(t.status));
      destinationTransfers = aiTransfers.filter(t => ['In Transit', 'Delivered'].includes(t.status));
      historyTransfers = aiTransfers.filter(t => ['Completed', 'Rejected'].includes(t.status));
    }

    return {
      sourceTransfers,
      destinationTransfers,
      historyTransfers
    };
  };

  const { sourceTransfers, destinationTransfers, historyTransfers } = filterTransfers();

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Transfer Management
          </h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
            Complete inter-hub component transfer workflow
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {isCenterAdmin && (
          <>
            <button
              onClick={() => setActiveTab('transfer-requests')}
              className={`pb-4 px-2 border-b-2 font-black text-[11px] uppercase tracking-widest transition-all ${
                activeTab === 'transfer-requests'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Send size={16} />
                Transfer Requests
              </div>
            </button>
            <button
              onClick={() => setActiveTab('incoming-transfers')}
              className={`pb-4 px-2 border-b-2 font-black text-[11px] uppercase tracking-widest transition-all ${
                activeTab === 'incoming-transfers'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Inbox size={16} />
                Incoming Transfers
              </div>
            </button>
          </>
        )}
        {(isSystemAdmin || isMainAdmin) && (
          <>
            <button
              onClick={() => setActiveTab('transfer-requests')}
              className={`pb-4 px-2 border-b-2 font-black text-[11px] uppercase tracking-widest transition-all ${
                activeTab === 'transfer-requests'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock size={16} />
                Pending Transfers
              </div>
            </button>
            <button
              onClick={() => setActiveTab('incoming-transfers')}
              className={`pb-4 px-2 border-b-2 font-black text-[11px] uppercase tracking-widest transition-all ${
                activeTab === 'incoming-transfers'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Truck size={16} />
                Active Transfers
              </div>
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('transfer-history')}
          className={`pb-4 px-2 border-b-2 font-black text-[11px] uppercase tracking-widest transition-all ${
            activeTab === 'transfer-history'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <History size={16} />
            Transfer History
          </div>
        </button>
      </div>

      <div className="space-y-6">
        {activeTab === 'transfer-requests' && (
          <div className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {isCenterAdmin ? 'Requests to Approve & Send' : 'Pending Approval'}
              </h3>
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400">
                {sourceTransfers.length}
              </span>
            </div>
            {sourceTransfers.length === 0 ? (
              <div className="p-12 text-center">
                <Send className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={40} />
                <p className="text-sm font-bold text-slate-500">No pending transfer requests</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sourceTransfers.map((transfer) => (
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
                            <p className="text-lg font-black text-slate-900 dark:text-white">{transfer.component_name}</p>
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
                          <div className="flex-shrink-0">
                            {getStatusBadge(transfer.status)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              From Hub
                            </p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.source_hub_name}</p>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              To Hub
                            </p>
                            <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">{transfer.destination_hub_name}</p>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              Quantity
                            </p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.quantity} units</p>
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

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              Destination Manager
                            </p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.destination_manager_name || 'N/A'}</p>
                            <p className="text-xs font-bold text-slate-500">{transfer.destination_manager_phone || 'N/A'}</p>
                          </div>
                          {transfer.system_admin_name && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                System Admin
                              </p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.system_admin_name}</p>
                            </div>
                          )}
                          {transfer.inventory_manager_name && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                Requested By
                              </p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.inventory_manager_name}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
                          {isCenterAdmin && transfer.source_hub_id === profile?.center_id && transfer.status === 'Pending Approval' && (
                            <>
                              <button
                                onClick={() => handleAiTransferAction(transfer.id, 'Approved')}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all"
                              >
                                <CheckCircle size={14} />
                                Approve
                              </button>
                              <button
                                onClick={() => handleAiTransferAction(transfer.id, 'Rejected')}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-red-700 transition-all"
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </>
                          )}
                          {isCenterAdmin && transfer.source_hub_id === profile?.center_id && transfer.status === 'Approved' && (
                            <button
                              onClick={() => handleAiTransferAction(transfer.id, 'In Transit')}
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
        )}

        {activeTab === 'incoming-transfers' && (
          <div className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {isCenterAdmin ? 'Transfers to Receive' : 'Active Transfers'}
              </h3>
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400">
                {destinationTransfers.length}
              </span>
            </div>
            {destinationTransfers.length === 0 ? (
              <div className="p-12 text-center">
                <Inbox className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={40} />
                <p className="text-sm font-bold text-slate-500">No incoming transfers</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {destinationTransfers.map((transfer) => (
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
                            <p className="text-lg font-black text-slate-900 dark:text-white">{transfer.component_name}</p>
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
                          <div className="flex-shrink-0">
                            {getStatusBadge(transfer.status)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              Source Hub
                            </p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.source_hub_name}</p>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              Quantity
                            </p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.quantity} units</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
                          {isCenterAdmin && transfer.destination_hub_id === profile?.center_id && transfer.status === 'In Transit' && (
                            <button
                              onClick={() => handleAiTransferAction(transfer.id, 'confirm-delivery')}
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
        )}

        {activeTab === 'transfer-history' && (
          <div className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Transfer History
              </h3>
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400">
                {historyTransfers.length}
              </span>
            </div>
            {historyTransfers.length === 0 ? (
              <div className="p-12 text-center">
                <History className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={40} />
                <p className="text-sm font-bold text-slate-500">No transfer history</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">From → To</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historyTransfers.map((transfer) => (
                      <tr key={transfer.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.component_name}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{transfer.request_id}</p>
                        </td>
                        <td className="px-8 py-4">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{transfer.source_hub_name} → {transfer.destination_hub_name}</p>
                        </td>
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.quantity} units</p>
                        </td>
                        <td className="px-8 py-4">
                          {getStatusBadge(transfer.status)}
                        </td>
                        <td className="px-8 py-4">
                          <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                            {format(new Date(transfer.updated_at || transfer.created_at), 'MMM dd, yyyy')}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
