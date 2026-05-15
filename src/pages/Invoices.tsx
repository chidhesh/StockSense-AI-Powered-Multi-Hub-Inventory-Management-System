import { useEffect, useState } from 'react';
import { Plus, Download, Trash2, Loader2, Receipt, Check } from 'lucide-react';
import { format } from 'date-fns';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Invoice, InvoiceItem, Center } from '../types';
import { generateInvoicePDF } from '../lib/pdfUtils';

const CATEGORIES = ['Microcontrollers', 'Sensors', 'IoT Modules', 'Displays', 'Motors', 'Power Supply', 'Communication', 'Cables & Connectors', 'Tools', 'Other'];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Invoices() {
  const { profile, user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    vendor_name: '',
    vendor_contact: '',
    center_id: '',
    tax_rate: 18,
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    items: [{ component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
  });

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiGet<Invoice[]>('/api/invoices');
      setInvoices(data);

      const centersData = await apiGet<Center[]>('/api/centers');
      setCenters(centersData);
    } catch {
      setInvoices([]);
      setCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setForm(f => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        items[index].total = items[index].quantity * items[index].unit_price;
      }
      return { ...f, items };
    });
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }] }));
  };

  const removeItem = (i: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  };

  const subtotal = form.items.reduce((s, i) => s + i.total, 0);
  const taxAmount = (subtotal * form.tax_rate) / 100;
  const totalAmount = subtotal + taxAmount;

  const handleSave = async () => {
    setSaving(true);
    try {
      const invoiceNumber = `INV-${Date.now()}`;
      const centerId = form.center_id || profile?.center_id || null;

      const inserted = await apiPost<Invoice>('/api/invoices', {
        invoice_number: invoiceNumber,
        vendor_name: form.vendor_name,
        vendor_contact: form.vendor_contact || null,
        items: form.items,
        subtotal, tax_rate: form.tax_rate, tax_amount: taxAmount, total_amount: totalAmount,
        center_id: centerId,
        status: 'pending',
        invoice_date: form.invoice_date,
        created_by: user?.id,
      });

      setShowModal(false);
      setForm({ vendor_name: '', vendor_contact: '', center_id: '', tax_rate: 18, invoice_date: format(new Date(), 'yyyy-MM-dd'), items: [{ component_name: '', category: CATEGORIES[0], quantity: 1, unit_price: 0, total: 0 }] });
      await fetchData();

      if (inserted) {
        const cName = centers.find(c => c.id === centerId)?.name || 'N/A';
        generateInvoicePDF(inserted as Invoice, cName);
      }
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    await apiPatch(`/api/invoices/${id}`, { status: 'paid', updated_at: new Date().toISOString() });
    await fetchData();
  };

  const downloadInvoice = (invoice: Invoice) => {
    const cName = (invoice as Invoice & { center?: { name: string } }).center?.name || 'N/A';
    generateInvoicePDF(invoice, cName);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{invoices.length} invoices</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Create Invoice
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Center</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">GST</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                    No invoices yet
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const center = (inv as Invoice & { center?: { name: string } }).center;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{inv.vendor_name}</p>
                        {inv.vendor_contact && <p className="text-xs text-gray-400">{inv.vendor_contact}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{center?.name || '—'}</td>
                      <td className="px-4 py-3 text-right">₹{Number(inv.subtotal || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">₹{Number(inv.tax_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{Number(inv.total_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(inv.invoice_date), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {inv.status === 'pending' && (
                            <button onClick={() => markPaid(inv.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Mark as paid">
                              <Check size={15} />
                            </button>
                          )}
                          <button onClick={() => downloadInvoice(inv)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Download size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold">Create Tax Invoice</h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                  <input
                    value={form.vendor_name}
                    onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Vendor name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Contact</label>
                  <input
                    value={form.vendor_contact}
                    onChange={e => setForm(f => ({ ...f, vendor_contact: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Email / phone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Center</label>
                  <select
                    value={form.center_id}
                    onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select center</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
                  <select
                    value={form.tax_rate}
                    onChange={e => setForm(f => ({ ...f, tax_rate: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Line Items</label>
                  <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Component</label>}
                        <input
                          value={item.component_name}
                          onChange={e => updateItem(i, 'component_name', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Component name"
                        />
                      </div>
                      <div className="col-span-3">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Category</label>}
                        <select
                          value={item.category}
                          onChange={e => updateItem(i, 'category', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Qty</label>}
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-gray-500 mb-1">Unit (₹)</label>}
                        <input
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => removeItem(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>GST ({form.tax_rate}%)</span><span>₹{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 mt-2">
                  <span>Total</span><span>₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.vendor_name}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save & Download Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
