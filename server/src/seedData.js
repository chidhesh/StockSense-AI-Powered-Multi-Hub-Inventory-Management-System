import bcrypt from 'bcryptjs';
import pool from './config/db.js';
import crypto from 'node:crypto';

export const seedStudentData = async () => {
  try {
    const mainCenterId = '00000000-0000-0000-0000-000000000001';
    const secondaryCenterId = '00000000-0000-0000-0000-000000000002';
    const adminId = '00000000-0000-0000-0000-000000000003';
    const managerId = '00000000-0000-0000-0000-000000000004';

    await pool.query(
      'INSERT INTO centers (id, name, location, admin_name, contact_email, contact_phone, capacity, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING',
      [mainCenterId, 'Main IoT Hub', 'Bangalore', 'Nisha Patel', 'mainhub@smartinv.com', '+91 98765 43210', 250, 'Primary']
    );

    await pool.query(
      'INSERT INTO centers (id, name, location, admin_name, contact_email, contact_phone, capacity, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING',
      [secondaryCenterId, 'Secondary Lab', 'Chennai', 'Karan Mehta', 'secondary@smartinv.com', '+91 99876 54321', 180, 'Secondary']
    );

    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      'INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [adminId, 'admin@smartinv.local', adminPassword]
    );
    await pool.query(
      'INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [adminId, 'System Administrator', 'master_admin', null]
    );

    const managerPassword = await bcrypt.hash('manager123', 10);
    await pool.query(
      'INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [managerId, 'manager@smartinv.local', managerPassword]
    );
    await pool.query(
      'INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [managerId, 'Center Manager', 'center_admin', mainCenterId]
    );

    const studentRollNo = 'IOT2026001';
    await pool.query(`
      INSERT INTO students (full_name, roll_number, branch, email, center_id, is_registered)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (roll_number) DO NOTHING
    `, ['John Doe', studentRollNo, 'Computer Science', 'john.doe@example.com', mainCenterId, false]);

    const components = [];

    for (const comp of components) {
      await pool.query(
        `INSERT INTO components (name, category, description, sku, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT DO NOTHING`,
        [comp.name, comp.category, comp.description, comp.sku, comp.total_quantity, comp.available_quantity, 10, 0, comp.unit_cost, comp.center_id, comp.status]
      );
    }

    const vendors = [];

    for (const v of vendors) {
      await pool.query(`
        INSERT INTO vendors (component_name, vendor_name, price, rating, stock)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING`,
        [v.comp, v.name, v.price, v.rating, v.stock]
      );
    }

    console.log('Sample system, center, student, component, and vendor data seeded');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
};
