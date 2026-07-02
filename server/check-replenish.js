
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres123@localhost:5433/inventory_db',
  ssl: false
});

async function main() {
  try {
    const res = await pool.query("SELECT id, request_id, ai_transfer_allocation FROM replenishment_requests WHERE id = 'b0ad8cf0-fea7-4271-9b11-807d542011d5'");
    console.log('Replenishment Request:', res.rows[0]);
    console.log('ai_transfer_allocation type:', typeof res.rows[0].ai_transfer_allocation);
    console.log('ai_transfer_allocation value:', JSON.stringify(res.rows[0].ai_transfer_allocation));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
