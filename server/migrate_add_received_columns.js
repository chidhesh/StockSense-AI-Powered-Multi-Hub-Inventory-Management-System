import pool from './src/config/db.js';

async function runMigration() {
  try {
    console.log('🔧 Running migration: Add received_date and received_by columns');
    
    await pool.query(`
      ALTER TABLE transfer_requests 
      ADD COLUMN IF NOT EXISTS received_date timestamptz;
    `);
    console.log('✅ Added received_date column');

    await pool.query(`
      ALTER TABLE transfer_requests 
      ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added received_by column');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
