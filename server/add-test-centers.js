import { query } from './src/config/db.js';

async function addTestCenters() {
  try {
    // Check if centers already exist
    const { rows: existingCenters } = await query('SELECT * FROM centers');
    if (existingCenters.length > 0) {
      console.log('Centers already exist:', existingCenters.map(c => c.name));
      return;
    }

    console.log('Adding test centers...');
    
    const testCenters = [
      {
      id: crypto.randomUUID(),
      name: 'Main Hub - Bangalore',
      location: 'Bangalore, Karnataka',
      admin_name: 'Chidhesh',
      contact_email: 'chidhesh@example.com',
      contact_phone: '+91-9876543210',
      capacity: 500,
      type: 'Main'
    },
      {
      id: crypto.randomUUID(),
      name: 'Tech Hub - Mangalore',
      location: 'Mangalore, Karnataka',
      admin_name: 'Prajwal Suvarna',
      contact_email: 'prajwal@example.com',
      contact_phone: '+91-9876543211',
      capacity: 300,
      type: 'Satellite'
    },
      {
      id: crypto.randomUUID(),
      name: 'Innovation Hub - Mysore',
      location: 'Mysore, Karnataka',
      admin_name: 'Test Admin',
      contact_email: 'test@example.com',
      contact_phone: '+91-9876543212',
      capacity: 200,
      type: 'Satellite'
    }
    ];

    for (const center of testCenters) {
      await query(`
        INSERT INTO centers (id, name, location, admin_name, contact_email, contact_phone, capacity, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [center.id, center.name, center.location, center.admin_name, center.contact_email, center.contact_phone, center.capacity, center.type]);
    }

    console.log('Successfully added test centers!');

    const { rows: addedCenters } = await query('SELECT * FROM centers');
    console.log('Current centers:', addedCenters.map(c => ({ name: c.name, location: c.location })));

  } catch (error) {
    console.error('Error adding test centers:', error);
  }
}

addTestCenters();