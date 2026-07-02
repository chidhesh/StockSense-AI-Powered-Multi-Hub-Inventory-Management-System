import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function checkConstraints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Show all constraints on components table
    const constraints = await pool.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        string_agg(kcu.column_name, ', ') AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'components'
      GROUP BY tc.constraint_name, tc.constraint_type;
    `);

    console.log('Components table constraints:');
    console.table(constraints.rows);

    // Check if qr_code or sku have unique constraints - we probably don't want that!
    const qrUnique = constraints.rows.some(row => row.columns.includes('qr_code'));
    const skuUnique = constraints.rows.some(row => row.columns.includes('sku'));
    
    if (qrUnique) {
      console.warn('\n⚠️ WARNING: qr_code has a UNIQUE constraint! This might cause issues!');
      console.warn('Would you like to drop the qr_code unique constraint?');
    }
    if (skuUnique) {
      console.warn('\n⚠️ WARNING: sku has a UNIQUE constraint! This might cause issues!');
      console.warn('Would you like to drop the sku unique constraint?');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkConstraints().then(() => process.exit(0));
