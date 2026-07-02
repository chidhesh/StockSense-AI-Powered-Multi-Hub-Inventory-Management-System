import { useEffect, useState } from 'react';
import { Loader2, ShoppingCart, Truck, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { PurchaseRequest, Center } from '../types';

export default function ProcurementQueue() {
  const { profile } = useAuth();
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prResult, centersResult] = await Promise.all([
        apiGet<PurchaseRequest[]>('/api/purchase-requests'),
        apiGet<Center[]>('/api/centers')
      ]);
      setPurchaseRequests(prResult);
      setCenters(centersResult);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, 'dd MMM yyyy');
    } catch (err) {
      return 'N/A';
    }
  };

  const getStatusBadge = (status: PurchaseRequest['status']) => {
    const styles: Record<PurchaseRequest['status'], string> = {
      PENDING_ADMIN_APPROVAL: 'bg-yellow-100 text-yellow-800',
      APPROVED_BY_ADMIN: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      ORDERED: 'bg-blue-100 text-blue-800',
      DELIVERED: 'bg-purple-100 text-purple-800',
      RECEIVED: 'bg-teal-100 text-teal-800',
      COMPLETED: 'bg-green-200 text-green-900'
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const handleMarkPurchased = async (pr: PurchaseRequest) => {
    if (!confirm(`Are you sure you want to mark purchase ${pr.request_id} as purchased?`)) return;
    setProcessingId(pr.id);
    try {
      await apiPatch(`/api/purchase-requests/${pr.id}/order`, {});
      await fetchData();
      alert('Purchase marked as ordered!');
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to mark as purchased');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkDelivered = async (pr: PurchaseRequest) => {
    if (!confirm(`Are you sure you want to mark purchase ${pr.request_id} as delivered and update inventory?`)) return;
    setProcessingId(pr.id);
    try {
      await apiPatch(`/api/purchase-requests/${pr.id}/deliver`, {});
      await fetchData();
      alert('Purchase marked as delivered!');
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to mark as delivered');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReceipt = async (pr: PurchaseRequest) => {
    if (!confirm(`Are you sure you want to confirm receipt and update inventory for ${pr.request_id}?`)) return;
    setProcessingId(pr.id);
    try {
      await apiPost(`/api/purchase-requests/${pr.id}/receive`, {});
      await fetchData();
      alert('Purchase received and inventory updated successfully!');
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to confirm receipt');
    } finally {
      setProcessingId(null);
    }
  };

  // Filter for requests that are ready for procurement (APPROVED_BY_ADMIN and beyond)
  const filteredRequests = purchaseRequests.filter(pr => 
    ['APPROVED_BY_ADMIN', 'ORDERED', 'DELIVERED', 'RECEIVED', 'COMPLETED'].includes(pr.status)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Queue</h1>
          <p className="text-sm text-gray-500">Manage approved purchase requests and procurement process</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertCircle size={20} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase">Pending Procurement</p>
              <p className="text-xl font-bold text-gray-900">
                {purchaseRequests.filter(pr => pr.status === 'APPROVED_BY_ADMIN').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingCart size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase">Ordered</p>
              <p className="text-xl font-bold text-gray-900">
                {purchaseRequests.filter(pr => pr.status === 'ORDERED').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Truck size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase">Delivered</p>
              <p className="text-xl font-bold text-gray-900">
                {purchaseRequests.filter(pr => pr.status === 'DELIVERED').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase">Completed</p>
              <p className="text-xl font-bold text-gray-900">
                {purchaseRequests.filter(pr => pr.status === 'COMPLETED').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-600">Request ID</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Component</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Quantity</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Destination Hub</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Estimated Cost</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Vendor</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Date</th>
                <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="px-6 py-4 font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    <ShoppingCart size={40} className="mx-auto mb-3 opacity-20" />
                    No approved purchase requests found
                  </td>
                </tr>
              ) : (
                filteredRequests.map(pr => (
                  <tr key={pr.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs">{pr.request_id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{pr.component_name}</td>
                    <td className="px-6 py-4">{pr.required_quantity} units</td>
                    <td className="px-6 py-4">{pr.destination_hub_name || 'N/A'}</td>
                    <td className="px-6 py-4 font-semibold">₹{pr.estimated_cost?.toLocaleString() || 0}</td>
                    <td className="px-6 py-4">{pr.vendor || 'Not assigned'}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(pr.created_at)}</td>
                    <td className="px-6 py-4">{getStatusBadge(pr.status)}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {processingId === pr.id ? (
                        <Loader2 className="animate-spin w-5 h-5 mx-auto" />
                      ) : (
                        <>
                          {pr.status === 'APPROVED_BY_ADMIN' && (
                            <button 
                              onClick={() => handleMarkPurchased(pr)}
                              className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors uppercase"
                            >
                              Mark Purchased
                            </button>
                          )}
                          {pr.status === 'ORDERED' && (
                            <button 
                              onClick={() => handleMarkDelivered(pr)}
                              className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold rounded-lg hover:bg-purple-700 transition-colors uppercase"
                            >
                              Mark Delivered
                            </button>
                          )}
                          {pr.status === 'DELIVERED' && (
                            <button 
                              onClick={() => handleConfirmReceipt(pr)}
                              className="px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors uppercase"
                            >
                              Confirm Receipt
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
