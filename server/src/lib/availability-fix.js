import { query } from '../config/db.js';

export async function fixAllComponentAvailability() {
  console.log('Checking and fixing component availability...');
  
  try {
    // Get all components
    const componentsResult = await query('SELECT id, name, total_quantity, available_quantity FROM components');
    const components = componentsResult.rows;
    
    let fixedCount = 0;
    
    for (const component of components) {
      // Get transaction totals for this component
      const txResult = await query(`
        SELECT 
          SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END) as issued,
          SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END) as returned,
          SUM(CASE WHEN transaction_type = 'damaged' THEN quantity ELSE 0 END) as damaged
        FROM inventory_transactions
        WHERE component_id = $1
      `, [component.id]);
      
      const txData = txResult.rows[0];
      const issued = Number(txData.issued) || 0;
      const returned = Number(txData.returned) || 0;
      const damaged = Number(txData.damaged) || 0;
      
      // Calculate correct values
      const netIssued = Math.max(0, issued - returned);
      const correctAvailable = Math.max(0, component.total_quantity - netIssued - damaged);
      
      // Determine correct status
      let correctStatus;
      if (correctAvailable === 0) {
        correctStatus = 'out_of_stock';
      } else if (correctAvailable <= Math.max(2, Math.ceil(component.total_quantity * 0.2))) {
        correctStatus = 'low_stock';
      } else {
        correctStatus = 'active';
      }
      
      // Update if needed
      if (component.available_quantity !== correctAvailable) {
        await query(`
          UPDATE components 
          SET available_quantity = $1, status = $2, updated_at = NOW()
          WHERE id = $3
        `, [correctAvailable, correctStatus, component.id]);
        
        fixedCount++;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`Fixed ${fixedCount} components with incorrect availability`);
    } else {
      console.log('All component availability is correct');
    }
  } catch (error) {
    console.error('Error checking/fixing availability:', error);
  }
}
