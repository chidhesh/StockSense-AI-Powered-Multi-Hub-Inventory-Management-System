import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  QrCode, Camera, Check, Package, AlertTriangle, 
  Upload, Loader2, X, Plus, ArrowLeftRight, 
  Clock, History, ArrowUpRight, ArrowDownRight, ChevronRight,
  Phone, Mail, MapPin, User
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Component, Student } from '../types';
import { parseQRData, playBeep } from '../lib/qrUtils';
import { Html5Qrcode } from 'html5-qrcode';

export default function QRManagement() {
  const { profile, user } = useAuth();
  const location = useLocation();
  const stateCenterId = location.state?.centerId;
  const stateCenterName = location.state?.centerName;
  
  const isMasterAdmin = profile?.role === 'master_admin' || profile?.role?.toLowerCase() === 'system administrator';
  
  const [components, setComponents] = useState<Component[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [txType, setTxType] = useState<'issue' | 'return' | 'damaged'>('issue');
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [scannedItems, setScannedItems] = useState<Component[]>([]);
  const [unitSelectionComp, setUnitSelectionComp] = useState<Component | null>(null);
  const [studentHoldings, setStudentHoldings] = useState<Record<string, string[]>>({});
  const [allIssuedUnits, setAllIssuedUnits] = useState<Record<string, string[]>>({});
  const [sessionActivity, setSessionActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingFile, setProcessingFile] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<any>(null);

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    try {
      // Force cache-busting by adding a timestamp
      const timestamp = Date.now();
      const centerId = stateCenterId || (!isMasterAdmin ? profile?.center_id : undefined);
      
      // If we have a centerId, we filter by it. If not (Master Admin viewing global), we don't.
      const url = centerId ? `/api/components?center_id=${centerId}&t=${timestamp}` : `/api/components?t=${timestamp}`;
      const data = await apiGet<Component[]>(url);
      
      // Additional safety filter: only show components with available stock for 'issue' mode
      // unless we are in unit selection sub-registry
      setComponents(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setComponents([]);
    } finally {
      setLoading(false);
    }
  }, [profile, isMasterAdmin, stateCenterId]);

  const fetchStudents = useCallback(async () => {
    try {
      const centerId = stateCenterId || (!isMasterAdmin ? profile?.center_id : undefined);
      const url = centerId ? `/api/students?center_id=${centerId}` : '/api/students';
      const data = await apiGet<any[]>(url);
      setStudents(data);
    } catch (e) {
      console.error('Error fetching students:', e);
    }
  }, [profile, isMasterAdmin, stateCenterId]);

  const fetchAllIssuedUnits = useCallback(async () => {
    try {
      const centerId = stateCenterId || (!isMasterAdmin ? profile?.center_id : undefined);
      const centerQuery = centerId ? `&center_id=${centerId}` : '';
      const txs = await apiGet<any[]>(`/api/inventory-transactions?limit=2000${centerQuery}`);
      const issued: Record<string, string[]> = {};
      txs.forEach(tx => {
        const compId = tx.component_id;
        const unitMatch = tx.notes?.match(/Unit: (.*)$/);
        const unitId = unitMatch ? unitMatch[1] : null;
        if (!unitId || unitId === 'N/A') return;
        if (tx.transaction_type === 'issue') {
          if (!issued[compId]) issued[compId] = [];
          if (!issued[compId].includes(unitId)) issued[compId].push(unitId);
        } else if (tx.transaction_type === 'return') {
          if (issued[compId]) issued[compId] = issued[compId].filter(id => id !== unitId);
        }
      });
      setAllIssuedUnits(issued);
    } catch (e) {
      console.error('Error fetching issued units:', e);
    }
  }, [profile, isMasterAdmin, stateCenterId]);

  const fetchStudentHoldings = useCallback(async () => {
    const sUuid = selectedStudent?.studentId;
    const sId = selectedStudent?.rollNumber || studentId;
    if ((!sUuid && !sId) || txType !== 'return') {
      setStudentHoldings({});
      return;
    }
    
    try {
      // Use student_uuid primarily, fallback to student_id (roll number)
      const queryParam = sUuid ? `student_uuid=${sUuid}` : `student_id=${sId}`;
      const centerId = stateCenterId || (!isMasterAdmin ? profile?.center_id : undefined);
      const hubParam = centerId ? `&center_id=${centerId}` : '';
      const txs = await apiGet<any[]>(`/api/inventory-transactions?${queryParam}${hubParam}&limit=1000`);
      
      const holdings: Record<string, string[]> = {};
      txs.forEach(tx => {
        const compId = tx.component_id;
        const unitMatch = tx.notes?.match(/Unit: (.*)$/);
        const unitId = unitMatch ? unitMatch[1] : null;
        if (!unitId || unitId === 'N/A') return;
        
        if (tx.transaction_type === 'issue') {
          if (!holdings[compId]) holdings[compId] = [];
          if (!holdings[compId].includes(unitId)) holdings[compId].push(unitId);
        } else if (tx.transaction_type === 'return' || tx.transaction_type === 'damaged') {
          if (holdings[compId]) {
            holdings[compId] = holdings[compId].filter(id => id !== unitId);
          }
        }
      });
      
      // Cleanup empty holding arrays
      Object.keys(holdings).forEach(id => { 
        if (holdings[id].length === 0) delete holdings[id]; 
      });
      
      setStudentHoldings(holdings);
    } catch (e) {
      console.error('Error fetching student holdings:', e);
      setStudentHoldings({});
    }
  }, [selectedStudent, studentId, txType, stateCenterId, isMasterAdmin, profile]);

  useEffect(() => {
    if (isMasterAdmin) return;
    fetchComponents();
    fetchStudents();
    fetchAllIssuedUnits();
    return () => {
      if (scannerRef.current?.isScanning) scannerRef.current.stop();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, [profile, isMasterAdmin, fetchComponents, fetchStudents, fetchAllIssuedUnits]);

  useEffect(() => {
    if (selectedStudent || (studentName && studentId)) {
      fetchStudentHoldings();
    } else {
      setStudentHoldings({});
    }
  }, [selectedStudent, studentName, studentId, txType, fetchStudentHoldings]);

  const handleScannedData = async (raw: string) => {
    if (lastScannedRef.current === raw) return;
    lastScannedRef.current = raw;
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => { lastScannedRef.current = null; }, 3000); // 3s cool down

    playBeep();
    const parsed = parseQRData(raw);
    if (!parsed) {
      setScanResult({ success: false, message: 'Invalid QR code format.' });
      return;
    }

    // AUTO-DETECTION LOGIC
    // 1. Check if it's a Student
    const foundStudent = students.find(s => 
      (parsed.studentId && s.id === parsed.studentId) || 
      (parsed.rollNumber && s.roll_number.toLowerCase() === parsed.rollNumber.toLowerCase()) ||
      (s.id === raw) ||
      (s.roll_number.toLowerCase() === raw.toLowerCase())
    );

    if (foundStudent) {
      setSelectedStudent({
        studentId: foundStudent.id,
        fullName: foundStudent.full_name,
        rollNumber: foundStudent.roll_number,
        email: foundStudent.email,
        phone: foundStudent.phone,
        department: foundStudent.department,
        batch: foundStudent.batch,
        history: parsed.history || null
      });
      setScanResult({ 
        success: true, 
        message: `Student Identity Verified: ${foundStudent.full_name}` 
      });
      // Do not stop camera, allow scanning items next
      return;
    }

    // 2. Check if it's a Component/Asset
    const comp = components.find(c => {
      if (parsed.componentId) return c.id === parsed.componentId;
      if (parsed.sku) {
        const dbSku = c.sku?.toLowerCase() || '';
        return dbSku === parsed.sku.toLowerCase() || dbSku.startsWith(parsed.sku.toLowerCase() + '-');
      }
      return raw === c.id || raw.toLowerCase() === (c.sku || '').toLowerCase();
    });

    if (comp) {
      if (txType === 'return' && !studentHoldings[comp.id]) {
        setScanResult({ 
          success: false, 
          message: `Validation Error: "${comp.name}" is not in this student's current holdings.` 
        });
        return;
      }

      const sessionItem = { 
        ...comp, 
        unitId: `QR-${Date.now().toString().slice(-4)}`,
        sessionKey: `${comp.id}-${Date.now()}` 
      };
      setScannedItems(prev => [...prev, sessionItem as any]);
      setScanResult({ success: true, message: `Asset Added: "${comp.name}"` });
      return;
    }

    // 3. Not recognized
    setScanResult({ 
      success: false, 
      message: `Scanned data not found in registry (Student or Asset).` 
    });
  };

  const startCamera = async () => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setScanResult({ 
        success: false, 
        message: 'Camera requires a secure connection (HTTPS). Please contact your administrator.' 
      });
      return;
    }

    try {
      // First, request permissions and get cameras
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        setAvailableCameras(cameras.map(c => ({ id: c.id, label: c.label })));
        if (!selectedCameraId) setSelectedCameraId(cameras[0].id);
      } else {
        throw new Error('No cameras found');
      }

      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('qr-reader');
      setScanning(true);
      setScanResult(null);

      const config = { 
        fps: 20, 
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.8);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        disableFlip: false
      };

      const cameraId = selectedCameraId || cameras[0].id;

      // Use cameraId directly if we have it, otherwise fallback to environment mode
      if (cameraId) {
        await scannerRef.current.start(
          cameraId,
          config,
          async (decodedText) => {
            try {
              await handleScannedData(decodedText);
            } catch (err) {
              console.error('Scan processing error:', err);
            }
          },
          () => {}
        );
      } else {
        await scannerRef.current.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            try {
              await handleScannedData(decodedText);
            } catch (err) {
              console.error('Scan processing error:', err);
            }
          },
          () => {}
        );
      }
    } catch (err: any) {
      setScanning(false);
      let msg = 'Camera access denied.';
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
        msg = 'CAMERA ACCESS DENIED: Please click the lock icon in your browser address bar and set Camera to "Allow", then refresh the page.';
      } else if (err.name === 'NotFoundError' || err.message === 'No cameras found') {
        msg = 'No camera found on this device. Please connect a camera.';
      } else if (err.name === 'NotReadableError' || err.message?.includes('in use')) {
        msg = 'Camera is in use by another application (like Zoom or Teams). Please close other apps and try again.';
      }
      setScanResult({ success: false, message: msg });
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current?.isScanning) {
      try { await scannerRef.current.stop(); setScanning(false); } catch (err) { console.error(err); }
    } else { setScanning(false); }
  };

  const handleSubmit = async () => {
    const sName = selectedStudent?.fullName || studentName;
    const sId = selectedStudent?.rollNumber || studentId;
    const sUuid = selectedStudent?.studentId || null;

    if (!sName || scannedItems.length === 0) {
      setScanResult({ success: false, message: 'Identity and assets required.' });
      return;
    }

    setLoading(true);
    let successCount = 0;
    const newActivityItems: any[] = [];

    for (const comp of scannedItems) {
      try {
        const payload = {
          component_id: comp.id,
          center_id: profile?.center_id || comp.center_id,
          transaction_type: txType,
          quantity: 1,
          student_uuid: sUuid,
          student_name: sName,
          student_id: sId,
          performed_by: user?.id,
          session_date: new Date().toISOString().slice(0, 10),
          notes: `Batch QR Scan - Unit: ${(comp as any).unitId || 'N/A'}`,
        };
        await apiPost<any>('/api/inventory-transactions', payload);
        
        // After successful post, we need to manually update local component state if we want instant feedback
        setComponents(prev => prev.map(c => {
          if (c.id === comp.id) {
            const change = txType === 'issue' ? -1 : 1;
            return { ...c, available_quantity: c.available_quantity + change };
          }
          return c;
        }));

        newActivityItems.unshift({
          id: `local-${Date.now()}-${successCount}`,
          component_name: comp.name,
          transaction_type: txType,
          quantity: 1,
          student_name: sName,
          created_at: new Date().toISOString()
        });
        successCount++;
      } catch (e) { console.error(e); }
    }
    
    setSessionActivity(prev => [...newActivityItems, ...prev].slice(0, 10));
    setScanResult({ success: true, message: `Processed ${successCount}/${scannedItems.length} assets for ${sName}.` });
    setScannedItems([]);
    setSelectedStudent(null);
    setStudentName('');
    setStudentId('');
    await fetchComponents();
    await fetchAllIssuedUnits();
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingFile(true);
    try {
      const html5QrCode = new Html5Qrcode('qr-reader-fallback');
      const result = await html5QrCode.scanFile(file, true);
      handleScannedData(result);
    } catch (err) {
      setScanResult({ success: false, message: 'QR recognition failed. Please ensure the image is clear.' });
    } finally {
      setProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getUnitIds = (comp: Component) => {
    // Robust prefix: Take first letters of all alphanumeric words, up to 3 chars
    const prefix = comp.name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
    
    const units = [];
    const totalQty = comp.total_quantity || comp.available_quantity;
    for (let i = 1; i <= totalQty; i++) {
      units.push(`${prefix}-${String(i).padStart(3, '0')}`);
    }
    return units;
  };

  const handleManualQR = (compId: string, unitId?: string) => {
    const comp = components.find(c => c.id === compId);
    if (comp) {
      const sessionItem = { 
        ...comp, 
        unitId: unitId || `UNIT-${Date.now().toString().slice(-4)}`,
        sessionKey: `${comp.id}-${unitId || Date.now()}` 
      };
      setScannedItems(prev => [...prev, sessionItem as any]);
      setScanResult({ success: true, message: `Added "${comp.name}" to session.` });
    }
  };

  if (isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center max-w-lg mx-auto text-slate-900 dark:text-slate-100">
        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-[32px] flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-sm">
          <AlertTriangle size={32} className="text-slate-300 dark:text-slate-600" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Terminal Offline</h1>
        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
          Registry scanning is restricted to center operators. Use the dashboard to oversee operations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 dark:text-slate-100 transition-colors duration-500">
      <div id="qr-reader-fallback" className="hidden"></div>
      
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <QrCode size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">QR Intelligence</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Scan & Track • <span className="text-indigo-600 dark:text-indigo-400">Smart Asset Management</span>
            {stateCenterName && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex inline-items items-center gap-1 w-fit mt-1">
                <MapPin size={10} /> {stateCenterName}
              </span>
            )}
          </p>
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl premium-shadow border border-slate-100 dark:border-slate-800">
          {(['issue', 'return', 'damaged'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTxType(type)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                txType === type
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Scanner Interface */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card rounded-[40px] premium-shadow border border-white/40 dark:border-slate-800/40 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
            
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${scanning ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Live Feed Terminal</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-2xl transition-all border border-slate-100 dark:border-slate-700"
                    title="Upload Image"
                  >
                    <Upload size={18} />
                  </button>
                </div>
              </div>

              <div className="relative aspect-video bg-[#03091e] rounded-[32px] overflow-hidden shadow-inner group/scanner">
                <div id="qr-reader" className="w-full h-full"></div>
                
                {scanning && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute top-10 left-10 w-12 h-12 border-t-4 border-l-4 border-blue-500 rounded-tl-2xl opacity-60" />
                    <div className="absolute top-10 right-10 w-12 h-12 border-t-4 border-r-4 border-blue-500 rounded-tr-2xl opacity-60" />
                    <div className="absolute bottom-10 left-10 w-12 h-12 border-b-4 border-l-4 border-blue-500 rounded-bl-2xl opacity-60" />
                    <div className="absolute bottom-10 right-10 w-12 h-12 border-b-4 border-r-4 border-blue-500 rounded-br-2xl opacity-60" />
                    <div className="absolute left-0 right-0 h-1 bg-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.5)] animate-scan-line" />
                    <div className="absolute inset-0 bg-blue-500/5 mix-blend-overlay" />
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  {!scanning && (
                    <div className="text-center space-y-6">
                      <div className="w-24 h-24 bg-white/5 backdrop-blur-md rounded-[32px] flex items-center justify-center mx-auto border border-white/10 shadow-2xl transition-transform group-hover/scanner:scale-110 duration-500">
                        <Camera size={40} className="text-blue-400 opacity-50" />
                      </div>
                      <p className="text-xs font-black text-white/40 uppercase tracking-[0.2em]">Terminal Offline</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex flex-col items-center gap-4">
                {!scanning ? (
                  <div className="flex flex-col items-center gap-4 w-full max-w-md">
                    {availableCameras.length > 0 && (
                      <select
                        value={selectedCameraId}
                        onChange={(e) => setSelectedCameraId(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {availableCameras.map(camera => (
                          <option key={camera.id} value={camera.id}>{camera.label || `Camera ${camera.id.slice(0,5)}`}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={startCamera}
                      className="metamask-button w-full flex items-center justify-center gap-4 px-12 py-5 bg-blue-600 text-white rounded-[24px] text-xs font-black uppercase tracking-widest shadow-2xl shadow-blue-600/40 hover:bg-blue-700 transition-all"
                    >
                      <Camera size={20} />
                      Initialize Scanner
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={stopCamera}
                    className="metamask-button flex items-center gap-4 px-12 py-5 bg-rose-500 text-white rounded-[24px] text-xs font-black uppercase tracking-widest shadow-2xl shadow-rose-500/40 hover:bg-rose-600 transition-all"
                  >
                    <X size={20} />
                    Terminate Feed
                  </button>
                )}
              </div>
            </div>
          </div>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

          {/* Session Asset Cart */}
          <div className="glass-card rounded-[40px] premium-shadow border border-white/40 dark:border-slate-800/40 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Session Assets</h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">{scannedItems.length} Registered Items</p>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                <Package size={18} className="text-slate-300 dark:text-slate-600" />
              </div>
            </div>
            
            <div className="p-8">
              {scannedItems.length > 0 ? (
                <div className="space-y-4">
                  {scannedItems.map((item, idx) => (
                    <div key={(item as any).sessionKey || idx} className="flex items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl premium-shadow group hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform">
                          <Package size={20} className="text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tighter">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">UID: {(item as any).unitId}</p>
                          <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase mt-0.5">Asset Ref</p>
                        </div>
                        <button onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-8 border-t border-slate-50 dark:border-slate-800">
                    <button
                      onClick={handleSubmit}
                      disabled={loading || !selectedStudent}
                      className="metamask-button w-full py-5 bg-slate-900 dark:bg-indigo-600 text-white rounded-[24px] text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 dark:shadow-indigo-600/20 hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                    >
                      {loading ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                      Authorize Transaction
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                    <QrCode size={32} className="text-slate-200 dark:text-slate-700" />
                  </div>
                  <p className="text-sm font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest italic">Terminal Waiting for Asset Scans</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Identity & Feedback */}
        <div className="space-y-8">
          <div className={`glass-card rounded-[40px] premium-shadow border-2 transition-all duration-500 overflow-hidden ${
            selectedStudent ? 'border-blue-500/20 dark:border-blue-500/40' : 'border-slate-100 dark:border-slate-800'
          }`}>
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">User Identity</h3>
              {selectedStudent ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/20 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <Check size={10} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Verified</span>
                </div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
              )}
            </div>
            
            <div className="p-8">
              {selectedStudent ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-[24px] bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl font-black text-white shadow-lg">
                      {selectedStudent.fullName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">{selectedStudent.fullName}</h4>
                      <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{selectedStudent.rollNumber}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {selectedStudent.email && (
                      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                        <Mail size={14} className="text-slate-300 dark:text-slate-600" />
                        <span className="text-[10px] font-bold uppercase tracking-widest truncate">{selectedStudent.email}</span>
                      </div>
                    )}
                    {selectedStudent.phone && (
                      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                        <Phone size={14} className="text-slate-300 dark:text-slate-600" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{selectedStudent.phone}</span>
                      </div>
                    )}
                    {(selectedStudent.department || selectedStudent.batch) && (
                      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                        <User size={14} className="text-slate-300 dark:text-slate-600" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {selectedStudent.department} {selectedStudent.batch && `• ${selectedStudent.batch}`}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-900/30">
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-3">Active Holdings</p>
                    <div className="space-y-2">
                      {allIssuedUnits[selectedStudent.studentId]?.length ? (
                        allIssuedUnits[selectedStudent.studentId].map((unitId, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-600" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{unitId}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest italic">No assets held</p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelectedStudent(null)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Reset Identity</button>
                </div>
              ) : (
                <div className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-[24px] flex items-center justify-center mx-auto">
                    <History size={24} className="text-slate-200 dark:text-slate-700" />
                  </div>
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">Scan Student QR<br/>to Verify Identity</p>
                </div>
              )}
            </div>
          </div>

          {scanResult && (
            <div className={`p-6 rounded-[32px] border-2 animate-in slide-in-from-top-4 duration-500 ${
              scanResult.success ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30 text-emerald-900 dark:text-emerald-100' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 text-rose-900 dark:text-rose-100'
            }`}>
              <div className="flex gap-4">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${scanResult.success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                  {scanResult.success ? <Check size={20} /> : <AlertTriangle size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">{scanResult.success ? 'Confirmed' : 'Scan Error'}</p>
                  <p className="text-xs font-bold opacity-70 dark:opacity-80 leading-relaxed uppercase tracking-tight">{scanResult.message}</p>
                </div>
                <button onClick={() => setScanResult(null)} className="p-1 opacity-40 hover:opacity-100"><X size={16} /></button>
              </div>
            </div>
          )}

          {sessionActivity.length > 0 && (
            <div className="glass-card rounded-[40px] premium-shadow border border-white/40 dark:border-slate-800/40 overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Terminal Activity</h3>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className="p-8 space-y-6 relative before:absolute before:left-[43px] before:top-10 before:bottom-10 before:w-px before:bg-slate-100 dark:before:bg-slate-800">
                {sessionActivity.map((tx) => (
                  <div key={tx.id} className="relative pl-12 group">
                    <div className={`absolute left-0 top-0 w-8 h-8 rounded-2xl border-4 border-white dark:border-slate-900 shadow-md flex items-center justify-center z-10 transition-transform group-hover:scale-125 ${
                      tx.transaction_type === 'issue' ? 'bg-blue-600' : 
                      tx.transaction_type === 'return' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}>
                      {tx.transaction_type === 'issue' ? <ArrowUpRight size={12} className="text-white" /> : 
                       tx.transaction_type === 'return' ? <ArrowDownRight size={12} className="text-white" /> : <AlertTriangle size={12} className="text-white" />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-1">{tx.component_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        {tx.transaction_type} • <span className="text-slate-300 dark:text-slate-600 font-medium">{formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-10 rounded-[48px] premium-shadow border border-white/40 dark:border-slate-800/40">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{unitSelectionComp ? `Available ${unitSelectionComp.name}` : 'Asset Directory'}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Manual Retrieval Terminal</p>
          </div>
          {unitSelectionComp && <button onClick={() => setUnitSelectionComp(null)} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Exit Sub-Registry</button>}
        </div>

        {unitSelectionComp ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {(() => {
              const units = (() => {
                if (txType === 'return') {
                  return studentHoldings[unitSelectionComp.id] || [];
                }

                // For issue flow, only show currently issuable units so this view
                // stays aligned with the "available units" count shown outside.
                const allUnits = getUnitIds(unitSelectionComp);
                const issuedSet = new Set(allIssuedUnits[unitSelectionComp.id] || []);
                const issuableUnits = allUnits.filter(unitId => !issuedSet.has(unitId));
                return issuableUnits.slice(0, Math.max(0, unitSelectionComp.available_quantity));
              })();
              
              if (units.length === 0) {
                return (
                  <div className="col-span-full py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      {txType === 'return' ? 'No units held by this student' : 'No units available for selection'}
                    </p>
                  </div>
                );
              }

              return units.map(unitId => {
                const isInCart = scannedItems.some((item: any) => item.id === unitSelectionComp.id && item.unitId === unitId);
                const isIssued = (allIssuedUnits[unitSelectionComp.id] || []).includes(unitId);

                return (
                  <button 
                    key={unitId} 
                    disabled={txType === 'issue' && isIssued}
                    onClick={() => { 
                      if (isInCart) {
                        setScannedItems(prev => prev.filter((item: any) => !(item.id === unitSelectionComp.id && item.unitId === unitId)));
                      } else {
                        handleManualQR(unitSelectionComp.id, unitId); 
                      }
                    }} 
                    className={`group flex flex-col items-center gap-3 p-6 border rounded-3xl transition-all duration-300 relative overflow-hidden ${
                      isInCart 
                        ? 'bg-blue-600 border-blue-600 dark:bg-indigo-600 dark:border-indigo-600' 
                        : txType === 'issue' && isIssued
                        ? 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 opacity-60 cursor-not-allowed'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-indigo-900/20 hover:border-blue-200 dark:hover:border-indigo-500/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform ${
                      isInCart ? 'bg-white scale-110' : 'bg-white dark:bg-slate-900 group-hover:scale-110'
                    }`}>
                      <Package size={20} className={isInCart ? 'text-blue-600 dark:text-indigo-600' : 'text-slate-400 dark:text-slate-500'} />
                    </div>
                    <span className={`font-mono text-[10px] font-black uppercase ${
                      isInCart ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-indigo-400'
                    }`}>
                      {unitId}
                    </span>
                    {txType === 'issue' && isIssued && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/5 dark:bg-black/20 backdrop-blur-[1px]">
                        <span className="text-[8px] font-black bg-slate-800 dark:bg-slate-950 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Issued</span>
                      </div>
                    )}
                    {isInCart && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                        <Check size={12} strokeWidth={4} />
                      </div>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(() => {
              if (txType === 'return' || txType === 'damaged') {
                if (!selectedStudent && !studentId) {
                  return (
                    <div className="col-span-full py-16 text-center bg-slate-50 dark:bg-slate-800/50 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700">
                      <User size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                      <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
                        Identity Verification Required<br/>
                        <span className="text-[10px] text-slate-300 dark:text-slate-600">Scan student QR code to see their holding assets</span>
                      </p>
                    </div>
                  );
                }

                const heldComps = components.filter(c => (studentHoldings[c.id]?.length || 0) > 0);
                
                if (heldComps.length === 0) {
                  return (
                    <div className="col-span-full py-16 text-center bg-slate-50 dark:bg-slate-800/50 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700">
                      <Package size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                      <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">
                        No Assets Found<br/>
                        <span className="text-[10px] text-slate-300 dark:text-slate-600">This student is not currently holding any issued items.</span>
                      </p>
                    </div>
                  );
                }

                return heldComps.map(comp => (
                  <button key={comp.id} onClick={() => setUnitSelectionComp(comp)} className="flex items-center justify-between p-6 bg-white dark:bg-slate-900 border border-blue-500/30 dark:border-indigo-500/30 rounded-[32px] premium-shadow group hover:border-blue-500 dark:hover:border-indigo-500 transition-all text-left">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-indigo-800 group-hover:scale-110 transition-transform">
                        <Package size={24} className="text-blue-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">{comp.name}</p>
                        <p className="text-[10px] font-bold text-blue-600 dark:text-indigo-400 uppercase tracking-widest mt-1">
                          {studentHoldings[comp.id]?.length} Units Borrowed
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-indigo-900/20 flex items-center justify-center text-blue-600 dark:text-indigo-400 transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </button>
                ));
              }

              // Default Issue mode view
              if (components.length === 0) {
                return (
                  <div className="col-span-full py-16 text-center bg-slate-50 dark:bg-slate-800/50 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700">
                    <Package size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                    <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-relaxed">No assets found in the registry.</p>
                  </div>
                );
              }

              return components.map(comp => {
                // If issuing, only show components that belong to this center and have availability
                if (txType === 'issue') {
                  const isWrongCenter = comp.center_id !== (stateCenterId || profile?.center_id);
                  if (isWrongCenter || comp.available_quantity <= 0) return null;
                }

                return (
                  <button 
                    key={comp.id} 
                    onClick={() => {
                      console.log('Selecting component:', comp.name, 'Available:', comp.available_quantity);
                      setUnitSelectionComp(comp);
                    }} 
                    className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[32px] premium-shadow group hover:border-blue-500/20 transition-all text-left"
                  >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform">
                      <Package size={24} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">{comp.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {comp.available_quantity} Units Available
                      </p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                    <ChevronRight size={18} />
                  </div>
                </button>
              );
            });
          })()}
          </div>
        )}
      </div>
    </div>
  );
}
