import { useEffect, useState } from 'react';
import { Users as UsersIcon, Mail, Shield, Building2, Edit, Loader2, X, Search, MapPin, ChevronDown } from 'lucide-react';
import { apiGet, apiPatch } from '../lib/api';
import { Center, Profile } from '../types';

interface UserProfile extends Profile {
  email: string;
  center_name?: string;
  center_type?: string;
  center_location?: string;
}

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ full_name: '', role: '', center_id: '' });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [hubTypeFilter, setHubTypeFilter] = useState('all');

  const hubTypes = [
    'Research Center',
    'Incubation Center',
    'Training Institute',
    'Skill Lab',
    'Other'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, centersRes] = await Promise.all([
        apiGet<UserProfile[]>('/api/profiles'),
        apiGet<Center[]>('/api/centers'),
      ]);
      
      // Map center details to user profile
      const enhancedUsers = usersRes.map(u => {
        const center = centersRes.find(c => c.id === u.center_id);
        return { 
          ...u, 
          center_name: center?.name,
          center_type: center?.type,
          center_location: center?.location
        };
      });

      setUsers(enhancedUsers);
      setCenters(centersRes);
    } catch (e) {
      console.error('Failed to fetch users', e);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (user: UserProfile) => {
    setEditItem(user);
    setForm({
      full_name: user.full_name || '',
      role: user.role,
      center_id: user.center_id || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await apiPatch(`/api/profiles/${editItem.id}`, {
        ...form,
        center_id: (form.role === 'master_admin' || form.role?.toLowerCase() === 'system administrator') ? null : (form.center_id || null),
      });
      setShowModal(false);
      await fetchData();
    } catch (e) {
      console.error('Failed to update user', e);
      alert('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(user => {
    // Exclude System Administrators from the list
    const role = user.role?.toLowerCase();
    if (role === 'master_admin' || role === 'system administrator') return false;

    const matchesSearch = 
      (user.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.center_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || 
      user.role === roleFilter || 
      (roleFilter === 'center_admin' && user.role?.startsWith('Inventory Manager')) ||
      (roleFilter === 'student' && user.role === 'student');
    
    const matchesHubType = hubTypeFilter === 'all' || user.center_type === hubTypeFilter;
    
    return matchesSearch && matchesRole && matchesHubType;
  });

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Syncing Directory...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      {/* Header Section */}
      <div className="flex items-center gap-4 mb-2">
        <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20">
          <UsersIcon className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">User Directory</h1>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
            {filteredUsers.length} Operators • <span className="text-indigo-600 dark:text-indigo-400">Access Management</span>
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-6 items-center">
        <div className="relative flex-1 w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-600 transition-colors z-10" size={20} />
          <input
            type="text"
            placeholder="SEARCH BY NAME, EMAIL, OR HUB.."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-white"
          />
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm w-full lg:w-auto overflow-x-auto gap-2">
          {(['all', 'center_admin', 'student'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-8 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                roleFilter === r
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {r === 'all' ? 'All Roles' : r === 'center_admin' ? 'Inventory Managers' : 'Student Roles'}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-64">
          <select
            value={hubTypeFilter}
            onChange={(e) => setHubTypeFilter(e.target.value)}
            className="w-full pl-6 pr-12 py-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] shadow-sm appearance-none text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-slate-400 dark:text-slate-500"
          >
            <option value="all">All Hub Types</option>
            {hubTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" size={16} />
        </div>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredUsers.length > 0 ? (
          filteredUsers.map(user => (
            <div key={user.id} className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(user)}
                  className="p-3 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 transition-all"
                >
                  <Edit size={18} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-[20px] flex items-center justify-center text-2xl font-black shadow-inner">
                  {user.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{user.full_name}</h3>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                    <Mail size={12} className="text-indigo-400" /> {user.email?.toLowerCase() || 'NO EMAIL'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50 dark:border-slate-700/50">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Role</p>
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-tight">
                    {user.role === 'center_admin' ? 'INVENTORY MANAGER' : user.role.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
                
                <div className="p-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50 dark:border-slate-700/50">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Hub</p>
                  <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-tight truncate">
                    {user.center_name || 'UNASSIGNED'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-50 dark:border-slate-800">
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <Building2 size={14} className="text-indigo-400" /> TYPE: {user.center_type || 'RESEARCH CENTER'}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <MapPin size={14} className="text-indigo-400" /> LOCATION: {user.center_location || 'MYSORE'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-24 text-center bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100 dark:border-slate-800">
              <UsersIcon size={40} className="text-slate-200 dark:text-slate-700" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No users found</h3>
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Edit Modal - Clean Redesign */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-lg shadow-2xl border border-white dark:border-slate-800 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Edit Profile</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Operator Permissions</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all shadow-sm">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Full Identity</label>
                <input
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-[20px] text-sm font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all dark:text-white"
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Access Level</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'center_admin', label: 'Hub Manager', icon: Shield, color: 'indigo' },
                    { id: 'student', label: 'Student', icon: UsersIcon, color: 'emerald' }
                  ].map(role => (
                    <button
                      key={role.id}
                      onClick={() => setForm(f => ({ ...f, role: role.id }))}
                      className={`flex flex-col items-center justify-center p-6 rounded-[24px] border-2 transition-all gap-3 ${
                        form.role === role.id 
                          ? `border-${role.color}-500 bg-${role.color}-50 dark:bg-${role.color}-900/20 text-${role.color}-700 dark:text-${role.color}-400 shadow-lg shadow-${role.color}-500/10` 
                          : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <role.icon size={24} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.role !== 'master_admin' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Operations Base</label>
                  <div className="relative">
                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                    <select
                      value={form.center_id}
                      onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-[20px] text-sm font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all appearance-none cursor-pointer dark:text-white"
                    >
                      <option value="">Global / No Hub</option>
                      {centers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="px-10 py-8 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-4">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-8 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.full_name}
                className="flex items-center gap-3 px-10 py-3.5 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-800 disabled:opacity-50 shadow-xl shadow-slate-900/10 active:scale-95 transition-all"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Confirm Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
