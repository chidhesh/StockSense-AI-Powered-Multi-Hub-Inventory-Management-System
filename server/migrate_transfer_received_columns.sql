-- Add received_date and received_by to transfer_requests table
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS received_date timestamptz;
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
