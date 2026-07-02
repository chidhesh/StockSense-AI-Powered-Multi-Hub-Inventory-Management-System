import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Transactions from './pages/Transactions';
import QRManagement from './pages/QRManagement';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Invoices from './pages/Invoices';
import Procurement from './pages/Procurement';
import VendorRecommendations from './pages/VendorRecommendations';
import DatasetDownload from './pages/DatasetDownload';
import Students from './pages/Students';
import Users from './pages/Users';
import Centers from './pages/Centers';
import Transfers from './pages/Transfers';
import Admin from './pages/Admin';
import SystemAdmin from './pages/SystemAdmin';
import AIInventoryDecisionCenter from './pages/AIInventoryDecisionCenter';
import PurchaseApprovalCenter from './pages/PurchaseApprovalCenter';
import Notifications from './pages/Notifications';
import NotificationDetails from './pages/NotificationDetails';
import TransferRequests from './pages/TransferRequests';
import IncomingTransfers from './pages/IncomingTransfers';
import ProcurementQueue from './pages/ProcurementQueue';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, profile, loading } = useAuth();
  const normalizedRole = profile?.role?.toLowerCase() || '';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f7fe] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  
  if (roles) {
    // Check if role matches any allowed role (both exact and normalized)
    const hasAccess = roles.some(allowedRole => {
      const normalizedAllowed = allowedRole.toLowerCase();
      if (normalizedRole === normalizedAllowed) return true;
      if (normalizedAllowed === 'main_admin' && normalizedRole.includes('master admin')) return true;
      if (normalizedAllowed === 'main_admin' && normalizedRole.includes('top level admin')) return true;
      if (normalizedAllowed === 'system_admin' && normalizedRole.includes('system administrator')) return true;
      if (normalizedAllowed === 'center_admin' && normalizedRole.includes('inventory manager')) return true;
      return false;
    });
    if (!hasAccess) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
          <Route path="ai-decision-center" element={<ProtectedRoute roles={['main_admin', 'system_admin']}><AIInventoryDecisionCenter /></ProtectedRoute>} />
          <Route path="purchase-approval" element={<ProtectedRoute roles={['main_admin']}><PurchaseApprovalCenter /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute roles={['main_admin']}><Admin /></ProtectedRoute>} />
          <Route path="system-admin" element={<ProtectedRoute roles={['system_admin']}><SystemAdmin /></ProtectedRoute>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="notifications/:id" element={<NotificationDetails />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="qr-management" element={<QRManagement />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="procurement" element={<Procurement />} />
        <Route path="vendor-recommendations" element={<VendorRecommendations />} />
        <Route path="dataset-download" element={<DatasetDownload />} />
        <Route path="reports" element={<Reports />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="transfer-requests" element={<TransferRequests />} />
        <Route path="incoming-transfers" element={<IncomingTransfers />} />
          <Route path="procurement-queue" element={<ProtectedRoute roles={['system_admin']}><ProcurementQueue /></ProtectedRoute>} />
        <Route path="students" element={<Students />} />
        <Route path="users" element={<ProtectedRoute roles={['main_admin']}><Users /></ProtectedRoute>} />
        <Route path="centers" element={<ProtectedRoute roles={['main_admin', 'system_admin']}><Centers /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
