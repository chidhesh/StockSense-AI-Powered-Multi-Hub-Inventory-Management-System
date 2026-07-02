
import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Checking transactions per hub...\n');
    
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.location,
        COUNT(t.id) as transaction_count
      FROM centers c
      LEFT JOIN inventory_transactions t ON c.id = t.center_id
      GROUP BY c.id, c.name, c.location
      ORDER BY transaction_count DESC
    `);
    
    console.log('Hub Transaction Summary:');
    console.log('------------------------');
    result.rows.forEach((hub, index) => {
      console.log(`${index + 1}. ${hub.name} (${hub.location}) - ${hub.transaction_count} transactions`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
