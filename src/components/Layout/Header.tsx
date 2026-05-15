import { Bell, Search, AlertCircle, Info, X, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeProvider';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title: string;
  notifications: { id: string; message: string; type: string; route?: string; state?: Record<string, unknown> }[];
}

export default function Header({ title, notifications }: HeaderProps) {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [toastQueue, setToastQueue] = useState<{ id: string; message: string; type: string }[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const seen = seenNotificationIdsRef.current;
    const newlyArrived = notifications.filter((n) => !seen.has(n.id));
    notifications.forEach((n) => seen.add(n.id));
    if (!newlyArrived.length) return;

    setToastQueue((prev) => [...newlyArrived.slice(0, 3), ...prev].slice(0, 4));
  }, [notifications]);

  useEffect(() => {
    if (!toastQueue.length) return;
    const timer = setTimeout(() => {
      setToastQueue((prev) => prev.slice(0, -1));
    }, 4500);
    return () => clearTimeout(timer);
  }, [toastQueue]);

  const handleViewNotification = (n: { route?: string; state?: Record<string, unknown> }) => {
    if (n.route) navigate(n.route, { state: n.state });
    setShowNotifications(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-card border-b-0 px-8 py-4 flex items-center justify-between premium-shadow dark:bg-slate-900/80 dark:border-slate-800">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{title}</h1>
        {profile?.center && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{profile.center.name}</p>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        <div className="fixed top-20 right-8 z-[90] space-y-2 pointer-events-none">
          {toastQueue.map((toast) => (
            <div
              key={`toast-${toast.id}`}
              className={`pointer-events-auto min-w-[280px] max-w-[360px] px-4 py-3 rounded-2xl border shadow-xl animate-in slide-in-from-top-2 duration-300 ${
                toast.type === 'out_of_stock'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              }`}
            >
              <p className="text-xs font-black uppercase tracking-widest">
                {toast.type === 'out_of_stock' ? 'Out Of Stock Alert' : 'Inventory Alert'}
              </p>
              <p className="text-xs font-bold mt-1">{toast.message}</p>
            </div>
          ))}
        </div>

        <button
          onClick={toggleTheme}
          className="p-2.5 bg-slate-100/50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-2xl transition-all duration-300 active:scale-90"
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        <div className="relative hidden lg:block group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors z-10" />
          <input
            type="text"
            placeholder="Type '/' for quick actions..."
            className="pl-12 pr-12 py-2.5 bg-slate-100/50 dark:bg-slate-800 border border-transparent rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/5 w-80 text-sm font-bold transition-all placeholder:text-slate-400 placeholder:uppercase placeholder:tracking-widest dark:text-white"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm pointer-events-none group-focus-within:opacity-0 transition-opacity">
            <span className="text-[10px] font-black text-slate-400">/</span>
          </div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 bg-slate-100/50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-2xl transition-all duration-300 active:scale-90"
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-96 glass-card dark:bg-slate-900 dark:border-slate-800 rounded-3xl premium-shadow overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter">Alerts</h3>
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-lg">{notifications.length} NEW</span>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className="px-6 py-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors flex gap-4">
                      <div className={`p-2 rounded-xl h-fit ${
                        n.type === 'low_stock' ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      }`}>
                        {n.type === 'low_stock' ? <AlertCircle size={18} /> : <X size={18} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1">{n.message}</p>
                        <button
                          onClick={() => handleViewNotification(n)}
                          className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Info size={24} className="text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">All caught up!</p>
                  </div>
                )}
              </div>
              
              {notifications.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
                  <button className="text-xs font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors">Clear All</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pl-6 border-l border-slate-200 dark:border-slate-800">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[120px] uppercase tracking-tighter leading-none">{profile?.full_name}</p>
            <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mt-1 opacity-80">{profile?.role?.replace('_', ' ')}</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-sm">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
