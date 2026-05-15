import pool from './config/db.js';

async function fixDataErrors() {
  console.log('Starting data error correction...');
  
  try {
    // 1. Remove transactions that point to non-existent components (Asset # fallback issue)
    const { rowCount: orphanedTxs } = await pool.query(`
      DELETE FROM inventory_transactions 
      WHERE component_id NOT IN (SELECT id FROM components)
    `);
    console.log(`Removed ${orphanedTxs} orphaned transactions with missing assets.`);

    // 2. Remove transactions where the student belongs to a different hub (Prashanth Rao issue)
    const { rowCount: mismatchedHubs } = await pool.query(`
      DELETE FROM inventory_transactions it
      USING students s
      WHERE it.student_uuid = s.id
      AND it.center_id != s.center_id
    `);
    console.log(`Removed ${mismatchedHubs} transactions where student hub did not match transaction hub.`);

    // 3. Remove transactions where the component belongs to a different hub (Asset # fallback issue)
    const { rowCount: mismatchedAssets } = await pool.query(`
      DELETE FROM inventory_transactions it
      USING components c
      WHERE it.component_id = c.id
      AND it.center_id != c.center_id
    `);
    console.log(`Removed ${mismatchedAssets} transactions where component hub did not match transaction hub.`);

    console.log('Data error correction complete.');
    process.exit(0);
  } catch (error) {
    console.error('Correction failed:', error);
    process.exit(1);
  }
}

fixDataErrors();