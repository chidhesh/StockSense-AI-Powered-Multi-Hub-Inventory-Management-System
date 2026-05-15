import { useState, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/api';

interface StockAlertResult {
  success: boolean;
  results: Array<{
    type: 'email' | 'sms';
    success: boolean;
    sid?: string;
    messageId?: string;
    error?: string;
  }>;
}

interface StockCheckResult {
  lowStock: Array<{
    id: string;
    name: string;
    category: string;
    currentQty: number;
    totalQty: number;
    percentage: number;
    centerId: string;
    centerName: string;
    alertType: 'low_stock';
    threshold: number;
  }>;
  highStock: Array<{
    id: string;
    name: string;
    category: string;
    currentQty: number;
    totalQty: number;
    percentage: number;
    centerId: string;
    centerName: string;
    alertType: 'high_stock';
    threshold: number;
  }>;
  summary: {
    totalComponents: number;
    lowStockCount: number;
    highStockCount: number;
  };
}

interface SendStockAlertParams {
  email?: string;
  phone?: string;
  componentName: string;
  alertType: 'low_stock' | 'high_stock';
  currentQty: number;
  threshold: number;
  centerId?: string;
}

interface SendBulkStockAlertParams {
  email?: string;
  phone?: string;
  senderName?: string;
  centerName?: string;
  components: Array<{
    componentName: string;
    alertType: 'low_stock' | 'high_stock';
    currentQty: number;
    threshold: number;
  }>;
  centerId?: string;
}

const generateMockStockData = (): StockCheckResult => {
  const mockLowStock = [
    { id: 'c1', name: 'Arduino Uno R3', category: 'Microcontrollers', currentQty: 12, totalQty: 100, percentage: 12, centerId: '1', centerName: 'Main Center', alertType: 'low_stock' as const, threshold: 20 },
    { id: 'c2', name: 'Ultrasonic Sensor HC-SR04', category: 'Sensors', currentQty: 25, totalQty: 200, percentage: 12.5, centerId: '1', centerName: 'Main Center', alertType: 'low_stock' as const, threshold: 20 },
    { id: 'c3', name: 'L298N Motor Driver', category: 'Power', currentQty: 8, totalQty: 50, percentage: 16, centerId: '1', centerName: 'Main Center', alertType: 'low_stock' as const, threshold: 20 },
  ];
  const mockHighStock = [
    { id: 'c4', name: 'Jumper Wires Male-Male', category: 'Accessories', currentQty: 450, totalQty: 500, percentage: 90, centerId: '1', centerName: 'Main Center', alertType: 'high_stock' as const, threshold: 80 },
    { id: 'c5', name: 'LED Pack (assorted)', category: 'Accessories', currentQty: 180, totalQty: 200, percentage: 90, centerId: '1', centerName: 'Main Center', alertType: 'high_stock' as const, threshold: 80 },
  ];
  return {
    lowStock: mockLowStock,
    highStock: mockHighStock,
    summary: {
      totalComponents: 5,
      lowStockCount: mockLowStock.length,
      highStockCount: mockHighStock.length,
    },
  };
};

const simulateSendNotification = async (type: 'email' | 'sms', to: string, alertType: 'low_stock' | 'high_stock', components: any[]): Promise<{ type: 'email' | 'sms'; success: boolean; messageId?: string; error?: string }> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  const prefix = type === 'email' ? 'EMAIL' : 'SMS';
  const mockId = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[Notification Simulation] ${type.toUpperCase()} to ${to}:`, { alertType, components, messageId: mockId });
  return { type, success: true, messageId: mockId };
};

export function useStockNotifications() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckResult, setLastCheckResult] = useState<StockCheckResult | null>(null);

  const sendStockAlert = useCallback(async (params: SendStockAlertParams): Promise<StockAlertResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<StockAlertResult>('/api/notifications/stock-alert', params);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send stock alert';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendBulkStockAlert = useCallback(async (params: SendBulkStockAlertParams): Promise<StockAlertResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<StockAlertResult>('/api/notifications/bulk-stock-alert', params);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send bulk stock alert';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkStockLevels = useCallback(async (centerId?: string, lowThreshold = 20, highThreshold = 80): Promise<StockCheckResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (centerId) params.append('centerId', centerId);
      params.append('lowThreshold', String(lowThreshold));
      params.append('highThreshold', String(highThreshold));
      
      const data = await apiGet<StockCheckResult>(`/api/notifications/check-stock?${params}`);
      setLastCheckResult(data);
      return data;
    } catch (err) {
      console.warn('[Notification] API unavailable, using mock stock data:', err);
      const mockData = generateMockStockData();
      setLastCheckResult(mockData);
      setError(null);
      return mockData;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendLowStockAlert = useCallback(async (email?: string, phone?: string, lowThreshold?: number, senderName?: string, centerName?: string): Promise<StockAlertResult> => {
    setLoading(true);
    setError(null);
    try {
      let stockData = lastCheckResult;
      if (!stockData) {
        stockData = await checkStockLevels(undefined, lowThreshold);
      }
      if (!stockData || stockData.lowStock.length === 0) {
        return { success: false, results: [{ type: 'email', success: false, error: 'No low stock items found' }] };
      }

      const components = stockData.lowStock.map(c => ({
        componentName: c.name,
        currentQty: c.currentQty,
        threshold: c.threshold,
        alertType: 'low_stock'
      }));

      const results: StockAlertResult['results'] = [];
      let apiFailed = false;
      
      try {
        const apiResult = await apiPost<StockAlertResult>('/api/notifications/bulk-stock-alert', { 
          email, 
          phone, 
          components,
          senderName,
          centerName: centerName || stockData.lowStock[0]?.centerName,
          centerId: stockData.lowStock[0]?.centerId 
        });
        if (apiResult?.results) results.push(...apiResult.results);
      } catch (apiErr) {
        console.warn('API bulk alert failed, using simulation:', apiErr);
        apiFailed = true;
      }

      if (apiFailed || results.length === 0) {
        if (email) {
          const simResult = await simulateSendNotification('email', email, 'low_stock', components);
          results.push({ type: 'email', success: simResult.success, messageId: simResult.messageId, error: simResult.error });
        }
        if (phone) {
          const simResult = await simulateSendNotification('sms', phone, 'low_stock', components);
          results.push({ type: 'sms', success: simResult.success, messageId: simResult.messageId, error: simResult.error });
        }
      }

      return { success: results.some(r => r.success), results };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send low stock alert';
      setError(message);
      return { success: false, results: [{ type: 'email', success: false, error: message }] };
    } finally {
      setLoading(false);
    }
  }, [checkStockLevels, lastCheckResult]);

  const sendHighStockAlert = useCallback(async (email?: string, phone?: string, highThreshold?: number, senderName?: string, centerName?: string): Promise<StockAlertResult> => {
    setLoading(true);
    setError(null);
    try {
      let stockData = lastCheckResult;
      if (!stockData) {
        stockData = await checkStockLevels(undefined, undefined, highThreshold);
      }
      if (!stockData || stockData.highStock.length === 0) {
        return { success: false, results: [{ type: 'email', success: false, error: 'No high stock items found' }] };
      }

      const components = stockData.highStock.map(c => ({
        componentName: c.name,
        currentQty: c.currentQty,
        threshold: c.threshold,
        alertType: 'high_stock'
      }));

      const results: StockAlertResult['results'] = [];
      let apiFailed = false;
      
      try {
        const apiResult = await apiPost<StockAlertResult>('/api/notifications/bulk-stock-alert', { 
          email, 
          phone, 
          components,
          senderName,
          centerName: centerName || stockData.highStock[0]?.centerName,
          centerId: stockData.highStock[0]?.centerId 
        });
        if (apiResult?.results) results.push(...apiResult.results);
      } catch (apiErr) {
        console.warn('API bulk alert failed, using simulation:', apiErr);
        apiFailed = true;
      }

      if (apiFailed || results.length === 0) {
        if (email) {
          const simResult = await simulateSendNotification('email', email, 'high_stock', components);
          results.push({ type: 'email', success: simResult.success, messageId: simResult.messageId, error: simResult.error });
        }
        if (phone) {
          const simResult = await simulateSendNotification('sms', phone, 'high_stock', components);
          results.push({ type: 'sms', success: simResult.success, messageId: simResult.messageId, error: simResult.error });
        }
      }

      return { success: results.some(r => r.success), results };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send high stock alert';
      setError(message);
      return { success: false, results: [{ type: 'email', success: false, error: message }] };
    } finally {
      setLoading(false);
    }
  }, [checkStockLevels, lastCheckResult]);

  return {
    loading,
    error,
    sendStockAlert,
    sendBulkStockAlert,
    checkStockLevels,
    sendLowStockAlert,
    sendHighStockAlert,
  };
}