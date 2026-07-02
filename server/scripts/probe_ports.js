#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || process.env.PASSWORD || 'postgres123';
const database = process.env.PGDATABASE || 'inventory_db';

const tryPort = async (port) => {
  const pool = new pg.Pool({ host: 'localhost', port, user, password, database, connectionTimeoutMillis: 2000 });
  try {
    const res = await pool.query('SELECT COUNT(*)::int as count FROM centers');
    await pool.end();
    return { port, count: res.rows[0].count };
  } catch (err) {
    try { await pool.end(); } catch(e) {}
    return { port, error: err.message };
  }
};

const run = async () => {
  const results = [];
  for (let p = 5432; p <= 5440; p++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await tryPort(p);
    console.log('port', p, r.error ? ('err: ' + r.error) : ('count=' + r.count));
    results.push(r);
  }
  process.exit(0);
};

run();
