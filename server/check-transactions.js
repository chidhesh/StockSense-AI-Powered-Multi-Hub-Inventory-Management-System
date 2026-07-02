
import pg from 'pg';
import crypto from 'node:crypto';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Checking existing transactions...\n');
    
    // Check existing transactions
    const txResult = await pool.query(`
      SELECT COUNT(*) FROM inventory_transactions
    `);
    
    console.log(`Total transactions in database: ${txResult.rows[0].count}\n`);
    
    if (parseInt(txResult.rows[0].count) === 0) {
      console.log('No transactions found! Creating test transactions...\n');
      
      // Get a center, component, and student to use
      const centerResult = await pool.query('SELECT id, name FROM centers LIMIT 1');
      const componentResult = await pool.query('SELECT id, name, available_quantity FROM components LIMIT 1');
      const studentResult = await pool.query('SELECT id, full_name, roll_number FROM students LIMIT 1');
      
      if (centerResult.rows.length > 0 && componentResult.rows.length > 0 && studentResult.rows.length > 0) {
        const center = centerResult.rows[0];
        const component = componentResult.rows[0];
        const student = studentResult.rows[0];
        
        console.log('Using test data:');
        console.log(`  Center: ${center.name}`);
        console.log(`  Component: ${component.name}`);
        console.log(`  Student: ${student.full_name} (${student.roll_number})`);
        console.log('\nCreating test transaction...');
        
        // Create an issue transaction
        const txId = crypto.randomUUID();
        await pool.query(`
          INSERT INTO inventory_transactions 
          (id, component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, notes, session_date, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `, [
          txId,
          component.id,
          center.id,
          'issue',
          1,
          student.id,
          student.full_name,
          student.roll_number,
          'Test transaction issued to student',
          new Date().toISOString().slice(0, 10)
        ]);
        
        console.log('✅ Test transaction created successfully!');
        console.log('\nNow refresh your Transactions page to see the data!');
      } else {
        console.log('⚠️ Not enough data to create test transactions! Need at least 1 center, 1 component, and 1 student.');
      }
    } else {
      console.log('✅ Transactions already exist!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
