
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS shipment_date timestamptz;
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS shipped_by uuid REFERENCES app_users(id);
