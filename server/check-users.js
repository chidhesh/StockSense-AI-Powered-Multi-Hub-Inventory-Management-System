import { query } from './src/config/db.js';

async function checkUsers() {
  try {
    const { rows: users } = await query('SELECT * FROM app_users');
    console.log('Users in DB:', users.map(u => ({ email: u.email, id: u.id })));

    const { rows: profiles } = await query('SELECT * FROM profiles');
    console.log('Profiles in DB:', profiles.map(p => ({ full_name: p.full_name, role: p.role, id: p.id })));

  } catch (error) {
    console.error('Error checking users:', error);
  }
}

checkUsers();