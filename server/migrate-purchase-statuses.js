
import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Migrating existing purchase requests...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // First, drop the old constraint to allow updates
      await client.query(`
        ALTER TABLE purchase_requests 
        DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
      `);
      
      // Now update existing statuses to new flow:
      // APPROVED → APPROVED_BY_ADMIN
      // PURCHASED → ORDERED
      // RECEIVED → DELIVERED
      // Also, if there are statuses not in our list, just leave them or set to REJECTED?
      await client.query(`
        UPDATE purchase_requests 
        SET status = CASE 
          WHEN LOWER(status) = 'pending' THEN 'PENDING_ADMIN_APPROVAL'
          WHEN status = 'APPROVED' THEN 'APPROVED_BY_ADMIN' 
          WHEN status = 'PURCHASED' THEN 'ORDERED' 
          WHEN status = 'RECEIVED' THEN 'DELIVERED' 
          WHEN status = 'inventory_updated' THEN 'COMPLETED'
          ELSE status 
        END;
      `);
      
      // Now add new constraint
      await client.query(`
        ALTER TABLE purchase_requests 
        ADD CONSTRAINT purchase_requests_status_check 
        CHECK (status IN ('PENDING_ADMIN_APPROVAL', 'APPROVED_BY_ADMIN', 'REJECTED', 'ORDERED', 'DELIVERED', 'COMPLETED'));
      `);
      
      await client.query('COMMIT');
      console.log('Successfully migrated purchase request statuses!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

main();
