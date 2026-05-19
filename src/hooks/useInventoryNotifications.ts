import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { Component } from '../types';
import { useAuth } from '../context/useAuth';

interface Notification {
  id: string;
  message: string;
  type: 'low_stock' | 'out_of_stock' | 'expired' | 'info';
  route?: string;
  state?: Record<string, unknown>;
}

export function useInventoryNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    const fetchAlerts = async () => {
      let list: Component[] = [];
      try {
        list = await apiGet<Component[]>('/api/components');
      } catch {
        setNotifications([]);
        return;
      }
      const data = list
        .filter(c => ['low_stock', 'expired', 'defective', 'out_of_stock'].includes(c.status))
        .filter(c => {
          const role = profile.role?.toLowerCase() || '';
          const isMaster = role === 'master_admin' || role === 'system administrator';
          const isInventoryManager = role === 'center_admin' || role.includes('inventory manager') || role.includes('inventory_manager');
          
          if (isMaster) return true;
          if (isInventoryManager && profile.center_id) {
            return c.center_id === profile.center_id;
          }
          return false;
        })
        .slice(0, 20);
      if (!data.length) {
        setNotifications([]);
        return;
      }

      const alerts: Notification[] = data.map(c => {
        const isOutOfStock = c.status === 'out_of_stock' || c.available_quantity === 0;
        const isLowStock = c.status === 'low_stock' || (c.available_quantity > 0 && c.available_quantity <= Math.max(2, Math.ceil(c.total_quantity * 0.2)));
        const statusType: Notification['type'] = isOutOfStock ? 'out_of_stock' : isLowStock ? 'low_stock' : 'expired';

        return {
          id: c.id,
          message: isOutOfStock
            ? `Out of stock: ${c.name}`
            : isLowStock
            ? `Low stock: ${c.name} (${c.available_quantity} remaining)`
            : `${c.status}: ${c.name}`,
          type: statusType,
          route: '/inventory',
          state: {
            filter: isOutOfStock ? 'out_of_stock' : isLowStock ? 'low_stock' : 'all',
          },
        };
      });

      setNotifications(alerts);
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [profile]);

  return notifications;
}
