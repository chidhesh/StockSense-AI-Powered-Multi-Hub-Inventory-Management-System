import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { UserPlus, Search, QrCode, History, Phone, Mail, MapPin, Download, Trash2, Edit, FileDown, AlertTriangle, Users, Zap, X } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Student, InventoryTransaction, Center, Component } from '../types';
import { generateQRCode, parseQRData, playBeep } from '../lib/qrUtils';
import { format } from 'date-fns';
import { generateStudentReportPDF } from '../lib/pdfUtils';
import { Html5Qrcode } from 'html5-qrcode';

export default function Students() {
  const { profile } = useAuth();
  const location = useLocation();
  const initialCenterId = location.state?.centerId;
  const initialCenterName = location.state?.centerName;

  const isMaster = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  const isManager = profile?.role === 'center_admin' || (profile?.role?.startsWith('Inventory Manager') ?? false);
  const isCenterAdmin = isMaster || isManager;

  const [students, setStudents] = useState<Student[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState<string>(initialCenterId || '');
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    roll_number: '',
    phone: '',
    email: '',
    address: '',
    center_id: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validation functions
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'full_name':
        if (!value.trim()) return 'Full name is required';
        if (value.trim().length < 2) return 'Full name must be at least 2 characters';
        if (!/^[a-zA-Z\s'-]+$/.test(value.trim())) return 'Full name can only contain letters, spaces, hyphens and apostrophes';
        return '';
      case 'roll_number':
        if (!value.trim()) return 'Roll number is required';
        if (!/^[a-zA-Z0-9-]+$/.test(value.trim())) return 'Roll number can only contain letters, numbers and hyphens';
        return '';
      case 'phone':
        if (value && !/^\d{10}$/.test(value)) return 'Phone number must be exactly 10 digits';
        return '';
      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
        return '';
      case 'center_id':
        if (isMaster && !value) return 'Please select a center';
        return '';
      default:
        return '';
    }
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    const fields = ['full_name', 'roll_number', 'phone', 'email', 'center_id'];
    fields.forEach(field => {
      const error = validateField(field, form[field as keyof typeof form]);
      if (error) newErrors[field] = error;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (name: string, value: string) => {
    setForm(f => ({ ...f, [name]: value }));
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors(e => ({ ...e, [name]: error }));
    }
  };

  const handleBlur = (name: string) => {
    setTouched(t => ({ ...t, [name]: true }));
    const error = validateField(name, form[name as keyof typeof form]);
    setErrors(e => ({ ...e, [name]: error }));
  };

  const viewQR = async (student: Student) => {
    setSelectedStudent(student);
    try {
      const url = await generateQRCode(JSON.stringify({
        type: 'student',
        studentId: student.id,
        fullName: student.full_name,
        rollNumber: student.roll_number
      }));
      setQrUrl(url);
      setShowQR(true);
    } catch (e) {
      console.error('Failed to generate QR code', e);
    }
  };

  const viewHistory = async (student: Student) => {
    setSelectedStudent(student);
    try {
      const data = await apiGet<InventoryTransaction[]>(`/api/inventory-transactions?student_uuid=${student.id}&limit=100`);
      // Fetch components to map component_id to component_name if not already included
      const components = await apiGet<Component[]>('/api/components');
      const componentMap = new Map(components.map(c => [c.id, c]));
      
      // Enrich transaction data with component information
      const enrichedHistory = data.map(tx => ({
        ...tx,
        component_name: (tx as any).component_name || componentMap.get(tx.component_id)?.name || 'Unknown Item',
        component_sku: componentMap.get(tx.component_id)?.sku || 'No SKU'
      }));
      
      setHistory(enrichedHistory);
      setShowHistory(true);
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this student record? This action cannot be undone.')) return;
    try {
      await apiDelete(`/api/students/${id}`);
      await fetchData();
    } catch (e) {
      console.error('Failed to delete student', e);
      alert('Failed to delete student. They may have active borrowing records.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    try {
      if (selectedStudent) {
        await apiPatch(`/api/students/${selectedStudent.id}`, form);
      } else {
        await apiPost('/api/students', form);
      }
      setShowModal(false);
      await fetchData();
    } catch (e) {
      console.error('Failed to save student', e);
      alert('Failed to save student record. Please check if ID (USN) is already registered.');
    }
  };

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    if (showScanner) {
      const html5QrCode = new Html5Qrcode("student-scanner");
      scanner = html5QrCode;
      
      const startScanner = async () => {
          if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            setScannerError("Camera requires a secure connection (HTTPS).");
            setShowScanner(false);
            return;
          }

          try {
            // Get available cameras first
            const cameras = await Html5Qrcode.getCameras();
            if (!cameras || cameras.length === 0) {
              throw new Error('No cameras found');
            }

            await html5QrCode.start(
              { facingMode: "environment" },
              {
                fps: 20,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                  const qrboxSize = Math.floor(minEdge * 0.8);
                  return { width: qrboxSize, height: qrboxSize };
                },
              },
              (decodedText) => {
                playBeep();
                const parsed = parseQRData(decodedText);
                if (parsed && (parsed.type === 'student' || parsed.studentId)) {
                  const found = students.find(s => 
                    (parsed.studentId && s.id === parsed.studentId) || 
                    (parsed.rollNumber && s.roll_number.toLowerCase() === parsed.rollNumber.toLowerCase())
                  );
                  if (found) {
                    setSearch(found.roll_number);
                    setShowScanner(false);
                  } else {
                    setScannerError('Student not found in registry');
                  }
                } else {
                  setScannerError('Invalid Student ID format');
                }
              },
              () => {}
            );
          } catch (err: any) {
            console.error("Scanner start error:", err);
            let msg = "Could not access camera.";
            if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
              msg = "CAMERA ACCESS DENIED: Please enable camera in browser settings and refresh.";
            } else if (err.name === 'NotReadableError' || err.message?.includes('in use')) {
              msg = "Camera is in use by another app (like Zoom).";
            }
            setScannerError(msg);
            setShowScanner(false);
          }
        };

      startScanner();
    }
    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [showScanner, students]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsData, centersData] = await Promise.all([
        apiGet<Student[]>('/api/students'),
        isMaster ? apiGet<Center[]>('/api/public/centers') : Promise.resolve([])
      ]);
      setStudents(studentsData);
      setCenters(centersData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = (s.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
                         (s.roll_number?.toLowerCase() || '').includes(search.toLowerCase());
    const matchesCenter = !selectedCenterId || s.center_id === selectedCenterId;
    
    // For Managers, only show students from their center
    if (isManager && !isMaster) {
      return matchesSearch && s.center_id === profile?.center_id;
    }
    return matchesSearch && matchesCenter;
  });

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Directory Syncing...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 font-sans">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Users size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Student Registry</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {filteredStudents.length} Active Records • <span className="text-indigo-600">Borrowing Authority</span>
          </p>
        </div>
        
        <button
          onClick={() => {
            setSelectedStudent(null);
            setForm({ 
              full_name: '', 
              roll_number: '', 
              phone: '', 
              email: '', 
              address: '', 
              center_id: profile?.center_id || (centers[0]?.id || '') 
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <UserPlus size={16} /> Register Student
        </button>
      </div>

      {/* Search & Stats Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors z-10" size={18} />
              <input
                type="text"
                placeholder="Search by student name or ID (USN)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[24px] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-400 placeholder:uppercase placeholder:tracking-widest"
              />
            </div>
            {isMaster && (
              <select
                value={selectedCenterId}
                onChange={(e) => setSelectedCenterId(e.target.value)}
                className="px-6 rounded-[24px] bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 appearance-none cursor-pointer min-w-[200px]"
              >
                <option value="">All Hubs</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button
              onClick={() => {
                setScannerError('');
                setShowScanner(!showScanner);
              }}
              className={`flex items-center gap-2 px-6 rounded-[24px] font-black uppercase tracking-widest text-[10px] transition-all ${
                showScanner ? 'bg-rose-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showScanner ? <X size={16} /> : <Zap size={16} />}
              {showScanner ? 'Close' : 'Scan ID'}
            </button>
          </div>

          {initialCenterId && selectedCenterId === initialCenterId && (
            <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in slide-in-from-left-4 duration-500">
              <div className="p-1.5 bg-white rounded-lg shadow-sm">
                <MapPin size={12} className="text-indigo-600" />
              </div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                Viewing Hub: <span className="text-indigo-900">{initialCenterName || 'Selected Facility'}</span>
              </p>
              <button 
                onClick={() => setSelectedCenterId('')}
                className="ml-auto p-1 hover:bg-indigo-100 rounded-md text-indigo-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {showScanner && (
            <div className="mt-4 p-4 glass-card rounded-[32px] border-2 border-indigo-600 overflow-hidden animate-in slide-in-from-top-4 duration-300">
              <div id="student-scanner" className="w-full max-w-md mx-auto rounded-2xl overflow-hidden bg-slate-900 min-h-[300px]"></div>
              {scannerError && (
                <p className="mt-3 text-center text-xs font-black text-rose-500 uppercase tracking-widest">{scannerError}</p>
              )}
            </div>
          )}
        </div>
        <div className="glass-card px-6 py-4 flex items-center justify-between border-l-4 border-l-indigo-600">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Active</p>
            <p className="text-xl font-black text-slate-900 tracking-tighter">{filteredStudents.length}</p>
          </div>
          <Users size={20} className="text-indigo-200" />
        </div>
      </div>

      {/* Students Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStudents.length === 0 ? (
          <div className="col-span-full py-20 text-center glass-card">
            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100">
              <Users size={32} className="text-slate-200" />
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No student records matching query</p>
          </div>
        ) : (
          filteredStudents.map(student => (
            <div key={student.id} className="glass-card p-6 group relative overflow-hidden transition-all hover:scale-[1.01]">
              <div className="absolute top-0 right-0 p-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setSelectedStudent(student);
                    setForm({
                      full_name: student.full_name,
                      roll_number: student.roll_number,
                      phone: student.phone || '',
                      email: student.email || '',
                      address: student.address || '',
                      center_id: student.center_id,
                    });
                    setShowModal(true);
                  }}
                  className="p-2 bg-white text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 transition-all"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(student.id)}
                  className="p-2 bg-white text-slate-400 hover:text-red-600 rounded-xl shadow-sm border border-slate-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl font-black text-indigo-600 shadow-inner border border-slate-100 group-hover:scale-110 transition-transform">
                  {student.full_name?.charAt(0) || 'S'}
                </div>
                <div className="overflow-hidden">
                  <h3 className="font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5 truncate">{student.full_name}</h3>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <QrCode size={12} className="text-indigo-500" /> {student.roll_number}
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Mail size={14} className="text-indigo-400" />
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight truncate">{student.email || 'NO EMAIL'}</p>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Phone size={14} className="text-indigo-400" />
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{student.phone || 'NO PHONE'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => viewQR(student)}
                  className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  <QrCode size={14} /> ID Card
                </button>
                <button
                  onClick={() => viewHistory(student)}
                  className="flex items-center justify-center gap-2 py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
                >
                  <History size={14} /> Activity
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Register/Edit Modal (MetaMask Style) */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <UserPlus size={18} className="text-white" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                  {selectedStudent ? 'Update Profile' : 'Student Identity'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Identity Name *</label>
                <input
                  required
                  value={form.full_name}
                  onChange={e => handleChange('full_name', e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                  placeholder=""
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student ID (USN) *</label>
                  <input
                    required
                    value={form.roll_number}
                    onChange={e => handleChange('roll_number', e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                    placeholder=""
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Phone *</label>
                  <input
                    required
                    value={form.phone}
                    onChange={e => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                    placeholder=""
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => handleChange('email', e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                  placeholder=""
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Current Hub Address</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all h-24 resize-none"
                  placeholder=""
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {selectedStudent ? 'Update Identity' : 'Authorize Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR & History Modals would be updated similarly with premium style... */}


      {/* QR Code Modal */}
      {showQR && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl text-center p-8 space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Student ID QR Code</h3>
            <div className="inline-block p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <img src={qrUrl} alt="Student QR" className="w-64 h-64" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{selectedStudent.full_name}</p>
              <p className="text-gray-500 font-mono">{selectedStudent.roll_number}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQR(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = qrUrl;
                  a.download = `Student_${selectedStudent.roll_number}_QR.png`;
                  a.click();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Borrowing History</h3>
                <p className="text-sm text-gray-500">{selectedStudent.full_name} ({selectedStudent.roll_number})</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-500 italic">No borrowing history found for this student.</div>
              ) : (
                <div className="space-y-4">
                  {history.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${
                          tx.transaction_type === 'issue' ? 'bg-orange-100 text-orange-600' : 
                          tx.transaction_type === 'return' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {tx.transaction_type === 'issue' ? <Download size={20} /> : <History size={20} />}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{(tx as any).component_name || 'Unknown Item'}</p>
                          <p className="text-xs text-gray-500">
                            {(tx as any).component_sku || 'No SKU'} · {format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase ${
                          tx.transaction_type === 'issue' ? 'bg-orange-100 text-orange-700' : 
                          tx.transaction_type === 'return' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.transaction_type}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">Qty: {tx.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0 flex gap-3 justify-end">
              <button
                onClick={() => generateStudentReportPDF(selectedStudent, history)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <FileDown size={18} />
                Download PDF Report
              </button>
              <button
                onClick={() => setShowHistory(false)}
                className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hidden QR Reader for File Uploads */}
      <div id="qr-reader-hidden" style={{ display: 'none' }}></div>
    </div>
  );
}
