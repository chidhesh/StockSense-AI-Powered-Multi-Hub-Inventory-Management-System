import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Download, Trash2, Loader2, FileText, Check, ShoppingCart, X } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Quotation, ProcurementOrder, Center, InvoiceItem, Invoice, VENDORS } from '../types';
import { generateQuotationPDF, generatePurchaseOrderPDF } from '../lib/pdfUtils';

const CATEGORIES = ['Microcontrollers', 'Sensors', 'IoT Modules', 'Displays', 'Motors', 'Power Supply', 'Communication', 'Cables & Connectors', 'Tools', 'Other'];

export default function Procurement() {
  const location = useLocation();
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'quotations' | 'orders'>('quotations');
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [, setModalType] = useState<'quotation' | 'order'>('quotation');
  
  const [form, setForm] = useState({
    vendor_name: '',
    vendor_contact: '',
    center_id: '',
    tax_rate: 18,
    valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    items: [{ component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
    notes: ''
  });

  useEffect(() => {
    fetchData();
    
    // Check if we came from Analytics with a "Request Quote" action
    if (location.state?.openModal && location.state?.vendor) {
      const vendor = location.state.vendor;
      setModalType('quotation');
      setForm(prev => ({
        ...prev,
        vendor_name: vendor.name,
        vendor_contact: vendor.contact || '',
        items: [{ component_name: vendor.specialty || '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }]
      }));
      setShowModal(true);
      // Clear state so it doesn't reopen on refresh
      window.history.replaceState({}, document.title);
    }
  }, [profile, location.state]);

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, 'dd MMM yyyy');
    } catch (err) {
      return 'N/A';
    }
  };

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const [qResult, oResult, centersResult] = await Promise.allSettled([
        apiGet<Quotation[]>('/api/procurement/quotations'),
        apiGet<ProcurementOrder[]>('/api/procurement/orders'),
        apiGet<Center[]>('/api/centers')
      ]);

      if (centersResult.status === 'fulfilled') setCenters(centersResult.value);

      // Load local data first
      const localQuotations = JSON.parse(localStorage.getItem('local_quotations') || '[]');
      const localOrders = JSON.parse(localStorage.getItem('local_orders') || '[]');

      if (qResult.status === 'fulfilled' && Array.isArray(qResult.value) && qResult.value.length > 0) {
        setQuotations([...localQuotations, ...qResult.value]);
      } else {
        setQuotations([...localQuotations]);
      }

      if (oResult.status === 'fulfilled' && Array.isArray(oResult.value) && oResult.value.length > 0) {
        setOrders([...localOrders, ...oResult.value]);
      } else {
        setOrders(localOrders);
      }
    } catch (err) {
      console.error('Error in fetchData:', err);
    } finally {
      setDataLoading(false);
      setLoading(false);
    }
  };

  const addItem = () => {
    setForm(f => ({ 
      ...f, 
      items: [...f.items, { component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }] 
    }));
  };

  const removeItem = (i: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setForm(f => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        items[index].total = Number(items[index].quantity) * Number(items[index].unit_price);
      }
      return { ...f, items };
    });
  };

  const subtotal = form.items.reduce((s, i) => s + i.total, 0);
  const taxAmount = (subtotal * form.tax_rate) / 100;
  const totalAmount = subtotal + taxAmount;

  const handleSaveQuotation = async () => {
    if (!form.vendor_name || !form.vendor_contact) {
      alert('Please fill in vendor details');
      return;
    }
    if (form.items.length === 0 || form.items.some(i => !i.component_name)) {
      alert('Please add at least one item with a name');
      return;
    }

    setLoading(true);
    try {
      const qNumber = `QTN-${Date.now()}`;
      const payload: Quotation = {
        id: `q-${Date.now()}`,
        quotation_number: qNumber,
        ...form,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'draft',
        center_id: form.center_id || profile?.center_id || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Save to localStorage regardless of API success for persistence in this session
      const localQuotations = JSON.parse(localStorage.getItem('local_quotations') || '[]');
      localStorage.setItem('local_quotations', JSON.stringify([payload, ...localQuotations]));

      try {
        await apiPost('/api/procurement/quotations', payload);
      } catch (apiErr) {
        console.warn('API submission failed, using local persistence:', apiErr);
      }
      
      setShowModal(false);
      // Reset form
      setForm({
        vendor_name: '',
        vendor_contact: '',
        items: [{ component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }],
        tax_rate: 18,
        center_id: profile?.center_id || '',
        valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        notes: ''
      });
      
      await fetchData();
      alert('Quotation saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save quotation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const approveQuotation = async (q: Quotation) => {
    setLoading(true);
    try {
      // 1. Update quotation status
      const localQuotations = JSON.parse(localStorage.getItem('local_quotations') || '[]');
      const updatedLocalQuotations = localQuotations.map((item: Quotation) => 
        item.id === q.id ? { ...item, status: 'approved' } : item
      );
      localStorage.setItem('local_quotations', JSON.stringify(updatedLocalQuotations));

      try {
        await apiPatch(`/api/procurement/quotations/${q.id}`, { status: 'approved' });
      } catch (e) {
        console.warn('API update failed, using local persistence');
      }
      
      // 2. Automatically create a Purchase Order from approved quotation
      const poNumber = `PO-${Date.now()}`;
      const poPayload: ProcurementOrder = {
        id: `po-${Date.now()}`,
        order_number: poNumber,
        quotation_id: q.id,
        vendor_name: q.vendor_name,
        vendor_contact: q.vendor_contact,
        items: q.items,
        subtotal: q.subtotal,
        tax_rate: q.tax_rate,
        tax_amount: q.tax_amount,
        total_amount: q.total_amount,
        center_id: q.center_id,
        status: 'ordered',
        order_date: format(new Date(), 'yyyy-MM-dd'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const localOrders = JSON.parse(localStorage.getItem('local_orders') || '[]');
      localStorage.setItem('local_orders', JSON.stringify([poPayload, ...localOrders]));

      try {
        await apiPost('/api/procurement/orders', poPayload);
      } catch (e) {
        console.warn('API order creation failed, using local persistence');
      }
      
      await fetchData();
      setActiveTab('orders');
      alert('Quotation approved and Purchase Order created!');
    } catch (err) {
      console.error(err);
      alert('Error approving quotation.');
    } finally {
      setLoading(false);
    }
  };

  const convertToInvoice = async (order: ProcurementOrder) => {
    setLoading(true);
    try {
      const invNumber = `INV-${Date.now()}`;
      const invPayload = {
        invoice_number: invNumber,
        vendor_name: order.vendor_name,
        vendor_contact: order.vendor_contact,
        items: order.items,
        subtotal: order.subtotal,
        tax_rate: order.tax_rate,
        tax_amount: order.tax_amount,
        total_amount: order.total_amount,
        center_id: order.center_id,
        status: 'pending',
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        created_by: user?.id
      };
      
      // Update local order status
      const localOrders = JSON.parse(localStorage.getItem('local_orders') || '[]');
      const updatedLocalOrders = localOrders.map((o: ProcurementOrder) => 
        o.id === order.id ? { ...o, status: 'received' } : o
      );
      localStorage.setItem('local_orders', JSON.stringify(updatedLocalOrders));

      try {
        const inv = await apiPost<Invoice>('/api/invoices', invPayload);
        await apiPatch(`/api/procurement/orders/${order.id}`, { 
          status: 'received', 
          invoice_id: (inv as any).id 
        });
      } catch (e) {
        console.warn('API invoice conversion failed, using local persistence');
      }
      
      await fetchData();
      alert('Invoice generated successfully! View it in the Invoices section.');
    } catch (err) {
      console.error(err);
      alert('Error converting to invoice.');
    } finally {
      setLoading(false);
      setDataLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6 relative">
      {dataLoading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
          <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
        </div>
      )}
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Management</h1>
          <p className="text-sm text-gray-500">Manage quotations, purchase orders, and tax invoicing</p>
        </div>
        <button
          onClick={() => {
            setModalType('quotation');
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} /> New Quotation
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('quotations')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'quotations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Quotations
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'orders' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Purchase Orders
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {activeTab === 'quotations' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-600">Quotation #</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Vendor</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Total (Inc. Tax)</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Valid Until</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <FileText size={40} className="mx-auto mb-3 opacity-20" />
                      No quotations found
                    </td>
                  </tr>
                ) : (
                  quotations.map(q => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-xs">{q.quotation_number}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{q.vendor_name}</div>
                        <div className="text-xs text-gray-500">{q.vendor_contact}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold">₹{q.total_amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          q.status === 'approved' ? 'bg-green-100 text-green-700' : 
                          q.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(q.valid_until)}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button 
                          onClick={() => generateQuotationPDF(q, centers.find(c => c.id === q.center_id)?.name || 'N/A')}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Download size={16} />
                        </button>
                        {q.status === 'draft' && (
                          <button 
                            onClick={() => approveQuotation(q)}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve & Create PO"
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-600">PO #</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Vendor</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Amount</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Order Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <ShoppingCart size={40} className="mx-auto mb-3 opacity-20" />
                      No purchase orders found
                    </td>
                  </tr>
                ) : (
                  orders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-xs">{o.order_number}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{o.vendor_name}</td>
                      <td className="px-6 py-4 font-semibold">₹{o.total_amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          o.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(o.order_date)}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button 
                          onClick={() => generatePurchaseOrderPDF(o, centers.find(c => c.id === o.center_id)?.name || 'N/A')}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Download size={16} />
                        </button>
                        {o.status === 'ordered' && (
                          <button 
                            onClick={() => convertToInvoice(o)}
                            disabled={loading}
                            className="px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors uppercase tracking-tight disabled:opacity-50 flex items-center gap-1"
                          >
                            {loading && <Loader2 size={12} className="animate-spin" />}
                            Receive & Invoice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quotation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Create New Quotation</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Select Vendor</label>
                  <select 
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    onChange={e => {
                      const v = VENDORS.find(vendor => vendor.id === e.target.value);
                      if (v) {
                        setForm({...form, vendor_name: v.name, vendor_contact: v.contact});
                      }
                    }}
                    value={VENDORS.find(v => v.name === form.vendor_name)?.id || ''}
                  >
                    <option value="">-- Choose Existing Vendor --</option>
                    {VENDORS.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Vendor Name</label>
                  <input 
                    type="text" 
                    value={form.vendor_name}
                    onChange={e => setForm({...form, vendor_name: e.target.value})}
                    placeholder="Enter vendor name"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Vendor Contact</label>
                  <input 
                    type="text" 
                    value={form.vendor_contact}
                    onChange={e => setForm({...form, vendor_contact: e.target.value})}
                    placeholder="Email or Phone"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Target Center</label>
                  <select 
                    value={form.center_id}
                    onChange={e => setForm({...form, center_id: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none"
                  >
                    <option value="">Select Center</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">GST Rate (%)</label>
                  <input 
                    type="number" 
                    value={form.tax_rate}
                    onChange={e => setForm({...form, tax_rate: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-gray-900">Line Items</h4>
                  <button onClick={addItem} className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
                    <Plus size={14} /> Add Item
                  </button>
                </div>
                
                <div className="space-y-3">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 p-3 rounded-xl">
                      <div className="col-span-4 space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Component Name</label>
                        <input 
                          type="text" 
                          value={item.component_name}
                          onChange={e => updateItem(idx, 'component_name', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Category</label>
                        <select 
                          value={item.category}
                          onChange={e => updateItem(idx, 'category', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Qty</label>
                        <input 
                          type="number" 
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-gray-400">Unit Price</label>
                        <input 
                          type="number" 
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-1 pb-1 text-right">
                        <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-900">₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">GST ({form.tax_rate}%)</span>
                  <span className="font-semibold text-gray-900">₹{taxAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3">
                  <span className="text-gray-900">Total Amount</span>
                  <span className="text-blue-600">₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowModal(false)}
                className="px-6 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveQuotation}
                disabled={loading}
                className="px-8 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-shadow shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Saving...' : 'Save Draft Quotation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
