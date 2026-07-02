
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Creating Main Admin account...\n');
    
    const adminId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    // First, check if this email already exists
    const existing = await pool.query('SELECT id FROM app_users WHERE email = $1', ['admin@techhub.in']);
    
    if (existing.rows.length > 0) {
      console.log('Main Admin account already exists! Updating password...');
      await pool.query('UPDATE app_users SET password_hash = $1 WHERE email = $2', [passwordHash, 'admin@techhub.in']);
    } else {
      await pool.query('INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)', [
        adminId, 
        'admin@techhub.in', 
        passwordHash
      ]);
      
      await pool.query('INSERT INTO profiles (id, full_name, role) VALUES ($1, $2, $3)', [
        adminId, 
        'Main Administrator', 
        'main_admin'
      ]);
    }
    
    console.log('\n✅ Main Admin account created/updated successfully!');
    console.log('\n📧 Login Credentials:');
    console.log('   Email: admin@techhub.in');
    console.log('   Password: admin123');
    console.log('   Role: Main Administrator (Top Level Admin)');
    console.log('\n💡 This account has access to everything, including the Admin Dashboard!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
