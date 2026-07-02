import pool from './src/config/db.js';

async function checkAuditLogs() {
  try {
    console.log('🔍 Checking audit_logs table...');
    
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'audit_logs'
      )
    `);
    
    if (result.rows[0].exists ? console.log('✅ audit_logs table exists') : console.log('❌ audit_logs table does NOT exist'));
    
    if (result.rows[0].exists) {
      const columns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'audit_logs'
        ORDER BY ordinal_position
      `);
      
      console.log('\nColumns in audit_logs:');
      columns.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));
    }
  } catch (error) {
    console.error('❌ Error checking audit_logs:', error);
  } finally {
    await pool.end();
  }
}

checkAuditLogs();
