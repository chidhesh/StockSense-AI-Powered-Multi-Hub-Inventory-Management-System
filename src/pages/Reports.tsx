import { useEffect, useState } from 'react';
import { FileText, Download, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Report, Component, InventoryTransaction, Center, Student } from '../types';
import { generateReportPDF } from '../lib/pdfUtils';

export default function Reports() {
  const { profile, user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    report_type: 'session' as Report['report_type'],
    title: `Session Report - ${format(new Date(), 'dd MMM yyyy')}`,
    period_start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    period_end: format(new Date(), 'yyyy-MM-dd'),
    center_id: '',
  });

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [repRes, txRes, compRes, centersRes, studentRes] = await Promise.all([
        apiGet<Report[]>('/api/reports'),
        apiGet<InventoryTransaction[]>('/api/inventory-transactions?limit=1000'),
        apiGet<Component[]>('/api/components'),
        (profile?.role === 'master_admin' || profile?.role === 'System Administrator') ? apiGet<Center[]>('/api/centers') : Promise.resolve([]),
        apiGet<Student[]>('/api/students'),
      ]);

      setReports(repRes);
      setTransactions(txRes);
      setComponents(compRes);
      setCenters(centersRes);
      setStudents(studentRes);

      if (profile?.center_id) setForm(f => ({ ...f, center_id: profile.center_id! }));
    } catch {
      setReports([]);
      setTransactions([]);
      setComponents([]);
      setCenters([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const centerId = form.center_id || profile?.center_id || '';
      const start = new Date(form.period_start);
      const end = new Date(form.period_end);

      const periodTx = transactions.filter(t => {
        const d = new Date(t.session_date);
        return d >= start && d <= end && (centerId ? t.center_id === centerId : true);
      });

      const compSummary = components.filter(c => centerId ? c.center_id === centerId : true).map(c => {
        const compTx = periodTx.filter(t => t.component_id === c.id);
        return {
          id: c.id,
          name: c.name,
          issued: compTx.filter(t => t.transaction_type === 'issue').reduce((s, t) => s + t.quantity, 0),
          returned: compTx.filter(t => t.transaction_type === 'return').reduce((s, t) => s + t.quantity, 0),
          damaged: compTx.filter(t => t.transaction_type === 'damaged').reduce((s, t) => s + t.quantity, 0),
        };
      });

      const studentSummary = students.map(s => {
        const studentTx = periodTx.filter(t => t.student_uuid === s.id);
        return {
          id: s.id,
          name: s.full_name,
          roll: s.roll_number,
          issued: studentTx.filter(t => t.transaction_type === 'issue').reduce((s, t) => s + t.quantity, 0),
          returned: studentTx.filter(t => t.transaction_type === 'return').reduce((s, t) => s + t.quantity, 0),
          damaged: studentTx.filter(t => t.transaction_type === 'damaged').reduce((s, t) => s + t.quantity, 0),
        };
      }).filter(s => s.issued > 0 || s.returned > 0 || s.damaged > 0);

      const totalIssued = compSummary.reduce((s, c) => s + c.issued, 0);
      const totalReturned = compSummary.reduce((s, c) => s + c.returned, 0);
      const totalDamaged = compSummary.reduce((s, c) => s + c.damaged, 0);
      const wastagePercentage = totalIssued > 0 ? (totalDamaged / totalIssued) * 100 : 0;

      const inserted = await apiPost<Report>('/api/reports', {
        report_type: form.report_type,
        title: form.title,
        center_id: centerId || null,
        period_start: form.period_start,
        period_end: form.period_end,
        generated_by: user?.id,
        data: {
          total_issued: totalIssued,
          total_returned: totalReturned,
          total_damaged: totalDamaged,
          wastage_percentage: wastagePercentage,
          components: compSummary,
          students: studentSummary,
        },
      });

      setShowModal(false);
      await fetchData();

      if (inserted) {
        const centerName = centers.find(c => c.id === centerId)?.name || profile?.center?.name || 'All Centers';
        generateReportPDF(inserted as Report, centerName);
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadExisting = (report: Report) => {
    const centerName = (report as Report & { center?: { name: string } }).center?.name || 'Unknown Center';
    generateReportPDF(report, centerName);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Compiling Data...</p>
    </div>
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <FileText size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Analytical Reports</h1>
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {reports.length} Generated Documents • <span className="text-indigo-600">Compliance & Audit</span>
          </p>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Plus size={16} /> Generate Report
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="glass-card p-20 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100">
            <FileText size={32} className="text-slate-200" />
          </div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No reports archived in registry</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map(r => {
            const data = r.data;
            const center = (r as Report & { center?: { name: string } }).center;
            return (
              <div key={r.id} className="glass-card p-6 group relative overflow-hidden">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-indigo-50 transition-colors">
                    <FileText size={20} className="text-indigo-600" />
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-xl border ${
                    r.report_type === 'session' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                    r.report_type === 'monthly' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    'bg-slate-50 text-slate-600 border-slate-100'
                  }`}>{r.report_type}</span>
                </div>
                
                <h4 className="font-black text-slate-900 uppercase tracking-tight leading-none mb-2">{r.title}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">{center?.name || 'Global Summary'}</p>
                
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                    <p className="text-sm font-black text-indigo-600">{data.total_issued}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Issued</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                    <p className="text-sm font-black text-emerald-600">{data.total_returned}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Back</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                    <p className="text-sm font-black text-rose-600">{data.total_damaged}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Loss</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {format(new Date(r.period_start), 'dd MMM')} – {format(new Date(r.period_end), 'dd MMM yyyy')}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                    <AlertTriangle size={12} /> {data.wastage_percentage.toFixed(1)}% Waste
                  </div>
                </div>

                <button
                  onClick={() => downloadExisting(r)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                >
                  <Download size={14} /> Download PDF
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-xl overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <FileText size={18} className="text-white" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Analytical Engine</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">&times;</button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Report Identity *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Report Scope</label>
                  <select
                    value={form.report_type}
                    onChange={e => setForm(f => ({ ...f, report_type: e.target.value as any }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                  >
                    <option value="session">Session Protocol</option>
                    <option value="monthly">Monthly Cycle</option>
                    <option value="annual">Annual Audit</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {(profile?.role === 'master_admin' || profile?.role === 'System Administrator') && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Hub</label>
                    <select
                      value={form.center_id}
                      onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Global Network</option>
                      {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Timeline Start</label>
                  <input
                    type="date"
                    value={form.period_start}
                    onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Timeline End</label>
                  <input
                    type="date"
                    value={form.period_end}
                    onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 text-sm font-bold text-slate-900 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setForm(f => ({ ...f, period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'), report_type: 'monthly', title: `Monthly Report - ${format(new Date(), 'MMMM yyyy')}` }));
                  }}
                  className="flex-1 py-3 bg-slate-50 border border-slate-100 rounded-xl text-[8px] font-black uppercase tracking-widest text-indigo-600 hover:bg-white hover:border-indigo-200 transition-all"
                >
                  Quick Monthly
                </button>
                <button
                  onClick={() => {
                    setForm(f => ({ ...f, period_start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), period_end: format(new Date(), 'yyyy-MM-dd'), report_type: 'session', title: `Session Report - ${format(new Date(), 'dd MMM yyyy')}` }));
                  }}
                  className="flex-1 py-3 bg-slate-50 border border-slate-100 rounded-xl text-[8px] font-black uppercase tracking-widest text-indigo-600 hover:bg-white hover:border-indigo-200 transition-all"
                >
                  Last 7 Days
                </button>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={generateReport}
                  disabled={generating || !form.title}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {generating ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Execute Protocol'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
