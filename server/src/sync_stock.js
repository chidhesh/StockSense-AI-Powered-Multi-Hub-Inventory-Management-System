import pool from './config/db.js';

async function syncInventoryStock() {
  console.log('Starting full inventory stock synchronization...');
  
  try {
    // Start a transaction
    await pool.query('BEGIN');

    // 1. Reset all available_quantity to total_quantity initially
    await pool.query('UPDATE components SET available_quantity = total_quantity');
    console.log('Reset all components to their maximum total quantity.');

    // 2. Fetch all relevant transactions that affect availability
    // Issues decrease availability, Returns increase it back, Damaged decreases it
    const { rows: transactions } = await pool.query(`
      SELECT component_id, transaction_type, SUM(quantity) as total_qty
      FROM inventory_transactions
      GROUP BY component_id, transaction_type
    `);

    console.log(`Processing ${transactions.length} transaction groups...`);

    for (const tx of transactions) {
      if (tx.transaction_type === 'issue' || tx.transaction_type === 'damaged') {
        // Decrease availability
        await pool.query(`
          UPDATE components 
          SET available_quantity = available_quantity - $1 
          WHERE id = $2
        `, [tx.total_qty, tx.component_id]);
      } else if (tx.transaction_type === 'return') {
        // Returns are already handled by the fact that we reset to total_quantity?
        // Wait, the logic should be: Available = Total - (Issued - Returned) - Damaged
        // Actually, let's use a more precise formula:
        // Current Available = Total - (Net Issued) - Damaged
        // Where Net Issued = Total Issued - Total Returned
      }
    }

    // Refined approach: Calculate net impact for each component
    const { rows: netImpacts } = await pool.query(`
      SELECT 
        component_id,
        SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END) as issued,
        SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END) as returned,
        SUM(CASE WHEN transaction_type = 'damaged' THEN quantity ELSE 0 END) as damaged
      FROM inventory_transactions
      GROUP BY component_id
    `);

    for (const impact of netImpacts) {
      const netIssued = Math.max(0, parseInt(impact.issued) - parseInt(impact.returned));
      const totalReduction = netIssued + parseInt(impact.damaged);

      await pool.query(`
        UPDATE components 
        SET available_quantity = total_quantity - $1 
        WHERE id = $2
      `, [totalReduction, impact.component_id]);
    }

    // Ensure no negative availability due to data entry errors
    await pool.query('UPDATE components SET available_quantity = 0 WHERE available_quantity < 0');

    // 3. Apply the new Database Trigger schema changes to the live database
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Extract only the trigger and function parts to avoid recreating tables
    const triggerParts = schemaSql.split('-- Function to update availability based on transactions')[1];
    if (triggerParts) {
      await pool.query('-- Function to update availability based on transactions' + triggerParts);
      console.log('Real-time stock synchronization triggers installed.');
    }

    await pool.query('COMMIT');
    console.log('Stock synchronization complete for all hubs.');
    
    // Verify Servo Motor in Mangalore specifically if possible
    const { rows: servo } = await pool.query(`
      SELECT c.name, c.available_quantity, c.total_quantity, h.name as hub_name
      FROM components c
      JOIN centers h ON c.center_id = h.id
      WHERE c.name ILIKE '%Servo Motor%'
    `);
    
    if (servo.length > 0) {
      console.log('Verification Results:');
      servo.forEach(s => {
        console.log(`- ${s.name} at ${s.hub_name}: ${s.available_quantity}/${s.total_quantity}`);
      });
    }

    process.exit(0);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Synchronization failed:', error);
    process.exit(1);
  }
}

syncInventoryStock();