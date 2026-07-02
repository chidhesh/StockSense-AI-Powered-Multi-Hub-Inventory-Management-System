
import pool from './src/config/db.js';

const runMigration = async () => {
  try {
    console.log('🔄 Starting transfer workflow migration...');

    // Step 1: Add missing columns to transfer_requests
    const addColumns = [
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS shipment_date TIMESTAMPTZ`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS shipped_by TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS replenishment_request_id TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS source_manager_name TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS source_manager_phone TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS destination_manager_name TEXT`,
      `ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS destination_manager_phone TEXT`
    ];

    for (const sql of addColumns) {
      await pool.query(sql);
      console.log('✅ Added column');
    }

    // Step 2: Create transfer_timeline table for complete audit trail
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_timeline (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_request_id UUID REFERENCES transfer_requests(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        changed_by_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
        changed_by_name TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created transfer_timeline table');

    // Step 3: Create an index on transfer_request_id
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timeline_transfer_id ON transfer_timeline(transfer_request_id)
    `);

    console.log('🎉 Migration complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
