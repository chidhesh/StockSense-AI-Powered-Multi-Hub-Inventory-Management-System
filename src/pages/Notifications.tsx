import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertCircle, Zap, ShoppingCart, ArrowLeftRight, Package, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Notification, NotificationType } from '../types';
import { format } from 'date-fns';

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'low_stock':
      return AlertCircle;
    case 'purchase_approval':
    case 'purchase_ordered':
    case 'purchase_delivered':
      return ShoppingCart;
    case 'transfer_recommendation':
    case 'transfer_approval':
    case 'transfer_dispatch':
    case 'transfer_delivery':
      return ArrowLeftRight;
    case 'replenishment_request':
      return Zap;
    case 'inventory_update':
      return Package;
    default:
      return Bell;
  }
};

const getNotificationColor = (type: NotificationType) => {
  switch (type) {
    case 'low_stock':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'purchase_approval':
    case 'purchase_ordered':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'purchase_delivered':
    case 'inventory_update':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'replenishment_request':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
  }
};

export default function Notifications() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await apiGet<Notification[]>('/api/notifications');
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await apiPatch(`/api/notifications/${id}/read`, {});
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleViewDetails = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    navigate(`/notifications/${notification.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Notifications
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Stay up to date with your inventory workflow
        </p>
      </div>

      {unreadCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-600" size={24} />
            <div>
              <p className="font-bold text-amber-800 dark:text-amber-200">
                {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle size={48} className="mx-auto mb-4 text-emerald-500" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
              No notifications yet!
            </p>
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            return (
              <div
                key={notification.id}
                className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer hover:shadow-md ${
                  notification.is_read
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                }`}
                onClick={() => handleViewDetails(notification)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-xl ${getNotificationColor(
                      notification.type
                    )}`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <span className="w-3 h-3 rounded-full bg-indigo-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      {format(new Date(notification.created_at), 'MMM dd, yyyy hh:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
