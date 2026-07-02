-- Smart Inventory System Schema
-- For use with Node.js backend (not Supabase RLS)

-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create centers table
CREATE TABLE IF NOT EXISTS centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  admin_name text,
  contact_email text,
  contact_phone text,
  capacity integer DEFAULT 0,
  type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'center_admin' CHECK (role IN ('main_admin', 'system_admin', 'center_admin', 'student')),
  center_id uuid REFERENCES centers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  roll_number text NOT NULL UNIQUE,
  branch text,
  phone text,
  email text,
  password_hash text,
  is_registered boolean DEFAULT false,
  address text,
  qr_code text,
  center_id uuid REFERENCES centers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name text NOT NULL,
  vendor_name text NOT NULL,
  price numeric(10,2) NOT NULL,
  rating numeric(2,1) CHECK (rating >= 0 AND rating <= 5),
  stock integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create components table
CREATE TABLE IF NOT EXISTS components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text DEFAULT '',
  sku text,
  qr_code text,
  total_quantity integer NOT NULL DEFAULT 0,
  available_quantity integer NOT NULL DEFAULT 0,
  max_usage_limit integer NOT NULL DEFAULT 10,
  usage_count integer DEFAULT 0,
  unit_cost numeric(10,2) DEFAULT 0,
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'low_stock', 'expired', 'defective', 'out_of_stock')),
  min_stock_threshold integer DEFAULT 5,
  course_id text,
  course_name text,
  skill_tags text,
  is_shared_component boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (name, center_id)
);

-- Function to update availability based on transactions
CREATE OR REPLACE FUNCTION update_component_availability()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.transaction_type = 'issue' OR NEW.transaction_type = 'damaged') THEN
            UPDATE components 
            SET available_quantity = available_quantity - NEW.quantity,
                updated_at = NOW()
            WHERE id = NEW.component_id;
        ELSIF (NEW.transaction_type = 'return') THEN
            UPDATE components 
            SET available_quantity = available_quantity + NEW.quantity,
                updated_at = NOW()
            WHERE id = NEW.component_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.transaction_type = 'issue' OR OLD.transaction_type = 'damaged') THEN
            UPDATE components 
            SET available_quantity = available_quantity + OLD.quantity,
                updated_at = NOW()
            WHERE id = OLD.component_id;
        ELSIF (OLD.transaction_type = 'return') THEN
            UPDATE components 
            SET available_quantity = available_quantity - OLD.quantity,
                updated_at = NOW()
            WHERE id = OLD.component_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep stock in sync automatically
DROP TRIGGER IF EXISTS trg_update_stock ON inventory_transactions;
CREATE TRIGGER trg_update_stock
AFTER INSERT OR DELETE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION update_component_availability();

-- Function to recalculate component availability based on transactions when total_quantity changes
CREATE OR REPLACE FUNCTION recalculate_component_availability()
RETURNS TRIGGER AS $$
DECLARE
    v_issued integer;
    v_returned integer;
    v_damaged integer;
    v_net_issued integer;
BEGIN
    -- Only recalculate if total_quantity changed
    IF (OLD.total_quantity IS DISTINCT FROM NEW.total_quantity) THEN
        -- Get transaction totals
        SELECT 
            COALESCE(SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'damaged' THEN quantity ELSE 0 END), 0)
        INTO v_issued, v_returned, v_damaged
        FROM inventory_transactions
        WHERE component_id = NEW.id;
        
        -- Calculate net issued
        v_net_issued := GREATEST(0, v_issued - v_returned);
        
        -- Update available_quantity
        NEW.available_quantity := GREATEST(0, NEW.total_quantity - v_net_issued - v_damaged);
        
        -- Auto-update status based on availability
        IF NEW.available_quantity = 0 THEN
            NEW.status := 'out_of_stock';
        ELSIF NEW.available_quantity <= GREATEST(2, CEIL(NEW.total_quantity * 0.2)) THEN
            NEW.status := 'low_stock';
        ELSE
            NEW.status := 'active';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_recalculate_availability ON components;

-- Create the trigger to recalculate availability when total_quantity changes
CREATE TRIGGER trg_recalculate_availability
BEFORE UPDATE ON components
FOR EACH ROW EXECUTE FUNCTION recalculate_component_availability();

-- Create inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('issue', 'return', 'purchase', 'transfer', 'damaged')),
  quantity integer NOT NULL DEFAULT 1,
  student_uuid uuid REFERENCES students(id) ON DELETE SET NULL,
  student_name text,
  student_id text,
  usage_count integer DEFAULT 0,
  notes text DEFAULT '',
  performed_by uuid REFERENCES app_users(id),
  session_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact text,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 18,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  center_id uuid REFERENCES centers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  invoice_date date DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text UNIQUE NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact text,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 18,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  center_id uuid REFERENCES centers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  quote_date date DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact text,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 18,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  center_id uuid REFERENCES centers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  order_date date DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('session', 'monthly', 'annual', 'custom')),
  title text NOT NULL,
  center_id uuid REFERENCES centers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  generated_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now()
);

-- Add min_stock_threshold to components table
ALTER TABLE components ADD COLUMN IF NOT EXISTS min_stock_threshold integer DEFAULT 5;

-- Create forecasts table
CREATE TABLE IF NOT EXISTS forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  forecast_quantity integer NOT NULL,
  confidence_score numeric(5,4) NOT NULL,
  forecast_date date NOT NULL,
  historical_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create replenishment_requests table
CREATE TABLE IF NOT EXISTS replenishment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  center_name text,
  current_quantity integer NOT NULL,
  min_stock_threshold integer,
  required_quantity integer NOT NULL,
  reason text,
  requested_by uuid REFERENCES app_users(id),
  ai_forecast_quantity integer,
  ai_forecast_confidence numeric(5,4),
  ai_decision_type text CHECK (ai_decision_type IN ('TRANSFER', 'PURCHASE')),
  ai_decision_confidence numeric(5,4),
  ai_reason text,
  ai_transfer_allocation jsonb,
  ai_purchase_vendor text,
  ai_purchase_estimated_cost numeric(12,2),
  ai_debug_info jsonb,
  status text NOT NULL DEFAULT 'PENDING_AI_REVIEW' CHECK (status IN ('PENDING_AI_REVIEW', 'AI_REVIEW_COMPLETE', 'TRANSFER_REQUESTS_GENERATED', 'PURCHASE_REQUEST_GENERATED', 'COMPLETED', 'REJECTED')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transfer_requests table
CREATE TABLE IF NOT EXISTS transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  source_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  destination_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  inventory_manager_id uuid REFERENCES app_users(id),
  system_admin_id uuid REFERENCES app_users(id),
  ai_decision_type text,
  ai_decision_confidence numeric(5,4),
  ai_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_transit', 'delivered', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transfer_allocations table
CREATE TABLE IF NOT EXISTS transfer_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_request_id uuid NOT NULL REFERENCES transfer_requests(id) ON DELETE CASCADE,
  source_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  destination_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  transfer_quantity integer NOT NULL CHECK (transfer_quantity > 0),
  allocation_plan jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create transfer_tracking table
CREATE TABLE IF NOT EXISTS transfer_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_request_id uuid NOT NULL REFERENCES transfer_requests(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  source_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  destination_hub_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  dispatch_date timestamptz,
  expected_delivery_date timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'in_transit', 'delivered', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create purchase_requests table
CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  component_name text NOT NULL,
  required_quantity integer NOT NULL CHECK (required_quantity > 0),
  estimated_cost numeric(12,2),
  vendor text,
  destination_hub_id uuid REFERENCES centers(id),
  reason text,
  remarks text,
  expected_delivery_date date,
  forecast_details jsonb,
  ai_decision_type text,
  ai_decision_confidence numeric(5,4),
  ai_reason text,
  status text NOT NULL DEFAULT 'PENDING_ADMIN_APPROVAL' CHECK (status IN ('PENDING_ADMIN_APPROVAL', 'APPROVED_BY_ADMIN', 'REJECTED', 'ORDERED', 'DELIVERED', 'RECEIVED', 'COMPLETED')),
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('low_stock', 'transfer_recommendation', 'transfer_approval', 'transfer_dispatch', 'transfer_delivery', 'purchase_approval', 'purchase_ordered', 'purchase_delivered', 'inventory_update', 'replenishment_request', 'system')),
  is_read boolean DEFAULT false,
  reference_id text,
  reference_type text CHECK (reference_type IN ('replenishment', 'purchase', 'transfer', 'component')),
  redirect_url text,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create qr_codes table
CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid REFERENCES components(id) ON DELETE CASCADE,
  batch_id text,
  transfer_id uuid REFERENCES transfer_requests(id) ON DELETE SET NULL,
  location text,
  qr_code_data text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  component_id uuid REFERENCES components(id),
  hub_id uuid REFERENCES centers(id),
  before_quantity integer,
  transferred_quantity integer,
  after_quantity integer,
  user_id uuid REFERENCES app_users(id),
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Add more indexes
CREATE INDEX IF NOT EXISTS idx_forecasts_component_id ON forecasts(component_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_center_id ON forecasts(center_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_source ON transfer_requests(source_hub_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_destination ON transfer_requests(destination_hub_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_allocations_transfer ON transfer_allocations(transfer_request_id);
CREATE INDEX IF NOT EXISTS idx_transfer_tracking_transfer ON transfer_tracking(transfer_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_destination ON purchase_requests(destination_hub_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_qr_codes_component ON qr_codes(component_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_component ON audit_logs(component_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_center_id ON profiles(center_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_components_center_id ON components(center_id);
CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);
CREATE INDEX IF NOT EXISTS idx_students_center_id ON students(center_id);
CREATE INDEX IF NOT EXISTS idx_transactions_center_id ON inventory_transactions(center_id);
CREATE INDEX IF NOT EXISTS idx_transactions_component_id ON inventory_transactions(component_id);
CREATE INDEX IF NOT EXISTS idx_transactions_student_uuid ON inventory_transactions(student_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_session_date ON inventory_transactions(session_date);
CREATE INDEX IF NOT EXISTS idx_invoices_center_id ON invoices(center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_quotations_center_id ON quotations(center_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_orders_center_id ON orders(center_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_reports_center_id ON reports(center_id);
