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
  role text NOT NULL DEFAULT 'center_admin' CHECK (role IN ('master_admin', 'center_admin', 'inventory manager', 'system administrator', 'student')),
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

-- Create hub_transfer_requests table
CREATE TABLE IF NOT EXISTS hub_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  destination_center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by uuid NOT NULL REFERENCES app_users(id),
  approved_by uuid REFERENCES app_users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
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
