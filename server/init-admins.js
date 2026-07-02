
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const useMemoryDb = !DATABASE_URL;

let pool;

if (!useMemoryDb) {
  console.log('Using persistent PostgreSQL database');
  const { Pool } = pg;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') || DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('Using pg-mem in-memory database');
  const { newDb } = await import('pg-mem');
  const mem = newDb();
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => crypto.randomUUID()
  });
  const adapter = mem.adapters.createPg();
  pool = new adapter.Pool();
}

async function initAdmins() {
  try {
    console.log('🗄️ Initializing admin accounts...');

    // First, initialize schema
    const fs = await import('fs');
    const schemaPath = path.join(__dirname, 'src', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);

    const passwordHash = await bcrypt.hash('admin123', 10);

    // --- Insert Main Admin ---
    const mainAdminId = crypto.randomUUID();
    console.log('📥 Inserting Main Admin...');
    await pool.query(`
      INSERT INTO app_users (id, email, password_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash = $3
    `, [mainAdminId, 'admin@techhub.in', passwordHash]);

    await pool.query(`
      INSERT INTO profiles (id, full_name, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET role = $3
    `, [mainAdminId, 'Main Administrator', 'main_admin']);

    // --- Insert System Admin ---
    const systemAdminId = crypto.randomUUID();
    console.log('📥 Inserting System Admin...');
    await pool.query(`
      INSERT INTO app_users (id, email, password_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash = $3
    `, [systemAdminId, 'system@techhub.in', passwordHash]);

    await pool.query(`
      INSERT INTO profiles (id, full_name, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET role = $3
    `, [systemAdminId, 'System Administrator', 'system_admin']);

    console.log('\n✅ Admin accounts initialized!');
    console.log('\n📧 Login Credentials:');
    console.log('🎯 MAIN ADMIN:');
    console.log('   Email: admin@techhub.in');
    console.log('   Password: admin123');
    console.log('\n📊 SYSTEM ADMIN:');
    console.log('   Email: system@techhub.in');
    console.log('   Password: admin123');

  } catch (error) {
    console.error('❌ Error initializing admins:', error);
  } finally {
    if (pool && !useMemoryDb) {
      await pool.end();
    }
  }
}

initAdmins();
