import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as Edit, Trash2, Building2, MapPin, Mail, Phone, Loader2, Package, Users } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { Center, Component, InventoryTransaction, Student } from '../types';

interface CenterStats {
  centerId: string;
  components: number;
  available: number;
  transactions: number;
  students: number;
}

export default function Centers() {
  const navigate = useNavigate();
  const [emailError, setEmailError] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [stats, setStats] = useState<Map<string, CenterStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Center | null>(null);
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [form, setForm] = useState({ 
    name: '', 
    location: '', 
    contact_email: '', 
    contact_phone: '',
    admin_name: '',
    capacity: 0,
    type: 'Research Center',
    customType: ''
  });

  const centerTypes = [
    'Research Center',
    'Incubation Center',
    'Training Institute',
    'Skill Lab',
    'Other'
  ];

  const validateEmail = (email: string) => {
    if (!email) return 'Contact Email is required';
    if (!/^[^@\s]+@(gmail\.com|techhub\.in)$/i.test(email)) {
      return 'Email must be a @gmail.com or @techhub.in address';
    }
    return '';
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [centersRes, compRes, txRes, studentRes] = await Promise.all([
        apiGet<Center[]>('/api/centers'),
        apiGet<Component[]>('/api/components'),
        apiGet<InventoryTransaction[]>('/api/inventory-transactions?limit=1000'),
        apiGet<Student[]>('/api/students'),
      ]);

      const cs = centersRes;
      setCenters(cs);

      const statsMap = new Map<string, CenterStats>();
      cs.forEach(c => statsMap.set(c.id, { centerId: c.id, components: 0, available: 0, transactions: 0, students: 0 }));

      compRes.forEach((comp: { center_id: string; available_quantity: number; total_quantity: number }) => {
        const s = statsMap.get(comp.center_id);
        if (s) { s.components++; s.available += comp.available_quantity; }
      });
      txRes.forEach((tx: { center_id: string }) => {
        const s = statsMap.get(tx.center_id);
        if (s) s.transactions++;
      });
      studentRes.forEach((student: { center_id: string }) => {
        const s = statsMap.get(student.center_id);
        if (s) s.students++;
      });

      setStats(statsMap);
    } catch {
      setCenters([]);
      setStats(new Map());
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({ 
      name: '', 
      location: '', 
      contact_email: '', 
      contact_phone: '',
      admin_name: '',
      capacity: 0,
      type: 'Research Center',
      customType: ''
    });
    setShowModal(true);
  };

  const openEdit = (c: Center) => {
    setEditItem(c);
    const isCustom = c.type && !centerTypes.includes(c.type);
    setForm({ 
      name: c.name, 
      location: c.location, 
      contact_email: c.contact_email || '', 
      contact_phone: c.contact_phone || '',
      admin_name: c.admin_name || '',
      capacity: c.capacity || 0,
      type: isCustom ? 'Other' : (c.type || 'Research Center'),
      customType: isCustom ? (c.type || '') : ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    // Validate all required fields
    if (!form.name.trim()) {
      alert('Hub Name is required');
      return;
    }
    if (!form.location.trim()) {
      alert('Location is required');
      return;
    }
    if (!form.contact_email.trim()) {
      alert('Contact Email is required');
      return;
    }
    if (!form.contact_phone.trim()) {
      alert('Contact Phone is required');
      return;
    }
    if (form.contact_phone.length !== 10) {
      alert('Contact Phone must be exactly 10 digits');
      return;
    }
    
    if (form.type === 'Other' && !form.customType.trim()) {
      alert('Please specify the custom hub type');
      return;
    }

    const emailValidation = validateEmail(form.contact_email);
    if (emailValidation) {
      setEmailError(emailValidation);
      alert(emailValidation);
      return;
    }
    setEmailError('');
    
    setSaving(true);
    try {
      const finalType = form.type === 'Other' ? form.customType : form.type;
      const { customType, ...formData } = form;
      const payload = { ...formData, type: finalType, updated_at: new Date().toISOString() };
      
      if (editItem) {
        await apiPatch(`/api/centers/${editItem.id}`, payload);
      } else {
        await apiPost('/api/centers', payload);
      }
      setShowModal(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hub? All associated data will be affected.')) return;
    await apiDelete(`/api/centers/${id}`);
    await fetchData();
  };

  const filteredCenters = centers.filter(c => {
    if (typeFilter === 'All Types') return true;
    return c.type === typeFilter;
  });

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Mapping Hubs...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Building2 size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Hub Management</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {centers.length} Total Hubs • <span className="text-indigo-600">Active Registry</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="All Types">All Hub Types</option>
              {centerTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
          >
            <Plus size={16} /> Register Hub
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCenters.map(center => {
          const s = stats.get(center.id);
          return (
            <div
              key={center.id}
              onClick={() => navigate('/inventory', { state: { centerId: center.id, centerName: center.name } })}
              className="glass-card p-6 group cursor-pointer relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(center); }}
                  className="p-2 bg-white text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 transition-all"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(center.id); }}
                  className="p-2 bg-white text-slate-400 hover:text-red-600 rounded-xl shadow-sm border border-slate-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner group-hover:bg-indigo-50 transition-colors">
                  <Building2 size={24} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5">{center.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <MapPin size={12} className="text-indigo-500" /> {center.location}
                  </div>
                  {center.type && (
                    <span className="inline-block mt-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-indigo-100">
                      {center.type}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div 
                  onClick={(e) => { e.stopPropagation(); navigate('/inventory', { state: { centerId: center.id, centerName: center.name } }); }}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer group/stat shadow-sm active:scale-95"
                >
                  <p className="text-sm font-black text-slate-900 group-hover/stat:text-indigo-600">{s?.components || 0}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Items</p>
                </div>
                <div 
                  onClick={(e) => { e.stopPropagation(); navigate('#', { state: { centerId: center.id, centerName: center.name, view: 'top_active_students' } }); }}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer group/stat shadow-sm active:scale-95"
                >
                  <p className="text-sm font-black text-indigo-600 group-hover/stat:text-indigo-700">{s?.students || 0}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Students</p>
                </div>
                <div 
                  onClick={(e) => { e.stopPropagation(); navigate('/transactions', { state: { centerId: center.id, centerName: center.name } }); }}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer group/stat shadow-sm active:scale-95"
                >
                  <p className="text-sm font-black text-slate-900 group-hover/stat:text-indigo-600">{s?.transactions || 0}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Activity</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {center.admin_name && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <Package size={12} className="text-indigo-400" /> Inventory Manager: {center.admin_name}
                  </div>
                )}
                {center.contact_email && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 lowercase tracking-widest">
                    <Mail size={12} className="text-indigo-400" /> {center.contact_email.toLowerCase()}
                  </div>
                )}
                {center.contact_phone && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <Phone size={12} className="text-indigo-400" /> {center.contact_phone}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {centers.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No hubs yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first hub to get started</p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">{editItem ? 'Edit Hub' : 'Add Hub'}</h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Hub Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                  placeholder=""
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Location *</label>
                  <input
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Inventory Manager Name *</label>
                  <input
                    value={form.admin_name}
                    onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                    placeholder=""
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Contact Email *</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={e => {
                      setForm(f => ({ ...f, contact_email: e.target.value }));
                      setEmailError(validateEmail(e.target.value));
                    }}
                    className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all ${emailError ? 'border-rose-200' : 'border-slate-100'}`}
                    placeholder=""
                  />
                  {emailError && (
                    <p className="mt-1 text-[10px] font-bold text-rose-500 ml-1">{emailError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Contact Phone *</label>
                  <input
                    value={form.contact_phone}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      if (digits.length <= 10) {
                        setForm(f => ({ ...f, contact_phone: digits }));
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                    placeholder=""
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Hub Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                  >
                    {centerTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="invisible">
                  {/* Capacity field removed as per user request */}
                </div>
              </div>

              {form.type === 'Other' && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                  <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 ml-1">Specify Hub Type *</label>
                  <input
                    value={form.customType}
                    onChange={e => setForm(f => ({ ...f, customType: e.target.value }))}
                    className="w-full px-4 py-3 bg-indigo-50/30 border border-indigo-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                    placeholder="Enter manual hub type..."
                  />
                </div>
              )}
            </div>
              <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-slate-50/50 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.location || !form.contact_email || !form.contact_phone || form.contact_phone.length !== 10 || !!emailError || !form.admin_name || (form.type === 'Other' && !form.customType.trim())}
                  className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editItem ? 'Update Hub' : 'Register Hub'}
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
