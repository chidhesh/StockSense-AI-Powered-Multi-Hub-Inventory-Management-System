const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Adding reference_type column to notifications...');
    await client.query(`
      ALTER TABLE notifications 
      ADD COLUMN IF NOT EXISTS reference_type text 
      CHECK (reference_type IN ('replenishment', 'purchase', 'transfer', 'component'))
    `);

    console.log('Adding updated_at column to notifications...');
    await client.query(`
      ALTER TABLE notifications 
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()
    `);

    console.log('Updating type check constraint to include new types...');
    await client.query(`
      ALTER TABLE notifications 
      DROP CONSTRAINT IF EXISTS notifications_type_check
    `);
    await client.query(`
      ALTER TABLE notifications 
      ADD CONSTRAINT notifications_type_check 
      CHECK (type IN ('low_stock', 'transfer_recommendation', 'transfer_approval', 'transfer_dispatch', 'transfer_delivery', 'purchase_approval', 'purchase_ordered', 'purchase_delivered', 'inventory_update', 'replenishment_request', 'system'))
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
  }
}

migrate().then(() => process.exit(0));
