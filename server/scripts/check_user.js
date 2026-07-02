#!/usr/bin/env node
import { query } from '../src/config/db.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/check_user.js <email>');
  process.exit(2);
}

const run = async () => {
  try {
    const res = await query('SELECT id, email, password_hash, created_at FROM app_users WHERE email = $1', [email]);
    if (res.rows.length === 0) {
      console.log('NOT_FOUND');
      process.exit(0);
    }
    console.log(JSON.stringify(res.rows[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err.message || err);
    process.exit(3);
  }
};

run();
