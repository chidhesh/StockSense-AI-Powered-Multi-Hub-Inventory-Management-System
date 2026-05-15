import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, QrCode, ArrowLeftRight,
  FileText, Receipt, Building2, BarChart3, LogOut,
  ChevronLeft, ChevronRight, Bell, Users, ShoppingCart, Activity
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  notifications: number;
}

const masterNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/centers', icon: Building2, label: 'Hubs' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

const hubNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/students', icon: Users, label: 'Students' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/qr-management', icon: QrCode, label: 'QR Scan' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

const studentNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/qr-management', icon: QrCode, label: 'QR Scan' },
];

export default function Sidebar({ collapsed, onToggle, notifications }: SidebarProps) {
  const { profile, signOut } = useAuth();
  const isMaster = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  const isStudent = profile?.role === 'student';
  const navItems = isMaster ? masterNavItems : (isStudent ? studentNavItems : hubNavItems);

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 transition-all duration-500 z-50 flex flex-col border-r border-slate-200 dark:border-slate-800 shadow-sm ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      <div className="p-6 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-3 animate-in fade-in duration-700">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Package size={24} className="text-white" />
            </div>
            <span className="font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">
              StockSense
            </span>
          </div>
        )}
        <button 
          onClick={onToggle}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-300 active:scale-90"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 group ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 translate-x-1'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1'
              }`
            }
          >
            <Icon size={22} className={`transition-transform duration-300 group-hover:scale-110`} />
            {!collapsed && <span className="tracking-wide">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-800">
        {!collapsed && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-black text-white shadow-lg">
                {profile?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">{profile?.full_name}</p>
                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-1 opacity-80">{profile?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 dark:text-slate-400 hover:text-red-600 rounded-xl text-xs font-bold transition-all duration-300 group"
            >
              <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
              Sign Out
            </button>
          </div>
        )}
        {collapsed && (
          <button 
            onClick={signOut}
            className="w-full p-4 text-slate-400 hover:text-red-600 transition-colors flex justify-center"
          >
            <LogOut size={20} />
          </button>
        )}
      </div>
    </aside>
  );
}
