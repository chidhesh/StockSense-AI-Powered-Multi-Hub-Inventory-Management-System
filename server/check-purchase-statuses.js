
import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT status, COUNT(*) as count 
      FROM purchase_requests 
      GROUP BY status;
    `);
    console.log('Current status distribution:');
    console.log(result.rows);
  } catch (error) {
    console.error('Error checking statuses:', error);
  } finally {
    await pool.end();
  }
}

main();
