import pg from 'pg';
import { newDb } from 'pg-mem';
import crypto from 'node:crypto';
import { PGMEM_FALLBACK, DATABASE_URL } from './env.js';

const { Pool } = pg;
let pool;

const useMemoryFallback = !DATABASE_URL || DATABASE_URL.trim() === '';

if (!useMemoryFallback && DATABASE_URL) {
  console.log('Using persistent PostgreSQL database');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') || DATABASE_URL.includes('supabase')
      ? { rejectUnauthorized: false }
      : false,
  });
} else {
  console.log('Using pg-mem in-memory fallback');
  const mem = newDb();
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => crypto.randomUUID(),
  });
  const adapter = mem.adapters.createPg();
  pool = new adapter.Pool();
}

export const query = (text, params) => pool.query(text, params);
export default pool;
export const IS_MEMORY = useMemoryFallback;
