#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { query } from '../src/config/db.js';
import crypto from 'node:crypto';

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4] || 'Belgaum User';
const role = process.argv[5] || 'center_admin';

if (!email || !password) {
  console.error('Usage: node scripts/create_user.js <email> <password> [fullName] [role]');
  process.exit(2);
}

const run = async () => {
  try {
    const { rows } = await query('SELECT id FROM app_users WHERE email = $1', [email]);
    let id;
    const passwordHash = await bcrypt.hash(password, 10);
    if (rows.length > 0) {
      id = rows[0].id;
      await query('UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, id]);
      console.log('Updated existing app_user', id);
    } else {
      id = crypto.randomUUID();
      await query('INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)', [id, email, passwordHash]);
      console.log('Inserted app_user', id);
    }

    const { rows: prof } = await query('SELECT id FROM profiles WHERE id = $1', [id]);
    if (prof.length === 0) {
      await query('INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4)', [id, fullName, role, null]);
      console.log('Inserted profile for', id);
    } else {
      await query('UPDATE profiles SET full_name = $1, role = $2, updated_at = NOW() WHERE id = $3', [fullName, role, id]);
      console.log('Updated profile for', id);
    }

    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err.message || err);
    process.exit(3);
  }
};

run();
