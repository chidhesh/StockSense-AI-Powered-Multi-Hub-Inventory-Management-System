
import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Updating purchase requests status constraint...');
    await pool.query(`
      ALTER TABLE purchase_requests 
      DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
    `);
    await pool.query(`
      ALTER TABLE purchase_requests 
      ADD CONSTRAINT purchase_requests_status_check 
      CHECK (status IN ('PENDING_ADMIN_APPROVAL', 'APPROVED_BY_ADMIN', 'REJECTED', 'ORDERED', 'DELIVERED', 'COMPLETED'));
    `);
    
    console.log('Successfully updated database schema!');
  } catch (error) {
    console.error('Error updating schema:', error);
  } finally {
    await pool.end();
  }
}

main();
