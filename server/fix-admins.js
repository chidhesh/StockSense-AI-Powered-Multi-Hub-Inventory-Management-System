
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// This uses the same connection string as your existing database!
const DATABASE_URL = 'postgresql://postgres:postgres123@localhost:5433/inventory_db';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function fixAdmins() {
  try {
    console.log('🔧 Connecting to PostgreSQL database...\n');

    const passwordHash = await bcrypt.hash('admin123', 10);

    // --- Step 1: Update admin@techhub.in ---
    console.log('1️⃣ Updating admin@techhub.in to "Chidhesh"...');
    const updateResult = await pool.query(
      'UPDATE app_users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [passwordHash, 'admin@techhub.in']
    );

    if (updateResult.rows.length === 0) {
      console.log('⚠️ admin@techhub.in not found, inserting...');
      const mainAdminId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)',
        [mainAdminId, 'admin@techhub.in', passwordHash]
      );
      await pool.query(
        'INSERT INTO profiles (id, full_name, role) VALUES ($1, $2, $3)',
        [mainAdminId, 'Chidhesh', 'main_admin']
      );
    } else {
      // Also ensure the profile has correct role AND name!
      await pool.query(
        'UPDATE profiles SET role = $1, full_name = $2 WHERE id = $3',
        ['main_admin', 'Chidhesh', updateResult.rows[0].id]
      );
    }

    // --- Step 2: Insert/Update system@techhub.in ---
    console.log('2️⃣ Updating system@techhub.in to "Prajwal Suvarna"...');
    const systemCheck = await pool.query(
      'SELECT id FROM app_users WHERE email = $1',
      ['system@techhub.in']
    );

    if (systemCheck.rows.length === 0) {
      const systemAdminId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)',
        [systemAdminId, 'system@techhub.in', passwordHash]
      );
      await pool.query(
        'INSERT INTO profiles (id, full_name, role) VALUES ($1, $2, $3)',
        [systemAdminId, 'Prajwal Suvarna', 'system_admin']
      );
      console.log('✅ system@techhub.in inserted!');
    } else {
      // If already exists, update password, role and name!
      await pool.query(
        'UPDATE app_users SET password_hash = $1 WHERE email = $2',
        [passwordHash, 'system@techhub.in']
      );
      await pool.query(
        'UPDATE profiles SET role = $1, full_name = $2 WHERE id = $3',
        ['system_admin', 'Prajwal Suvarna', systemCheck.rows[0].id]
      );
      console.log('✅ system@techhub.in updated!');
    }

    console.log('\n✅ All done!');
    console.log('\n📧 Your login credentials are:');
    console.log('🎯 MAIN ADMIN:');
    console.log('   Name: Chidhesh');
    console.log('   Email: admin@techhub.in');
    console.log('   Password: admin123');
    console.log('\n📊 SYSTEM ADMIN:');
    console.log('   Name: Prajwal Suvarna');
    console.log('   Email: system@techhub.in');
    console.log('   Password: admin123');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixAdmins();
