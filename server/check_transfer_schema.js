import pool from './src/config/db.js';

async function checkSchema() {
  try {
    console.log('🔍 Checking transfer_requests table schema...');
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'transfer_requests'
      ORDER BY ordinal_position
    `);

    console.log('Columns in transfer_requests:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Schema check complete');
  } catch (error) {
    console.error('❌ Error checking schema:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();
