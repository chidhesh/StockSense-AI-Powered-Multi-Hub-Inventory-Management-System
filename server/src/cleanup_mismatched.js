import pool from './config/db.js';

async function removeMismatchedTransactions() {
  console.log('Cleaning up mismatched hub transactions...');
  
  try {
    // Delete transactions where the component's hub doesn't match the transaction's hub
    const { rowCount } = await pool.query(`
      DELETE FROM inventory_transactions it
      USING components c
      WHERE it.component_id = c.id
      AND it.center_id != c.center_id
    `);
    
    console.log(`Successfully removed ${rowCount} mismatched transactions.`);
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

removeMismatchedTransactions();