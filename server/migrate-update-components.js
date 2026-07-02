const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Adding course_id column to components (if missing)...');
    await client.query(`ALTER TABLE components ADD COLUMN IF NOT EXISTS course_id text;`);

    console.log('Adding course_name column to components (if missing)...');
    await client.query(`ALTER TABLE components ADD COLUMN IF NOT EXISTS course_name text;`);

    console.log('Adding skill_tags column to components (if missing)...');
    await client.query(`ALTER TABLE components ADD COLUMN IF NOT EXISTS skill_tags text;`);

    console.log('Adding is_shared_component column to components (if missing)...');
    await client.query(`ALTER TABLE components ADD COLUMN IF NOT EXISTS is_shared_component boolean DEFAULT false;`);

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
