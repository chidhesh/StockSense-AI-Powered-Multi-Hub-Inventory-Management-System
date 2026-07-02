#!/usr/bin/env node
import { query } from '../src/config/db.js';

const run = async () => {
  try {
    const db = await query('SELECT current_database() as db, current_user as user, version() as version');
    console.log('DB INFO:', db.rows[0]);
    const centers = await query('SELECT COUNT(*)::int as count FROM centers');
    console.log('centers count:', centers.rows[0].count);
    const sample = await query('SELECT id, name, location, contact_email FROM centers ORDER BY id ASC LIMIT 10');
    console.log('sample centers:', JSON.stringify(sample.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err.message || err);
    process.exit(2);
  }
};

run();
