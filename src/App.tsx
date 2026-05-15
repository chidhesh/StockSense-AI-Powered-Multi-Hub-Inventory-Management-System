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

function ProtectedRoute({ children, masterOnly, excludeMaster }: { children: React.ReactNode; masterOnly?: boolean; excludeMaster?: boolean }) {
  const { user, profile, loading } = useAuth();

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
  const isMaster = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  if (masterOnly && !isMaster) return <Navigate to="/" replace />;
  if (excludeMaster && isMaster) return <Navigate to="/" replace />;

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
        <Route path="inventory" element={<Inventory />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="qr-management" element={<QRManagement />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="procurement" element={<Procurement />} />
        <Route path="vendor-recommendations" element={<VendorRecommendations />} />
        <Route path="dataset-download" element={<DatasetDownload />} />
        {/* <Route path="model-accuracy" element={<ModelAccuracy />} /> */}
        <Route path="reports" element={<Reports />} />
        <Route path="students" element={<ProtectedRoute excludeMaster><Students /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute masterOnly><Users /></ProtectedRoute>} />
        <Route path="centers" element={<ProtectedRoute masterOnly><Centers /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
