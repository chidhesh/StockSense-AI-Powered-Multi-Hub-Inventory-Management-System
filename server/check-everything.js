import { query } from './src/config/db.js';

async function checkUsers() {
  try {
    const { rows: users } = await query('SELECT * FROM app_users');
    console.log('Users in DB:');
    users.map(u => console.log(`  - ${u.email}`));

    const { rows: profiles } = await query('SELECT * FROM profiles');
    console.log('\nProfiles in DB:');
    profiles.map(p => console.log(`  - ${p.full_name} (${p.email || 'no email'}) | Role: ${p.role}`));

    const { rows: centers } = await query('SELECT * FROM centers');
    console.log('\nCenters in DB:');
    centers.map(c => console.log(`  - ${c.name} (${c.location})`));

  } catch (error) {
    console.error('Error checking users:', error);
  }
}

checkUsers();