import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function dropUnwantedConstraints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Dropping unwanted UNIQUE constraints...');
    
    // Drop components_qr_code_key
    console.log('Dropping components_qr_code_key...');
    await pool.query('ALTER TABLE components DROP CONSTRAINT IF EXISTS components_qr_code_key;');
    
    // Drop components_sku_key
    console.log('Dropping components_sku_key...');
    await pool.query('ALTER TABLE components DROP CONSTRAINT IF EXISTS components_sku_key;');
    
    console.log('Successfully dropped unwanted constraints!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

dropUnwantedConstraints().then(() => process.exit(0));
