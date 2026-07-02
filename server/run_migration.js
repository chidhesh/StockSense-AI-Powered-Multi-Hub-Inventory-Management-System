
import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres123@localhost:5433/inventory_db',
  ssl: false
});

async function runMigration() {
  try {
    const sql = fs.readFileSync('./migrate_add_transfer_columns.sql', 'utf8');
    console.log('Running migration...');
    await pool.query(sql);
    console.log('Migration completed successfully!');
    await pool.end();
  } catch (err) {
    console.error('Error running migration:', err);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
