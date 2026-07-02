import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Package, CreditCard as Edit, Trash2, QrCode, AlertTriangle, Loader2, X, Building2, ChevronRight, ChevronLeft, MapPin, Info, Users, AlertCircle } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { Component, ComponentStatus, Center, InventoryTransaction } from '../types';
import { generateQRCode, generateComponentQRData, generateSKU } from '../lib/qrUtils';

const CATEGORIES = ['Microcontrollers', 'Sensors', 'IoT Modules', 'Displays', 'Motors', 'Power Supply', 'Communication', 'Cables & Connectors', 'Tools', 'Other'];

type AssetDisplayStatus = 'low_stock' | 'out_of_stock' | 'damaged' | 'active';

const isOutOfStockAsset = (c: Component) =>
  c.status === 'out_of_stock' || c.available_quantity === 0;

const isLowStockAsset = (c: Component) =>
  !isOutOfStockAsset(c) && (
    c.status === 'low_stock' ||
    (c.total_quantity > 0 && c.available_quantity > 0 && c.available_quantity <= Math.max(2, Math.ceil(c.total_quantity * 0.2)))
  );

const getDamagedUnits = (componentId: string, txs: InventoryTransaction[]) =>
  txs
    .filter(t => t.component_id === componentId && t.transaction_type === 'damaged')
    .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

const isDamagedAsset = (c: Component, txs: InventoryTransaction[]) =>
  getDamagedUnits(c.id, txs) > 0;

const getAssetDisplayStatus = (c: Component, txs: InventoryTransaction[]): AssetDisplayStatus => {
  if (isOutOfStockAsset(c)) return 'out_of_stock';
  if (isLowStockAsset(c)) return 'low_stock';
  if (isDamagedAsset(c, txs)) return 'damaged';
  return 'active';
};

const displayStatusColors: Record<AssetDisplayStatus, string> = {
  active: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  low_stock: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  out_of_stock: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  damaged: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
};

const displayStatusLabels: Record<AssetDisplayStatus, string> = {
  active: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out Of Stock',
  damaged: 'Damaged Asset',
};

export default function Inventory() {
  const { profile, user } = useAuth();
  const normalizedRole = profile?.role?.toLowerCase() || '';
  const isMaster = normalizedRole === 'main_admin' || normalizedRole === 'system_admin' || normalizedRole.includes('master admin') || normalizedRole.includes('system administrator');
  const isInventoryManager = normalizedRole === 'center_admin' || normalizedRole.includes('inventory manager');
  // Check for super admin emails
  const isSuperAdmin = user?.email === 'system@techhub.in' || user?.email === 'admin@techhub.in';
  const location = useLocation();
  const { centerId: initialCenterId, centerName: initialCenterName } = (location.state || {}) as { centerId?: string; centerName?: string };

  const [components, setComponents] = useState<Component[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredComp, setHoveredComp] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState(location.state?.filter || 'all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [currentCenterId, setCurrentCenterId] = useState<string>(initialCenterId || '');
  const [currentCenterName, setCurrentCenterName] = useState<string>(initialCenterName || '');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Component | null>(null);
  const [qrModal, setQrModal] = useState<{ component: Component; dataUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [requestingReplenishment, setRequestingReplenishment] = useState<string | null>(null);

  const [colFilters, setColFilters] = useState({
    name: '',
    category: '',
    status: '',
    hub: '',
    description: ''
  });

  const [form, setForm] = useState({
    name: '', category: CATEGORIES[0], description: '', total_quantity: 1,
    max_usage_limit: 10, unit_cost: 0, center_id: '', status: 'active' as ComponentStatus,
  });

  useEffect(() => {
    fetchData();
  }, [profile, currentCenterId]);

  useEffect(() => {
    if (initialCenterId && initialCenterId !== currentCenterId) {
      setCurrentCenterId(initialCenterId);
      setCurrentCenterName(initialCenterName || '');
    } else if (!initialCenterId && !currentCenterId) {
      // If not super admin and is inventory manager, set to their own center
      if (!isSuperAdmin && isInventoryManager && profile?.center_id) {
        setCurrentCenterId(profile.center_id);
        if (profile.center) {
          setCurrentCenterName(profile.center.name || '');
        }
      }
    }
  }, [initialCenterId, initialCenterName, isSuperAdmin, isInventoryManager, profile]);

  useEffect(() => {
    if (location.state?.filter) {
      setFilterStatus(location.state.filter);
    }
  }, [location.state?.filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const centerQuery = currentCenterId ? `?center_id=${currentCenterId}` : '';
      const [compData, txData] = await Promise.all([
        apiGet<Component[]>(`/api/components${centerQuery}`),
        apiGet<InventoryTransaction[]>(`/api/inventory-transactions?limit=1000${currentCenterId ? `&center_id=${currentCenterId}` : ''}`)
      ]);
      
      setComponents(compData);
      setTransactions(txData || []);

      // Fetch centers only for super admins
      if (isSuperAdmin) {
        const centersData = await apiGet<Center[]>('/api/centers');
        setCenters(centersData);
      } else {
        setCenters([]);
      }
    } catch {
      setComponents([]);
      setTransactions([]);
      setCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setSaveError('');
    setForm({
      name: '', category: CATEGORIES[0], description: '', total_quantity: 1,
      max_usage_limit: 10, unit_cost: 0,
      center_id: profile?.center_id || (centers[0]?.id || ''),
      status: 'active',
    });
    setShowModal(true);
  };

  const openEdit = (c: Component) => {
    setEditItem(c);
    setSaveError('');
    setForm({
      name: c.name, category: c.category, description: c.description,
      total_quantity: c.total_quantity, max_usage_limit: c.max_usage_limit,
      unit_cost: c.unit_cost, center_id: c.center_id, status: c.status,
    });
    setShowModal(true);
  };

  const handleRequestReplenishment = async (component: Component) => {
    setRequestingReplenishment(component.id);
    try {
      const requiredQuantity = Math.max(
        1,
        (component.min_stock_threshold || 10) - component.available_quantity
      );
      await apiPost('/api/replenishment-requests', {
        componentId: component.id,
        centerId: component.center_id,
        requiredQuantity,
        reason: `Low stock: ${component.available_quantity} available, threshold is ${component.min_stock_threshold || 10}`
      });
      alert('Replenishment request sent successfully!');
    } catch (error) {
      console.error('Error requesting replenishment:', error);
      alert('Failed to send replenishment request');
    } finally {
      setRequestingReplenishment(null);
    }
  };

  const handleSave = async () => {
    setSaveError('');
    const centerId = form.center_id || profile?.center_id;
    if (!centerId) {
      setSaveError(
        isMaster
          ? 'Choose a center for this component.'
          : 'Your profile has no center assigned; a master admin must assign you to a center.'
      );
      return;
    }
    if (!form.name.trim()) {
      setSaveError('Enter a component name.');
      return;
    }

    setSaving(true);
    try {
      const sku =
        editItem?.sku ||
        `${generateSKU(form.category, form.name, components.length + 1)}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`;
      const qrId =
        editItem?.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tmp-${Date.now()}`);
      const qrData = generateComponentQRData(qrId, form.name.trim(), centerId);

      // For new components, available quantity equals total quantity
      // For existing components, backend will calculate available_quantity based on transactions
      const payload: any = {
        name: form.name.trim(),
        category: form.category,
        description: form.description,
        total_quantity: form.total_quantity,
        max_usage_limit: form.max_usage_limit,
        usage_count: 0,
        unit_cost: form.unit_cost,
        center_id: centerId,
        status: form.status,
        sku,
        qr_code: editItem?.qr_code || qrData,
        min_stock_threshold: 5,
        course_id: null,
        course_name: null,
        skill_tags: null,
        is_shared_component: false,
      };

      // Only set available_quantity for new components
      if (!editItem) {
        payload.available_quantity = form.total_quantity;
        // Set auto status for new components
        payload.status = form.total_quantity === 0 ? 'out_of_stock'
          : form.total_quantity <= 5 ? 'low_stock' : form.status;
      }

      console.log('Attempting to save component:', payload);

      if (editItem) {
        await apiPatch(`/api/components/${editItem.id}`, payload);
      } else {
        const response = await apiPost('/api/components', payload);
        console.log('Component created successfully:', response);
      }

      setShowModal(false);
      setEditItem(null);
      await fetchData();
    } catch (e: any) {
      console.error('Detailed save error:', e);
      setSaveError(e.message || 'Failed to save component. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this component? This cannot be undone.')) return;
    await apiDelete(`/api/components/${id}`);
    await fetchData();
  };

  const showQR = async (c: Component) => {
    const qrData = c.qr_code || generateComponentQRData(c.id, c.name, c.center_id);
    const dataUrl = await generateQRCode(qrData);
    setQrModal({ component: c, dataUrl });
  };

  const filtered = components.filter(c => {
    // If not super admin and is inventory manager, only show their own center's inventory
    if (!isSuperAdmin && isInventoryManager && profile?.center_id && c.center_id !== profile.center_id) return false;
    if (currentCenterId && c.center_id !== currentCenterId) return false;

    const matchSearch = (c.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (c.category?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (c.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
    
    let matchStatus = filterStatus === 'all';
    if (filterStatus === 'low_stock') {
      matchStatus = isLowStockAsset(c);
    } else if (filterStatus === 'out_of_stock') {
      matchStatus = isOutOfStockAsset(c);
    } else if (filterStatus === 'damaged') {
      matchStatus = isDamagedAsset(c, transactions);
    }
    
    const matchColDescription = !colFilters.description || (c.description || '').toLowerCase().includes(colFilters.description.toLowerCase());
    const matchColName = !colFilters.name || (c.name || '').toLowerCase().includes(colFilters.name.toLowerCase());
    const matchColCategory = !colFilters.category || (c.category || '').toLowerCase().includes(colFilters.category.toLowerCase());
    const matchColStatus = !colFilters.status || (c.status || '').toLowerCase().includes(colFilters.status.toLowerCase());
    const matchColHub = !colFilters.hub || (centers.find(cent => cent.id === c.center_id)?.name || '').toLowerCase().includes(colFilters.hub.toLowerCase());
    const matchCat = filterCategory === 'all' || c.category === filterCategory;

    return matchSearch && matchStatus && matchCat &&
           matchColName && matchColCategory && matchColStatus &&
           matchColHub && matchColDescription;
  });

  const inventoryTotals = (() => {
    const scope = components.filter(c => {
      // If not super admin and is inventory manager, only their own center
      if (!isSuperAdmin && isInventoryManager && profile?.center_id) {
        return c.center_id === profile.center_id;
      }
      // Otherwise, use currentCenterId if set
      if (currentCenterId) {
        return c.center_id === currentCenterId;
      }
      return true;
    });
    const totalUnits = scope.reduce((s, c) => s + (c.total_quantity || 0), 0);
    const availableUnits = scope.reduce((s, c) => s + (c.available_quantity || 0), 0);
    const scopeIds = new Set(scope.map(c => c.id));
    const scopeTxs = transactions.filter(t => scopeIds.has(t.component_id));
    const issuedUnits = scopeTxs
      .filter(t => t.transaction_type === 'issue')
      .reduce((s, t) => s + (Number(t.quantity) || 0), 0);
    const returnedUnits = scopeTxs
      .filter(t => t.transaction_type === 'return')
      .reduce((s, t) => s + (Number(t.quantity) || 0), 0);
    const damagedUnits = scopeTxs
      .filter(t => t.transaction_type === 'damaged')
      .reduce((s, t) => s + (Number(t.quantity) || 0), 0);
    const netIssued = Math.max(0, issuedUnits - returnedUnits);
    const lowStockCount = scope.filter(isLowStockAsset).length;
    const outOfStockCount = scope.filter(isOutOfStockAsset).length;
    const damagedAssetCount = scope.filter(c => isDamagedAsset(c, scopeTxs)).length;
    return {
      totalUnits,
      availableUnits,
      netIssued,
      damagedUnits,
      assetCount: scope.length,
      lowStockCount,
      outOfStockCount,
      damagedAssetCount,
    };
  })();

  const getHubInfo = (centerId: string) => {
    const hub = centers.find(c => c.id === centerId);
    return {
      name: hub?.name || 'Unknown Hub',
      location: hub?.location || 'Location not set',
    };
  };

  const getHubStats = (centerId: string) => {
    const hubComponents = components.filter(c => c.center_id === centerId);
    const totalUnits = hubComponents.reduce((s, c) => s + (c.total_quantity || 0), 0);
    const availableUnits = hubComponents.reduce((s, c) => s + (c.available_quantity || 0), 0);
    const lowStockCount = hubComponents.filter(isLowStockAsset).length;
    const outOfStockCount = hubComponents.filter(isOutOfStockAsset).length;
    const componentCount = hubComponents.length;
    return { totalUnits, availableUnits, lowStockCount, outOfStockCount, componentCount };
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-slate-900 dark:text-slate-100">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-black uppercase tracking-widest animate-pulse">Scanning Registry...</p>
    </div>
  );

  const canSave = Boolean(form.name.trim()) && Boolean(form.center_id || profile?.center_id) && (!isMaster || Boolean(form.center_id));

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 text-slate-900 dark:text-slate-100">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Package size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
              {currentCenterName ? `Inventory - ${currentCenterName}` : 'Inventory Management'}
            </h1>
          </div>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {currentCenterName 
              ? `Managing ${currentCenterName}` 
              : isMaster 
                ? 'Select a hub to view its inventory' 
                : 'All Hubs Overview'} •{' '}
            <span className="text-indigo-600 dark:text-indigo-400">
              {inventoryTotals.assetCount} components • {inventoryTotals.availableUnits} units available • {inventoryTotals.netIssued} issued
            </span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <div className="relative group">
              <select
                value={currentCenterId}
                onChange={e => {
                  const id = e.target.value;
                  const name = centers.find(c => c.id === id)?.name || '';
                  setCurrentCenterId(id);
                  setCurrentCenterName(name);
                }}
                className="appearance-none pl-10 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-widest premium-shadow focus:border-indigo-500/30 transition-all cursor-pointer min-w-[250px] text-slate-900 dark:text-white"
              >
                <option value="">All Hubs</option>
                {centers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.location})</option>
                ))}
              </select>
              <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-indigo-500 transition-colors" />
              <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
            </div>
          )}
          <button
            onClick={openAdd}
            className="metamask-button flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all"
          >
            <Plus size={16} />
            New Asset
          </button>
        </div>
      </div>

      {/* Hub Grid View (for super admins - no center selected) */}
      {isSuperAdmin && !currentCenterId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {centers.map(center => {
              const stats = getHubStats(center.id);
              return (
                <div
                  key={center.id}
                  onClick={() => {
                    setCurrentCenterId(center.id);
                    setCurrentCenterName(center.name);
                  }}
                  className="glass-card p-6 cursor-pointer hover:scale-[1.02] transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-800 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                      <Building2 size={24} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1.5">{center.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <MapPin size={12} className="text-indigo-500" /> {center.location}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{stats.componentCount}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Components</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{stats.availableUnits}/{stats.totalUnits}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Available</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {stats.lowStockCount > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                        <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase">{stats.lowStockCount} Low Stock</span>
                      </div>
                    )}
                    {stats.outOfStockCount > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl">
                        <AlertCircle size={12} className="text-rose-600 dark:text-rose-400" />
                        <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase">{stats.outOfStockCount} Out Of Stock</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>

          {centers.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-16 text-center">
              <Building2 size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-700" />
              <p className="text-lg font-black text-slate-500 dark:text-slate-400 uppercase">No hubs available</p>
              <p className="text-sm text-slate-400 mt-1">Add hubs from the Hubs page</p>
            </div>
          )}
        </>
      )}

      {/* Inventory View (when center is selected OR not super admin) */}
      {(!isSuperAdmin || currentCenterId) && (
        <>
          {isSuperAdmin && currentCenterId && (
            <button
              onClick={() => {
                setCurrentCenterId('');
                setCurrentCenterName('');
              }}
              className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
            >
              <ChevronLeft size={16} /> Back to all hubs
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Low Stock',
                value: inventoryTotals.lowStockCount,
                sub: 'Needs restock',
                filter: 'low_stock',
                color: 'border-amber-200 dark:border-amber-900/40 hover:border-amber-400',
              },
              {
                label: 'Out Of Stock',
                value: inventoryTotals.outOfStockCount,
                sub: 'Unavailable now',
                filter: 'out_of_stock',
                color: 'border-slate-200 dark:border-slate-700 hover:border-slate-400',
              },
              {
                label: 'Damaged Asset',
                value: inventoryTotals.damagedAssetCount,
                sub: `${inventoryTotals.damagedUnits} units logged`,
                filter: 'damaged',
                color: 'border-rose-200 dark:border-rose-900/40 hover:border-rose-400',
              },
            ].map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={() => setFilterStatus(stat.filter)}
                className={`glass-card rounded-2xl p-5 border text-left transition-all ${stat.color} ${
                  filterStatus === stat.filter ? 'ring-2 ring-indigo-500/40' : ''
                }`}
              >
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{stat.sub}</p>
              </button>
            ))}
          </div>

      {/* Glassmorphism Filters */}
      <div className="glass-card p-4 rounded-[32px] premium-shadow border border-white/40 dark:border-slate-800/40">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[300px] group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, SKU or category..."
              className="w-full pl-12 pr-6 py-3 bg-slate-50/50 dark:bg-slate-800/50 border border-transparent rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 focus:ring-4 focus:ring-indigo-500/5 text-sm font-bold transition-all placeholder:text-slate-400 placeholder:font-bold placeholder:uppercase placeholder:tracking-widest dark:text-white"
            />
          </div>
          
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="pl-4 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-slate-900 dark:text-white"
            >
              <option value="all">All Assets</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out Of Stock</option>
              <option value="damaged">Damaged Asset</option>
            </select>

            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="hidden lg:block pl-4 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-slate-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Assets List */}
      <div className="glass-card rounded-[40px] premium-shadow overflow-hidden border border-white/40 dark:border-slate-800/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Asset Details</th>
                <th className="px-6 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Availability Status</th>
                <th className="px-6 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                {isMaster && <th className="px-6 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Hub Location</th>}
                <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isMaster ? 5 : 4} className="py-32 text-center">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                      <Package size={32} className="text-slate-200 dark:text-slate-700" />
                    </div>
                    <p className="text-sm font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">No assets discovered in registry</p>
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="group hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all duration-300">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                          <Package size={24} className="text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tighter">{c.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{c.category}</span>
                            <span className="text-slate-200 dark:text-slate-700 text-xs">•</span>
                            <span className="text-[10px] font-black text-indigo-500/70 dark:text-indigo-400/70 uppercase tracking-widest">{c.sku || 'UNREGISTERED'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center relative">
                      <div 
                        className="inline-block cursor-help group/liquidity"
                        onMouseEnter={() => setHoveredComp(c.id)}
                        onMouseLeave={() => setHoveredComp(null)}
                      >
                        <p className="text-sm font-black text-slate-900 dark:text-white tracking-tighter">{c.available_quantity} <span className="text-[10px] text-slate-400 dark:text-slate-500">/ {c.total_quantity}</span></p>
                        <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden mx-auto">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              c.available_quantity === 0 ? 'bg-rose-500' : 
                              c.available_quantity <= c.total_quantity * 0.2 ? 'bg-amber-500' : 'bg-indigo-500'
                            }`} 
                            style={{ width: `${(c.available_quantity / (c.total_quantity || 1)) * 100}%` }}
                          />
                        </div>

                        {/* Enhanced Stock Breakdown Tooltip */}
                        {hoveredComp === c.id && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white dark:bg-slate-900 rounded-[24px] shadow-2xl border border-slate-100 dark:border-slate-800 p-5 z-[70] animate-in zoom-in-95 fade-in duration-200">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-50 dark:border-slate-800 pb-3">
                              <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">
                                {isMaster ? 'Hub Stock Detail' : 'Issued To Students'}
                              </p>
                              <Info size={12} className="text-indigo-500 dark:text-indigo-400" />
                            </div>
                            
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Available</span>
                                </div>
                                <span className="text-xs font-black text-slate-900 dark:text-white">{c.available_quantity}</span>
                              </div>

                              {(() => {
                                const compTxs = transactions.filter(t => t.component_id === c.id);
                                
                                // Calculate Current Holders
                                const holders: Record<string, { name: string; qty: number }> = {};
                                compTxs.forEach(t => {
                                  // Use student_uuid as primary key, fallback to student_id (roll number)
                                  const studentKey = t.student_uuid || t.student_id;
                                  if (!studentKey) return;
                                  
                                  if (!holders[studentKey]) {
                                    holders[studentKey] = { name: t.student_name || 'Unknown Student', qty: 0 };
                                  }
                                  
                                  const qty = Number(t.quantity) || 0;
                                  if (t.transaction_type === 'issue') {
                                    holders[studentKey].qty += qty;
                                  } else if (t.transaction_type === 'return' || t.transaction_type === 'damaged') {
                                    holders[studentKey].qty -= qty;
                                  }
                                });
                                
                                // Only show students who still have at least one unit
                                const activeHolders = Object.values(holders).filter(h => h.qty > 0);
                                const issuedCount = activeHolders.reduce((acc, h) => acc + h.qty, 0);
                                
                                // Calculate Damaged
                                const damagedCount = compTxs
                                  .filter(t => t.transaction_type === 'damaged')
                                  .reduce((acc, t) => acc + (Number(t.quantity) || 0), 0);
                                const hub = getHubInfo(c.center_id);

                                return (
                                  <>
                                    {isMaster && (
                                      <div className="mb-3 space-y-2">
                                        <div className="flex items-start gap-2 text-[10px]">
                                          <MapPin size={12} className="text-indigo-500 mt-0.5 shrink-0" />
                                          <div>
                                            <p className="font-black text-slate-900 dark:text-white uppercase">{hub.name}</p>
                                            <p className="font-bold text-slate-500">{hub.location}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Issued</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900 dark:text-white">{issuedCount}</span>
                                      </div>
                                      {!isMaster && activeHolders.length > 0 && (
                                        <div className="pl-4 space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                          {activeHolders.map((h, i) => (
                                            <div key={i} className="flex items-center justify-between text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 px-2 py-1.5 rounded-lg">
                                              <span className="truncate max-w-[140px] flex items-center gap-1">
                                                <Users size={10} /> {h.name}
                                              </span>
                                              <span>{h.qty} unit{h.qty !== 1 ? 's' : ''}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {!isMaster && activeHolders.length === 0 && (
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">No units currently issued</p>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-800 pt-3">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Damaged/Lost</span>
                                      </div>
                                      <span className="text-xs font-black text-slate-900 dark:text-white">{damagedCount}</span>
                                    </div>

                                    {c.available_quantity <= c.total_quantity * 0.2 && c.available_quantity > 0 && (
                                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl flex items-center gap-2">
                                        <AlertCircle size={10} className="text-amber-600 dark:text-amber-400" />
                                        <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">Low Stock Warning</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-slate-900 border-r border-b border-slate-100 dark:border-slate-800 rotate-45" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      {(() => {
                        const displayStatus = getAssetDisplayStatus(c, transactions);
                        return (
                          <span className={`inline-flex px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border ${displayStatusColors[displayStatus]}`}>
                            {displayStatusLabels[displayStatus]}
                          </span>
                        );
                      })()}
                    </td>
                    {isMaster && (
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-slate-300 dark:text-slate-600" />
                          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {getHubInfo(c.center_id).name}
                            <span className="block text-[8px] font-bold text-slate-400 normal-case">{getHubInfo(c.center_id).location}</span>
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                        {isInventoryManager && (isLowStockAsset(c) || isOutOfStockAsset(c)) && (
                          <button
                            onClick={() => handleRequestReplenishment(c)}
                            disabled={requestingReplenishment === c.id}
                            className="px-4 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
                          >
                            {requestingReplenishment === c.id ? <Loader2 size={16} className="animate-spin" /> : 'Request Replenishment'}
                          </button>
                        )}
                        <button
                          onClick={() => showQR(c)}
                          className="p-3 bg-white dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:border-indigo-100 transition-all"
                          title="View QR Code"
                        >
                          <QrCode size={18} />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-3 bg-white dark:bg-slate-800 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:border-amber-100 transition-all"
                          title="Edit Asset"
                        >
                          <Edit size={18} />
                        </button>
                        {isMaster && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-3 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:border-rose-100 transition-all"
                            title="Decommission Asset"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-4 bg-slate-50/30 dark:bg-slate-800/30 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center">
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {filtered.length} items discovered in registry
          </p>
          <div className="flex gap-2">
            <button className="p-2 text-slate-300 dark:text-slate-700 hover:text-indigo-600 transition-colors disabled:opacity-30" disabled><ChevronLeft size={16} /></button>
            <button className="p-2 text-slate-300 dark:text-slate-700 hover:text-indigo-600 transition-colors disabled:opacity-30" disabled><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Premium Modal for Add/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-2xl shadow-2xl relative animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 overflow-hidden border border-white/10">
            <div className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{editItem ? 'Configure Asset' : 'Register New Asset'}</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Registry Entry #00{components.length + 1}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X size={24} className="text-slate-400 dark:text-slate-500" />
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              {saveError && (
                <div className="flex items-center gap-4 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-[24px] text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-widest">
                  <AlertTriangle size={20} />
                  <span>{saveError}</span>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Asset Name</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 focus:ring-4 focus:ring-indigo-500/5 text-sm font-bold transition-all text-slate-900 dark:text-white"
                    placeholder="e.g. ARDUINO UNO R3"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Classification</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer text-slate-900 dark:text-white"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {isMaster && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Assigned Center *</label>
                    <select
                      value={form.center_id}
                      onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer text-slate-900 dark:text-white"
                    >
                      <option value="">Select Hub (Location)</option>
                      {centers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.location})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={form.total_quantity}
                    onChange={e => setForm(f => ({ ...f, total_quantity: parseInt(e.target.value) || 0 }))}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-sm font-black transition-all text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Unit Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={e => setForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-sm font-black transition-all text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Max Utilization Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_usage_limit}
                    onChange={e => setForm(f => ({ ...f, max_usage_limit: parseInt(e.target.value) || 1 }))}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-sm font-black transition-all text-slate-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Technical Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500/20 text-sm font-medium transition-all resize-none text-slate-900 dark:text-white"
                    placeholder="Enter asset specifications..."
                  />
                </div>
              </div>
            </div>

            <div className="px-10 py-8 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-4 bg-slate-50/30 dark:bg-slate-800/30">
              <button 
                onClick={() => setShowModal(false)} 
                className="px-8 py-3 text-[10px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                className="metamask-button flex items-center gap-3 px-10 py-4 bg-indigo-600 text-white rounded-[20px] text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : (editItem ? <Edit size={16} /> : <Plus size={16} />)}
                {editItem ? 'Update Asset' : 'Register Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MetaMask Style QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setQrModal(null)} />
          <div className="bg-white dark:bg-slate-900 rounded-[48px] w-full max-w-sm shadow-2xl relative animate-in zoom-in-95 duration-500 p-10 text-center overflow-hidden border border-white/10">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500" />
            
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-[32px] flex items-center justify-center mx-auto mb-6">
              <QrCode size={40} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-1">{qrModal.component.name}</h3>
            <p className="text-[10px] font-black text-indigo-500/70 dark:text-indigo-400/70 uppercase tracking-widest mb-8">{qrModal.component.sku || 'PENDING SKU'}</p>
            
            <div className="relative group p-4 bg-slate-50 dark:bg-slate-800 rounded-[32px] border border-slate-100 dark:border-slate-700">
              <img src={qrModal.dataUrl} alt="QR Code" className="mx-auto w-48 h-48 mix-blend-multiply dark:mix-blend-normal dark:invert" />
              <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[32px]">
                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Registry ID: {qrModal.component.id.slice(0, 8)}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3 mt-10">
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = qrModal.dataUrl;
                  a.download = `${qrModal.component.name.replace(/\s+/g, '_')}_QR.png`;
                  a.click();
                }}
                className="metamask-button w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all"
              >
                Export Asset QR
              </button>
              <button 
                onClick={() => setQrModal(null)} 
                className="w-full py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
