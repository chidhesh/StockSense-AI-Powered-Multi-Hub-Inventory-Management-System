import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useInventoryNotifications } from '../../hooks/useInventoryNotifications';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/centers': 'Hub Management',
  '/inventory': 'Inventory Management',
  '/transactions': 'Transactions',
  '/qr-management': 'QR Code Management',
  '/analytics': 'Analytics & Forecasting',
  '/invoices': 'Invoices',
  '/reports': 'Reports',
  '/procurement': 'Procurement Management',
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const notifications = useInventoryNotifications();

  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500/30 selection:text-indigo-900 overflow-hidden relative text-slate-900 dark:text-slate-100 transition-colors duration-500">
      {/* Dynamic Background Accents */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        notifications={notifications.length}
      />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-700 ease-in-out ${collapsed ? 'pl-20' : 'pl-72'}`}>
        <Header 
          title={title} 
          notifications={notifications}
        />
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-10 duration-1000 ease-out">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
