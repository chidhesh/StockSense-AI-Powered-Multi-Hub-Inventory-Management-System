import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, User, Package, ShoppingCart, Zap, CheckCircle, XCircle } from 'lucide-react';
import { apiGet } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Notification, PurchaseRequest, ReplenishmentRequest, TransferRequest, ActivityTimelineItem } from '../types';
import { format } from 'date-fns';

const ActivityTimeline = ({ activities }: { activities: ActivityTimelineItem[] }) => {
  return (
    <div className="space-y-8">
      {activities.map((activity, index) => (
        <div key={activity.id} className="relative pl-8">
          {index !== activities.length - 1 && (
            <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
          )}
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-indigo-600" />
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <User size={16} className="text-slate-500" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {activity.actor}
              </p>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              {activity.action}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              {activity.details}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock size={14} />
              <span>{format(new Date(activity.timestamp), 'MMM dd, yyyy hh:mm a')}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const PurchaseRequestDetails = ({ request }: { request: PurchaseRequest }) => {
  const activities: ActivityTimelineItem[] = [
    {
      id: '1',
      timestamp: request.created_at,
      actor: 'Inventory Manager',
      action: 'Purchase Request Created',
      details: `Requested ${request.required_quantity} units of ${request.component_name}`,
    },
  ];

  if (request.status === 'APPROVED_BY_ADMIN') {
    activities.push({
      id: '2',
      timestamp: request.updated_at,
      actor: 'Main Admin',
      action: 'Request Approved',
      details: 'Purchase request has been approved',
    });
  } else if (request.status === 'REJECTED') {
    activities.push({
      id: '2',
      timestamp: request.updated_at,
      actor: 'Main Admin',
      action: 'Request Rejected',
      details: 'Purchase request has been rejected',
    });
  } else if (request.status === 'ORDERED') {
    activities.push({
      id: '2',
      timestamp: request.updated_at,
      actor: 'System Admin',
      action: 'Order Placed',
      details: `Ordered ${request.required_quantity} units of ${request.component_name}`,
    });
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <ShoppingCart size={20} className="text-indigo-600" />
            Request Information
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Request ID
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {request.request_id}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Component
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {request.component_name}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Quantity
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {request.required_quantity} units
              </p>
            </div>
            {request.vendor && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Vendor
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {request.vendor}
                </p>
              </div>
            )}
            {request.estimated_cost && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Estimated Cost
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  ₹{Number(request.estimated_cost).toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Status
              </p>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase ${
                  request.status === 'PENDING_ADMIN_APPROVAL'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : request.status === 'APPROVED_BY_ADMIN'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : request.status === 'REJECTED'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                    : request.status === 'ORDERED'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    : request.status === 'DELIVERED'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}
              >
                {request.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <Zap size={20} className="text-indigo-600" />
          Activity Timeline
        </h3>
        <ActivityTimeline activities={activities} />
      </div>
    </div>
  );
};

export default function NotificationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseRequest, setPurchaseRequest] = useState<PurchaseRequest | null>(null);
  const [transferRequest, setTransferRequest] = useState<TransferRequest | null>(null);
  const [replenishmentRequest, setReplenishmentRequest] = useState<ReplenishmentRequest | null>(null);

  useEffect(() => {
    const fetchNotification = async () => {
      try {
        const data = await apiGet<Notification[]>(`/api/notifications`);
        const notif = data.find((n) => n.id === id);
        if (notif) {
          setNotification(notif);
          if (notif.reference_type === 'purchase' && notif.reference_id) {
            const purchases = await apiGet<PurchaseRequest[]>('/api/purchase-requests');
            const pr = purchases.find((p) => p.request_id === notif.reference_id);
            if (pr) setPurchaseRequest(pr);
          }
        }
      } catch (error) {
        console.error('Failed to fetch notification details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotification();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <XCircle size={48} className="mx-auto mb-4 text-rose-500" />
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
          Notification not found
        </h1>
        <button
          onClick={() => navigate('/notifications')}
          className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
        >
          Back to Notifications
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/notifications')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft size={24} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            {notification.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {format(new Date(notification.created_at), 'MMM dd, yyyy hh:mm a')}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <p className="text-lg text-slate-700 dark:text-slate-300">
          {notification.message}
        </p>
      </div>

      {notification.reference_type === 'purchase' && purchaseRequest && (
        <PurchaseRequestDetails request={purchaseRequest} />
      )}
    </div>
  );
}
