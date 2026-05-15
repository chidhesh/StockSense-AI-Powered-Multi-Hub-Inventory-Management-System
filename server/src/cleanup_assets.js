import pool from './config/db.js';

async function removeAssetFallbackTransactions() {
  console.log('Cleaning up transactions with missing components...');
  
  try {
    // Delete transactions where the component_id does not exist in the components table
    const { rowCount } = await pool.query(`
      DELETE FROM inventory_transactions 
      WHERE component_id NOT IN (SELECT id FROM components)
    `);
    
    console.log(`Successfully removed ${rowCount} invalid transactions.`);
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

removeAssetFallbackTransactions();