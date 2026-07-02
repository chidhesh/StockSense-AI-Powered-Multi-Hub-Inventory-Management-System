import { useState, FormEvent, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Package, Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';
import { Center } from '../types';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [adminExists, setAdminExists] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'center_admin', // This is the internal value, display is changed in the select options
    centerId: '',
  });

  useEffect(() => {
    if (mode === 'register') {
      fetchCenters();
      checkAdminExists();
    }
  }, [mode]);

  const fetchCenters = async () => {
    try {
      const data = await apiGet<Center[]>('/api/public/centers');
      setCenters(data);
    } catch {
      // ignore
    }
  };

  const checkAdminExists = async () => {
    try {
      const result = await apiGet<{ exists: boolean }>('/api/public/admin-exists');
      setAdminExists(result.exists);
      if (result.exists && form.role === 'master_admin') {
        setForm(f => ({ ...f, role: 'center_admin' }));
      }
    } catch {
      // ignore
    }
  };

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(form.email, form.password);
        if (error) setError(error.message);
      } else {
        const { error } = await signUp(form.email, form.password, form.fullName, form.role, form.centerId || undefined);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Registration successful! Please sign in with your credentials.');
          setMode('login');
          setForm(f => ({ ...f, password: '' }));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* MetaMask-style animated background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-orange-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      
      <div className="w-full max-w-[440px] relative z-10">
        <div className="bg-white p-10 rounded-[40px] shadow-[0_24px_48px_rgba(0,0,0,0.08)] border border-slate-100 animate-in zoom-in-95 duration-700 ease-out">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-500/20 group hover:scale-110 transition-transform duration-500 cursor-pointer">
              <Package size={48} className="text-white group-hover:rotate-12 transition-transform" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-3">StockSense</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Secure Access Protocol</p>
          </div>

          <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-8 border border-slate-100">
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === 'login' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === 'register' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-3 animate-in slide-in-from-top-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-3 animate-in slide-in-from-top-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity Name</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                  placeholder=""
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                placeholder=""
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Security Key</label>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300 pr-12"
                  placeholder=""
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Designation</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                  >
                    {!adminExists && <option value="master_admin">System Administrator</option>}
                    <option value="center_admin">Inventory Manager</option>
                    <option value="student">Student</option>
                  </select>
                </div>
                {form.role === 'center_admin' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operational Hub</label>
                    <select
                      value={form.centerId}
                      onChange={e => setForm(f => ({ ...f, centerId: e.target.value }))}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                      required={form.role === 'center_admin'}
                    >
                      <option value="">Choose a hub...</option>
                      {centers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-indigo-600 text-white rounded-[20px] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Zap size={18} fill="currentColor" />
                  {mode === 'login' ? 'Authorize' : 'Initialize'}
                </>
              )}
            </button>
            {mode === 'login' && (
              <div className="mt-4 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Students: Register first using your Roll Number to set a password.
                </p>
              </div>
            )}
          </form>

          <div className="mt-8 text-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
              Secured by neural encryption protocol v2.4
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
