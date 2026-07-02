import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, ArrowLeftRight, Loader2, CheckCircle, AlertCircle, Filter, X, QrCode, Zap, MapPin, Clock, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { Html5Qrcode } from 'html5-qrcode';
import {
  isSecureCameraContext,
  mapCameraError,
  scanQrFromFile,
  startLiveQrScanner,
  stopLiveQrScanner,
} from '../lib/qrScanner';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { InventoryTransaction, Component, Student, Center } from '../types';
import { parseQRData, playBeep } from '../lib/qrUtils';

type TxFilter = 'all' | 'issue' | 'return' | 'damaged' | 'purchase';

const txColors: Record<string, string> = {
  issue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  return: 'bg-green-100 text-green-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  damaged: 'bg-red-100 text-red-700 dark:bg-rose-900/20 dark:text-rose-400',
  purchase: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-400',
  transfer: 'bg-yellow-100 text-yellow-700 dark:bg-amber-900/20 dark:text-amber-400',
};

export default function Transactions() {
  const { profile, user } = useAuth();
  const isMaster = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  const location = useLocation();
  const navigate = useNavigate();
  const { centerId: initialCenterId, centerName: initialCenterName, date: filterDate } = (location.state || {}) as {
    centerId?: string;
    centerName?: string;
    date?: string;
    filter?: TxFilter;
  };

  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [currentCenterId, setCurrentCenterId] = useState<string>(initialCenterId || (!isMaster ? profile?.center_id || '' : ''));
  const [currentCenterName, setCurrentCenterName] = useState<string>(initialCenterName || '');
  const [viewMode, setViewMode] = useState<'hubs' | 'details'>((initialCenterId || filterDate || !isMaster) ? 'details' : 'hubs');

  useEffect(() => {
    if (initialCenterId || filterDate || !isMaster) {
      if (initialCenterId) {
        setCurrentCenterId(initialCenterId);
      } else if (!isMaster && profile?.center_id) {
        setCurrentCenterId(profile.center_id);
      }
      setViewMode('details');
    }
    if (initialCenterName) {
      setCurrentCenterName(initialCenterName);
    }
  }, [initialCenterId, initialCenterName, filterDate, isMaster, profile]);

  useEffect(() => {
    if (filterDate) {
      setFilter(location.state?.filter === 'issue' ? 'issue' : 'all');
    }
  }, [filterDate, location.state?.filter]);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);

  const txScannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!showQRScanner || !showModal) {
        await stopLiveQrScanner(txScannerRef.current);
        txScannerRef.current = null;
        return;
      }

      if (!isSecureCameraContext()) {
        setErrMsg('Camera requires HTTPS or localhost.');
        setShowQRScanner(false);
        return;
      }

      try {
        txScannerRef.current = await startLiveQrScanner({
          elementId: 'qr-reader-tx',
          scanner: txScannerRef.current,
          onScan: async (decodedText) => {
            if (cancelled) return;
            playBeep();
            await handleQRScan(decodedText);
            await stopLiveQrScanner(txScannerRef.current);
            txScannerRef.current = null;
            setShowQRScanner(false);
          },
        });
      } catch (err) {
        if (!cancelled) {
          setErrMsg(mapCameraError(err));
          setShowQRScanner(false);
        }
      }
    };

    const timer = window.setTimeout(() => { void run(); }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void stopLiveQrScanner(txScannerRef.current);
      txScannerRef.current = null;
    };
  }, [showQRScanner, showModal]);
  
  const [colFilters, setColFilters] = useState({
    component: '',
    type: '',
    student: '',
    center: '',
    notes: ''
  });
  const [form, setForm] = useState({
    component_id: '',
    transaction_type: 'issue' as 'issue' | 'return' | 'damaged',
    quantity: 1,
    student_uuid: '',
    student_name: '',
    student_id: '',
    notes: '',
    session_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    fetchData();
  }, [profile, currentCenterId]); // Re-fetch data when profile or center changes

  useEffect(() => {
    if (initialCenterId && initialCenterId !== currentCenterId) {
      setCurrentCenterId(initialCenterId);
      setCurrentCenterName(initialCenterName || '');
    } else if (!initialCenterId && !currentCenterId && !isMaster && profile?.center_id) {
      setCurrentCenterId(profile.center_id);
      if (profile.center) {
        setCurrentCenterName(profile.center.name || '');
      }
    }
  }, [initialCenterId, initialCenterName, isMaster, profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const centerQuery = currentCenterId ? `&center_id=${currentCenterId}` : '';
      const compQuery = currentCenterId ? `?center_id=${currentCenterId}` : '';
      const [txList, compList, studentList, centerList] = await Promise.all([
        apiGet<InventoryTransaction[]>(`/api/inventory-transactions?limit=1000${centerQuery}`),
        apiGet<Component[]>(`/api/components${compQuery}`),
        apiGet<Student[]>('/api/students'),
        isMaster ? apiGet<Center[]>('/api/centers') : Promise.resolve([]),
      ]);
      setTransactions(txList);
      const activeComponents = compList.filter(c => c.status === 'active');
      setComponents(activeComponents);
      setStudents(studentList);
      setCenters(centerList);

      // Clear selected component if it doesn't belong to the current center
      if (selectedComponentId && currentCenterId) {
        const comp = activeComponents.find(c => c.id === selectedComponentId);
        if (comp && comp.center_id !== currentCenterId) {
          setSelectedComponentId('');
        }
      }
    } catch {
      setTransactions([]);
      setComponents([]);
      setStudents([]);
      setCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setErrMsg('');
    if (!form.component_id) return;
    const comp = components.find(c => c.id === form.component_id);
    if (!comp) return;

    const centerId = isMaster ? comp.center_id : profile?.center_id;
    if (!centerId) {
      setErrMsg(
        profile?.role === 'center_admin'
          ? 'Your profile has no center assigned. Ask a master admin to assign you to a center.'
          : 'Selected component has no center.'
      );
      return;
    }

    setSaving(true);

    try {
      const selectedStudent = students.find(s => s.id === form.student_uuid);
      
      await apiPost('/api/inventory-transactions', {
        component_id: form.component_id,
        center_id: centerId,
        transaction_type: form.transaction_type,
        quantity: form.quantity,
        student_uuid: form.student_uuid || null,
        student_name: selectedStudent?.full_name || form.student_name || null,
        student_id: selectedStudent?.roll_number || form.student_id || null,
        notes: form.notes || null,
        session_date: form.session_date,
        performed_by: user?.id,
        usage_count: 0,
      });

      setSuccess(`Transaction recorded successfully!`);
      setShowModal(false);
      setForm({ 
        component_id: '', 
        transaction_type: 'issue', 
        quantity: 1, 
        student_uuid: '',
        student_name: '', 
        student_id: '', 
        notes: '', 
        session_date: new Date().toISOString().slice(0, 10)
      });
      await fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setErrMsg(e?.message || 'Could not record transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleQRScan = async (result: string) => {
    const parsed = parseQRData(result);
    if (!parsed) {
      setErrMsg('Invalid QR Code format.');
      return;
    }

    if (parsed.type === 'student' || parsed.studentId || parsed.rollNumber) {
      const student = students.find(s => {
        const dbId = String(s.id).toLowerCase();
        const dbRoll = String(s.roll_number).toLowerCase();
        const scanId = parsed.studentId ? String(parsed.studentId).toLowerCase() : '';
        const scanRoll = parsed.rollNumber ? String(parsed.rollNumber).toLowerCase() : '';
        const scanRaw = result.toLowerCase();

        return (scanId && dbId === scanId) || 
               (scanRoll && dbRoll === scanRoll) ||
               (dbId === scanRaw) ||
               (dbRoll === scanRaw);
      });

      if (student) {
        setForm(prev => ({
          ...prev,
          student_uuid: student.id,
          student_name: student.full_name,
          student_id: student.roll_number
        }));
        setSuccess(`Verified Student: ${student.full_name}`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setErrMsg('Student record not found in registry.');
      }
    } else {
      setErrMsg('QR code is not a student ID.');
    }
  };

  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await scanQrFromFile(file, 'qr-reader-tx-hidden');
      await handleQRScan(result);
    } catch {
      setErrMsg('Could not detect QR code in image. Use a clear photo of the full QR code.');
    }
    e.target.value = '';
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Scanning Ledger...</p>
    </div>
  );

  // Group transactions function
  const groupTransactions = (txs: InventoryTransaction[]): InventoryTransaction[] => {
    const groups: Record<string, InventoryTransaction> = {};
    
    txs.forEach(tx => {
      // Create a unique key: student_uuid + component_id + transaction_type + date part of created_at
      const key = `${tx.student_uuid || 'system'}-${tx.component_id}-${tx.transaction_type}-${format(new Date(tx.created_at), 'yyyy-MM-dd-HH-mm')}`;
      
      if (groups[key]) {
        // Merge the transactions: sum the quantities
        groups[key].quantity += tx.quantity;
        
        // Optionally, combine notes or other fields
        if (tx.notes && groups[key].notes) {
          if (!groups[key].notes.includes(tx.notes)) {
            groups[key].notes += `; ${tx.notes}`;
          }
        } else if (tx.notes) {
          groups[key].notes = tx.notes;
        }
      } else {
        // Create a new group entry
        groups[key] = { ...tx };
      }
    });
    
    // Return sorted groups by created_at descending
    return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const filtered = transactions.filter(t => {
    // Primary filter: ensure transactions belong to the currentCenterId if set
    if (currentCenterId && String(t.center_id) !== String(currentCenterId)) {
      return false;
    }

    const txDate = format(new Date(t.created_at), 'yyyy-MM-dd');
    const matchDate = !location.state?.date || txDate === location.state.date;

    const matchFilter = filter === 'all' || t.transaction_type === filter;
    const comp = (t as any).component || components.find(c => c.id === t.component_id);
    const center = (t as any).center;
    const matchComponent = !selectedComponentId || t.component_id === selectedComponentId;
    const matchStudent = !selectedStudentId || t.student_uuid === selectedStudentId;
    const matchHub = !selectedHubId || t.center_id === selectedHubId;
    const matchCenter = !currentCenterId || t.center_id === currentCenterId;

    const searchLower = search.toLowerCase();
    const matchSearch = !search ||
      (comp?.name?.toLowerCase() || '').includes(searchLower) ||
      (t.student_name || '').toLowerCase().includes(searchLower) ||
      (t.student_id || '').toLowerCase().includes(searchLower) ||
      (t.notes || '').toLowerCase().includes(searchLower) ||
      (t.transaction_type || '').toLowerCase().includes(searchLower) ||
      (center?.name || '').toLowerCase().includes(searchLower);

    // Column-wise filters
    const matchColComponent = !colFilters.component || (comp?.name?.toLowerCase() || '').includes(colFilters.component.toLowerCase());
    const matchColType = !colFilters.type || (t.transaction_type?.toLowerCase() || '').includes(colFilters.type.toLowerCase());
    const matchColStudent = !colFilters.student ||
      (t.student_name || '').toLowerCase().includes(colFilters.student.toLowerCase()) ||
      (t.student_id || '').toLowerCase().includes(colFilters.student.toLowerCase());
    const matchColCenter = !colFilters.center || (center?.name?.toLowerCase() || '').includes(colFilters.center.toLowerCase());
    const matchColNotes = !colFilters.notes || (t.notes || '').toLowerCase().includes(colFilters.notes.toLowerCase());

    return matchFilter && matchComponent && matchStudent && matchHub && matchCenter && matchSearch && matchDate &&
           matchColComponent && matchColType && matchColStudent &&
           matchColCenter && matchColNotes;
  });

  const groupedAndFiltered = groupTransactions(filtered);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Syncing Ledger...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900">
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {errMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle size={16} /> {errMsg}
        </div>
      )}

      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <ArrowLeftRight size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Transaction Ledger</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {currentCenterName ? `Hub: ${currentCenterName}` : 'All Hubs'} • <span className="text-indigo-600">{transactions.length} Total</span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-2xl premium-shadow border border-slate-100">
            {(['all', 'issue', 'return', 'damaged'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === t
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
          >
            <Plus size={16} /> New Transaction
          </button>
        </div>
      </div>

      {/* Search & Stats Card */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors z-10" size={18} />
            <input
              type="text"
              placeholder="Search by student, asset name, or transaction details..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[24px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-400 placeholder:uppercase placeholder:tracking-widest"
            />
          </div>

          {initialCenterId && currentCenterId === initialCenterId && (
            <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in slide-in-from-left-4 duration-500">
              <div className="p-1.5 bg-white rounded-lg shadow-sm">
                <MapPin size={12} className="text-indigo-600" />
              </div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                Viewing Hub: <span className="text-indigo-900">{initialCenterName || 'Selected Facility'}</span>
              </p>
              <button 
                onClick={() => setCurrentCenterId('')}
                className="ml-auto p-1 hover:bg-indigo-100 rounded-md text-indigo-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {location.state?.date && (
            <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in slide-in-from-left-4 duration-500">
              <div className="p-1.5 bg-white rounded-lg shadow-sm">
                <Clock size={12} className="text-emerald-600" />
              </div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                Viewing Transactions for: <span className="text-emerald-900">{format(new Date(location.state.date), 'dd MMM yyyy')}</span>
              </p>
              <button 
                onClick={() => navigate('/transactions', { replace: true, state: { ...location.state, date: undefined } })}
                className="ml-auto p-1 hover:bg-emerald-100 rounded-md text-emerald-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="lg:col-span-3 flex gap-3">
          {isMaster && (
            <select
              value={selectedHubId}
              onChange={e => {
                setSelectedHubId(e.target.value);
                setSelectedStudentId(''); // Reset student when hub changes
              }}
              className="flex-1 px-4 py-4 bg-white border border-slate-200 rounded-[24px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-slate-900 appearance-none cursor-pointer"
            >
              <option value="">All Hubs</option>
              {centers.map(hub => (
                <option key={hub.id} value={hub.id}>{hub.name}</option>
              ))}
            </select>
          )}
          <select
            value={selectedComponentId}
            onChange={e => setSelectedComponentId(e.target.value)}
            className="flex-1 px-4 py-4 bg-white border border-slate-200 rounded-[24px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-slate-900 appearance-none cursor-pointer"
          >
            <option value="">All Assets</option>
            {components
              .filter(c => !currentCenterId || c.center_id === currentCenterId)
              .map(comp => (
                <option key={comp.id} value={comp.id}>{comp.name}</option>
              ))}
          </select>
          <select
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="flex-1 px-4 py-4 bg-white border border-slate-200 rounded-[24px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-slate-900 appearance-none cursor-pointer"
          >
            <option value="">{selectedHubId ? 'Students in Hub' : 'All Students'}</option>
            {students
              .filter(s => {
                if (currentCenterId) return s.center_id === currentCenterId;
                if (selectedHubId) return s.center_id === selectedHubId;
                return true;
              })
              .map(student => (
                <option key={student.id} value={student.id}>{student.full_name} ({student.roll_number})</option>
              ))}
          </select>
        </div>
      </div>

      {/* Student Holdings Summary */}
      {selectedStudentId && (
        <div className="glass-card p-8 rounded-[32px] premium-shadow border-l-4 border-l-indigo-600 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Current Holdings</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Aggregated assets for {students.find(s => s.id === selectedStudentId)?.full_name}
              </p>
            </div>
            <button 
              onClick={() => setSelectedStudentId('')}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const holdings: Record<string, { name: string; qty: number; category: string }> = {};
              transactions
                .filter(t => t.student_uuid === selectedStudentId)
                .forEach(t => {
                  const comp = (t as any).component || components.find(c => c.id === t.component_id);
                  if (!comp) return;
                  if (!holdings[t.component_id]) {
                    holdings[t.component_id] = { name: comp.name, qty: 0, category: comp.category };
                  }
                  if (t.transaction_type === 'issue') holdings[t.component_id].qty += t.quantity;
                  else if (t.transaction_type === 'return' || t.transaction_type === 'damaged') holdings[t.component_id].qty -= t.quantity;
                });
              
              const activeHoldings = Object.entries(holdings).filter(([_, h]) => h.qty > 0);
              
              if (activeHoldings.length === 0) {
                return (
                  <div className="col-span-full py-6 text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest italic">No assets currently held</p>
                  </div>
                );
              }

              return activeHoldings.map(([id, h]) => (
                <div key={id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                  <div>
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">{h.name}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{h.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-indigo-600">{h.qty}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Units</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden rounded-[32px] premium-shadow min-h-[400px]">
        <div className="overflow-x-auto">
          {viewMode === 'hubs' ? (
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Inventory Hubs</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select a hub to view detailed transactions</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {centers.length > 0 ? (
                  centers.map(center => {
                    const hubTransactions = transactions.filter(t => t.center_id === center.id);
                    const hubTxCount = hubTransactions.length;
                    const lastTx = hubTransactions[0]; // Sorted by date usually
                    
                    return (
                      <button
                        key={center.id}
                        onClick={() => {
                          setCurrentCenterId(center.id);
                          setCurrentCenterName(center.name);
                          setViewMode('details');
                        }}
                        className="flex flex-col p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all text-left group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                          <MapPin size={80} />
                        </div>
                        <div className="flex items-start justify-between mb-6">
                          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-[20px] group-hover:scale-110 transition-transform">
                            <MapPin size={28} />
                          </div>
                          <span className="px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 dark:border-slate-700">
                            {hubTxCount} Tx
                          </span>
                        </div>
                        <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-1.5">{center.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-6">
                          <MapPin size={12} className="text-indigo-500" /> {center.location}
                        </p>
                        <div className="mt-auto pt-6 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1">Status</span>
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Hub</span>
                          </div>
                          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                            View Ledger <ChevronRight size={14} />
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100">
                      <MapPin size={32} className="text-slate-200" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No hubs registered in the system</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-0">
              {currentCenterId && (
                <div className="px-8 py-4 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setCurrentCenterId('');
                        setCurrentCenterName('');
                        setViewMode('hubs');
                      }}
                      className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all"
                    >
                      <ArrowLeftRight size={18} className="rotate-180" />
                    </button>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter">{currentCenterName}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Viewing Hub Ledger</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-white rounded-lg text-[10px] font-black text-indigo-600 border border-indigo-100 shadow-sm">
                    {groupedAndFiltered.length} Entries Found
                  </span>
                </div>
              )}
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Information</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tx Type</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Qty</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Beneficiary</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Timestamp</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {groupedAndFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-20">
                        <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100">
                          <ArrowLeftRight size={32} className="text-slate-200" />
                        </div>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                          {location.state?.date ? 'No transactions done today' : 'No matching ledger entries'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    groupedAndFiltered.map(tx => {
                      const comp = (tx as any).component || components.find(c => c.id === tx.component_id);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-5">
                            <p className="font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5">
                              {comp?.name || (tx.component_id ? `Asset #${tx.component_id.slice(0, 4)}` : 'Unknown Asset')}
                            </p>
                            <div className="flex flex-col gap-0.5">
                              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{comp?.category || 'General'}</p>
                              {comp?.sku && (
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                  <span className="opacity-50">Code:</span> {comp.sku}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border ${
                              tx.transaction_type === 'issue' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                              tx.transaction_type === 'return' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                              {tx.transaction_type}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <p className="font-black text-slate-900 text-lg tracking-tighter">{tx.quantity}</p>
                          </td>
                      <td className="px-6 py-5">
                            <p className="font-black text-slate-900 uppercase tracking-tighter leading-none mb-1.5">{tx.student_name || 'System'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tx.student_id || 'Internal'}</p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{format(new Date(tx.created_at), 'dd MMM yyyy')}</p>
                            <p className="text-[10px] font-black text-slate-900 mt-1">{format(new Date(tx.created_at), 'HH:mm')}</p>
                          </td>
                          <td className="px-6 py-5 max-w-[200px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">{tx.notes || 'No Remarks'}</p>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-xl overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <ArrowLeftRight size={18} className="text-white" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Asset Transaction</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">&times;</button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Asset Selection *</label>
                <select
                  value={form.component_id}
                  onChange={e => setForm(f => ({ ...f, component_id: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Choose Asset...</option>
                  {(() => {
                    let filteredAssets = components;
                    
                    if (form.transaction_type === 'return' && form.student_uuid) {
                      const studentHoldings: Record<string, number> = {};
                      transactions
                        .filter(t => t.student_uuid === form.student_uuid)
                        .forEach(t => {
                          if (!studentHoldings[t.component_id]) studentHoldings[t.component_id] = 0;
                          if (t.transaction_type === 'issue') studentHoldings[t.component_id] += t.quantity;
                          else if (t.transaction_type === 'return' || t.transaction_type === 'damaged') studentHoldings[t.component_id] -= t.quantity;
                        });
                      
                      filteredAssets = components.filter(c => (studentHoldings[c.id] || 0) > 0);
                    }

                    if (filteredAssets.length === 0 && form.transaction_type === 'return' && form.student_uuid) {
                      return <option disabled>No assets held by this student</option>;
                    }

                    return filteredAssets.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {form.transaction_type === 'return' ? '(Borrowed)' : `(Available: ${c.available_quantity})`}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tx Protocol *</label>
                  <select
                    value={form.transaction_type}
                    onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value as any }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                  >
                    <option value="issue">Issue Asset</option>
                    <option value="return">Return Asset</option>
                    <option value="damaged">Mark Damaged</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-black text-slate-900 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-4 p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student Verification</label>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[8px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 cursor-pointer transition-all">
                      <QrCode size={12} /> Upload QR
                      <input type="file" className="hidden" accept="image/*" onChange={handleQRUpload} />
                    </label>
                    <button 
                      onClick={() => setShowQRScanner(!showQRScanner)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                        showQRScanner ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50'
                      }`}
                    >
                      <Zap size={12} /> {showQRScanner ? 'Close Camera' : 'Live Scan'}
                    </button>
                  </div>
                </div>

                {showQRScanner && (
                  <div className="mb-4 rounded-2xl overflow-hidden border-2 border-indigo-600 shadow-xl animate-in zoom-in-95 duration-300 bg-slate-900">
                    <div id="qr-reader-tx" className="w-full min-h-[280px]"></div>
                  </div>
                )}

                <select
                  value={form.student_uuid}
                  onChange={e => {
                    const s = students.find(st => st.id === e.target.value);
                    setForm(f => ({ 
                      ...f, 
                      student_uuid: e.target.value,
                      student_name: s?.full_name || '',
                      student_id: s?.roll_number || ''
                    }));
                  }}
                  className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Verified Student...</option>
                  {students
                    .filter(s => !currentCenterId || s.center_id === currentCenterId)
                    .map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.roll_number})</option>
                  ))}
                </select>
                
                <div className="grid grid-cols-2 gap-4">
                  <input
                    readOnly={!!form.student_uuid}
                    value={form.student_name}
                    placeholder="Student Name"
                    className="w-full px-5 py-3 bg-white/50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-900"
                  />
                  <input
                    readOnly={!!form.student_uuid}
                    value={form.student_id}
                    placeholder="Student ID (USN)"
                    className="w-full px-5 py-3 bg-white/50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Transaction Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all h-20 resize-none"
                  placeholder="Reason for issuance/return..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !form.component_id}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Authorize Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden QR Reader for File Uploads */}
      <div id="qr-reader-tx-hidden" style={{ display: 'none' }}></div>
    </div>
  );
}
