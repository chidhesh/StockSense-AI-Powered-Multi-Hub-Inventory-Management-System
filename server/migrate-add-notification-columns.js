const pg = require('pg');

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function migrate() {
  console.log('Starting migration: Add reference_id and redirect_url to notifications table...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS reference_id text,
      ADD COLUMN IF NOT EXISTS redirect_url text
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
