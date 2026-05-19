export type UserRole = 'master_admin' | 'center_admin' | 'student' | 'System Administrator' | 'Inventory Manager' | 'Student' | string;

export interface Center {
  id: string;
  name: string;
  location: string;
  admin_name?: string;
  contact_email?: string;
  contact_phone?: string;
  capacity?: number;
  type?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  center_id?: string;
  created_at: string;
  updated_at: string;
  center?: Center;
}

export type ComponentStatus = 'active' | 'low_stock' | 'expired' | 'defective' | 'out_of_stock';

export interface Component {
  id: string;
  name: string;
  category: string;
  description: string;
  sku?: string;
  qr_code?: string;
  total_quantity: number;
  available_quantity: number;
  max_usage_limit: number;
  unit_cost: number;
  center_id: string;
  status: ComponentStatus;
  // Course/Skill tagging for training institutes
  course_id?: string;
  course_name?: string;
  skill_tags?: string[];
  is_shared_component?: boolean;
  created_at: string;
  updated_at: string;
  center?: Center;
}

// Course/Skill Management Types
export interface Course {
  id: string;
  name: string;
  description?: string;
  center_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  description?: string;
  created_at: string;
}

// Student Learning Analytics
export interface StudentUsageStats {
  student_id: string;
  student_name: string;
  total_components_used: number;
  unique_components: number;
  categories_used: string[];
  skills_gained: string[];
  usage_history: { component_name: string; count: number }[];
}

// Component Popularity
export interface ComponentPopularity {
  component_id: string;
  component_name: string;
  category: string;
  total_issues: number;
  unique_students: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  phone?: string;
  email?: string;
  address?: string;
  qr_code?: string;
  center_id: string;
  created_at: string;
  updated_at: string;
  center?: Center;
}

export type TransactionType = 'issue' | 'return' | 'purchase' | 'transfer' | 'damaged';

export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface HubTransferRequest {
  id: string;
  source_center_id: string;
  destination_center_id: string;
  component_id: string;
  quantity: number;
  status: TransferStatus;
  requested_by: string;
  approved_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  component_name?: string;
  source_center_name?: string;
  destination_center_name?: string;
}

export interface InventoryTransaction {
  id: string;
  component_id: string;
  center_id: string;
  transaction_type: TransactionType;
  quantity: number;
  student_uuid?: string;
  student_name?: string;
  student_id?: string;
  usage_count: number;
  notes?: string;
  performed_by?: string;
  session_date: string;
  created_at: string;
  component?: Component;
  center?: Center;
  component_name?: string;
  component_sku?: string;
}

export interface InvoiceItem {
  component_name: string;
  category: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export type InvoiceStatus = 'pending' | 'paid' | 'cancelled';

export interface Invoice {
  id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_contact?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  center_id?: string;
  status: InvoiceStatus;
  invoice_date: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  center?: Center;
}

export type ReportType = 'session' | 'monthly' | 'annual' | 'custom';

export interface ReportData {
  total_issued: number;
  total_returned: number;
  total_damaged: number;
  components: {
    id: string;
    name: string;
    issued: number;
    returned: number;
    damaged: number;
  }[];
  wastage_percentage: number;
  students?: {
    id: string;
    name: string;
    issued: number;
    returned: number;
  }[];
}

export interface Report {
  id: string;
  report_type: ReportType;
  title: string;
  center_id?: string;
  period_start: string;
  period_end: string;
  data: ReportData;
  generated_by?: string;
  created_at: string;
  center?: Center;
}

export interface ForecastPoint {
  date: string;
  actual?: number;
  predicted: number;
  confidence?: number;
}

export interface ComponentForecast {
  component_id: string;
  component_name: string;
  forecast: ForecastPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  next_30_days: number;
  confidence?: number;
  anomaly_detected?: boolean;
}

export interface ForecastingParameters {
  forecastDays: number;
  lowStockThreshold: number;
  highStockThreshold: number;
  urgencyThreshold: number; // days until stockout
  historicalDays: number;
}

// ML/AI Types
export interface MLForecastResult {
  predictions: number[];
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  anomalyScore: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  type: 'spike' | 'drop' | 'unusual_pattern' | 'none';
  description: string;
}

export interface ProcurementSuggestion {
  componentId: string;
  componentName: string;
  currentStock: number;
  predictedDemand: number;
  suggestedOrder: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  daysUntilStockout: number;
}

export interface AIInsight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'alert';
  title: string;
  description: string;
  action?: string;
  priority: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  vendor_name: string;
  vendor_contact: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'approved' | 'rejected';
  valid_until: string;
  center_id: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProcurementOrder {
  id: string;
  order_number: string;
  quotation_id: string;
  vendor_name: string;
  vendor_contact: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  center_id: string;
  status: 'ordered' | 'received' | 'cancelled';
  order_date: string;
  expected_delivery?: string;
  invoice_id?: string;
  created_at: string;
  updated_at: string;
}

export const VENDORS = [
  {
    id: 'v1',
    name: 'TechMart Electronics',
    contact: 'sales@techmart.com',
    phone: '+91 98765 43210',
    website: 'www.techmart.com',
    specialty: 'Microcontrollers & Sensors'
  },
  {
    id: 'v2',
    name: 'Circuit Solutions',
    contact: 'info@circuitsolutions.in',
    phone: '+91 98765 11223',
    website: 'www.circuitsolutions.in',
    specialty: 'Robotics & Power'
  },
  {
    id: 'v3',
    name: 'Global Components Ltd',
    contact: 'bulk@globalcomp.com',
    phone: '+91 98765 55667',
    website: 'www.globalcomp.com',
    specialty: 'Bulk Electronics'
  },
  {
    id: 'v4',
    name: 'Precision Instruments',
    contact: 'support@precisioninst.com',
    phone: '+91 98765 99887',
    website: 'www.precisioninst.com',
    specialty: 'Test Equipment'
  }
];

export interface DashboardStats {
  total_components: number;
  total_quantity: number;
  available_quantity: number;
  low_stock_count: number;
  expired_count: number;
  total_transactions_today: number;
  total_issued_today: number;
  total_returned_today: number;
}
