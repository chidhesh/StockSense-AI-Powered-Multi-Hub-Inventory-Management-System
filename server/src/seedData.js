import bcrypt from 'bcryptjs';
import pool from './config/db.js';

const DUMMY_HUB_NAMES = [
  'main iot hub',
  'secondary lab',
  'secondary hub',
];

/** Remove seeded dummy hubs and duplicate center rows (same name). */
/** Manual-only cleanup: removes explicit demo rows only (never low/out-of-stock inventory). */
export const cleanupDummyInventory = async () => {
  const { rowCount: txRemoved } = await pool.query(`
    DELETE FROM inventory_transactions
    WHERE notes ILIKE '%forecasting demo%'
       OR notes = 'Initial dummy data'
  `);
  const { rowCount: compRemoved } = await pool.query(`
    DELETE FROM components
    WHERE LOWER(name) LIKE '%dummy%'
       OR LOWER(description) LIKE '%dummy dataset%'
  `);
  if (txRemoved > 0 || compRemoved > 0) {
    console.log(`Removed ${compRemoved} demo component(s) and ${txRemoved} demo transaction(s)`);
  }
};

/** Keep status in sync with available quantity (low_stock / out_of_stock / active). */
export const syncComponentStatuses = async () => {
  const result = await pool.query(`
    UPDATE components
    SET status = CASE
      WHEN status IN ('expired', 'defective') THEN status
      WHEN total_quantity = 0 OR available_quantity <= 0 THEN 'out_of_stock'
      WHEN available_quantity <= GREATEST(1, CEIL(total_quantity * 0.2)) THEN 'low_stock'
      ELSE 'active'
    END,
    updated_at = NOW()
    WHERE status IS NOT NULL
  `);
  console.log(`Synced component statuses for ${result.rowCount} row(s)`);
};

export const cleanupDummyCenters = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: dummyHubs } = await client.query(
      `SELECT id, name FROM centers
       WHERE LOWER(TRIM(name)) = ANY($1::text[])`,
      [DUMMY_HUB_NAMES]
    );

    for (const hub of dummyHubs) {
      await client.query(
        `UPDATE profiles SET center_id = NULL WHERE center_id = $1`,
        [hub.id]
      );
      await client.query(`DELETE FROM centers WHERE id = $1`, [hub.id]);
    }

    const { rows: dupGroups } = await client.query(`
      SELECT LOWER(TRIM(name)) AS norm_name,
             array_agg(id ORDER BY created_at ASC) AS ids
      FROM centers
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);

    for (const group of dupGroups) {
      const keepId = group.ids[0];
      const removeIds = group.ids.slice(1);
      for (const removeId of removeIds) {
        await client.query(
          `UPDATE profiles SET center_id = $1 WHERE center_id = $2`,
          [keepId, removeId]
        );
        await client.query(`DELETE FROM centers WHERE id = $1`, [removeId]);
      }
    }

    await client.query('COMMIT');
    if (dummyHubs.length > 0) {
      console.log(`Removed ${dummyHubs.length} dummy hub(s): ${dummyHubs.map((h) => h.name).join(', ')}`);
    }
    if (dupGroups.length > 0) {
      console.log(`Deduplicated ${dupGroups.length} hub name group(s)`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** Seed realistic issue/return activity and hub transfers when the DB is sparse. */
export const seedSampleActivity = async () => {
  const { rows: centerRows } = await pool.query('SELECT id, name FROM centers');
  const { rows: compCount } = await pool.query('SELECT COUNT(*)::int AS count FROM components');

  if (compCount[0].count < 10 && centerRows.length > 0) {
    console.log('Seeding initial components across hubs...');
    const componentsToSeed = [
      { name: 'Arduino Uno R3', category: 'Microcontrollers', unit_cost: 650, total_quantity: 50 },
      { name: 'Raspberry Pi 4', category: 'Microcontrollers', unit_cost: 4500, total_quantity: 20 },
      { name: 'ESP32 DevKit', category: 'IoT Modules', unit_cost: 450, total_quantity: 100 },
      { name: 'DHT11 Sensor', category: 'Sensors', unit_cost: 120, total_quantity: 200 },
      { name: 'HC-SR04 Ultrasonic', category: 'Sensors', unit_cost: 150, total_quantity: 150 },
      { name: '16x2 LCD Display', category: 'Displays', unit_cost: 250, total_quantity: 80 },
      { name: 'SG90 Servo Motor', category: 'Motors', unit_cost: 180, total_quantity: 120 },
      { name: 'Breadboard 830 Points', category: 'Other', unit_cost: 100, total_quantity: 300 },
      { name: 'Jumper Wires M-M', category: 'Cables & Connectors', unit_cost: 50, total_quantity: 1000 },
      { name: '9V Battery Connector', category: 'Power Supply', unit_cost: 30, total_quantity: 500 },
    ];

    for (const center of centerRows) {
      for (const comp of componentsToSeed) {
        // Randomize quantity for each hub
        const qty = Math.floor(Math.random() * comp.total_quantity) + 10;
        await pool.query(
          `INSERT INTO components (name, category, total_quantity, available_quantity, unit_cost, center_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active')
           ON CONFLICT (name, center_id) DO NOTHING`,
          [comp.name, comp.category, qty, qty, comp.unit_cost, center.id]
        );
      }
    }
  }

  const { rows: txCount } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM inventory_transactions'
  );
  if (txCount[0]?.count >= 15) return;

  const { rows: centers } = await pool.query(
    `SELECT id, name, location FROM centers ORDER BY name LIMIT 10`
  );
  if (centers.length < 2) return;

  const { rows: students } = await pool.query(
    `SELECT id, full_name, roll_number, center_id FROM students
     WHERE center_id IS NOT NULL LIMIT 20`
  );

  const { rows: components } = await pool.query(
    `SELECT id, name, center_id, available_quantity
     FROM components
     WHERE available_quantity > 2
     ORDER BY created_at DESC
     LIMIT 40`
  );
  if (components.length === 0) return;

  const studentsByCenter = new Map();
  students.forEach((s) => {
    if (!studentsByCenter.has(s.center_id)) studentsByCenter.set(s.center_id, []);
    studentsByCenter.get(s.center_id).push(s);
  });

  let created = 0;
  for (const comp of components.slice(0, 12)) {
    const hubStudents = studentsByCenter.get(comp.center_id) || [];
    const student = hubStudents[created % Math.max(hubStudents.length, 1)];
    const qty = Math.min(2, Math.max(1, Math.floor(comp.available_quantity / 4)));

    try {
      await pool.query('BEGIN');
      const { rows: stockRows } = await pool.query(
        'SELECT available_quantity FROM components WHERE id = $1 FOR UPDATE',
        [comp.id]
      );
      if (!stockRows[0] || stockRows[0].available_quantity < qty) {
        await pool.query('ROLLBACK');
        continue;
      }

      await pool.query(
        `INSERT INTO inventory_transactions
         (component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, notes, session_date)
         VALUES ($1, $2, 'issue', $3, $4, $5, $6, $7, CURRENT_DATE)`,
        [
          comp.id,
          comp.center_id,
          qty,
          student?.id || null,
          student?.full_name || 'Lab Session',
          student?.roll_number || null,
          'Lab component issue',
        ]
      );
      await pool.query('COMMIT');
      created++;
    } catch {
      await pool.query('ROLLBACK');
    }
  }

  const { rows: transferCount } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM hub_transfer_requests'
  );
  if (transferCount[0]?.count < 3 && centers.length >= 2 && components.length >= 2) {
    const source = centers[0];
    const dest = centers[1];
    const comp = components.find((c) => c.center_id === source.id && c.available_quantity >= 2)
      || components[0];

    const adminId = '00000000-0000-0000-0000-000000000003';
    if (comp && comp.center_id === source.id) {
      await pool.query(
        `INSERT INTO hub_transfer_requests
         (source_center_id, destination_center_id, component_id, quantity, requested_by, notes, status)
         VALUES ($1, $2, $3, 1, $4, $5, 'pending')`,
        [
          source.id,
          dest.id,
          comp.id,
          adminId,
          `Transfer sample: ${source.name} → ${dest.name}`,
        ]
      );
    }
  }

  if (created > 0) {
    console.log(`Seeded ${created} sample inventory transaction(s)`);
  }
};

export const seedStudentData = async () => {
  try {
    await cleanupDummyCenters();
    
    // Seed initial centers if none exist
    const { rows: centerCheck } = await pool.query('SELECT COUNT(*)::int as count FROM centers');
    if (centerCheck[0].count === 0) {
      console.log('Seeding initial centers...');
      await pool.query(`
        INSERT INTO centers (name, location, admin_name, type) VALUES
        ('Main IoT Hub', 'Building A, Room 101', 'John Admin', 'hub'),
        ('Robotics Lab', 'Building B, Ground Floor', 'Jane Smith', 'lab'),
        ('Electronic Systems Center', 'Building C, 2nd Floor', 'Mike Johnson', 'hub')
      `);
    }

    const { rows: centers } = await pool.query('SELECT id FROM centers');
    const centerIds = centers.map(c => c.id);

    // Seed initial students if none exist
    const { rows: studentCheck } = await pool.query('SELECT COUNT(*)::int as count FROM students');
    if (studentCheck[0].count < 5 && centerIds.length > 0) {
      console.log('Seeding initial students...');
      const studentData = [
        { name: 'Alex Rivera', roll: 'STU001', branch: 'ECE', email: 'alex@example.com' },
        { name: 'Sam Chen', roll: 'STU002', branch: 'CSE', email: 'sam@example.com' },
        { name: 'Jordan Taylor', roll: 'STU003', branch: 'ME', email: 'jordan@example.com' },
        { name: 'Priya Sharma', roll: 'STU004', branch: 'ECE', email: 'priya@example.com' },
        { name: 'David Lee', roll: 'STU005', branch: 'EEE', email: 'david@example.com' },
      ];

      for (let i = 0; i < studentData.length; i++) {
        const s = studentData[i];
        const cid = centerIds[i % centerIds.length];
        await pool.query(
          `INSERT INTO students (full_name, roll_number, branch, email, center_id, is_registered)
           VALUES ($1, $2, $3, $4, $5, false)
           ON CONFLICT (roll_number) DO NOTHING`,
          [s.name, s.roll, s.branch, s.email, cid]
        );
      }
    }

    await syncComponentStatuses();

    // --- Create Main Admin ---
    const mainAdminEmail = 'admin@techhub.in';
    const mainAdminPassword = await bcrypt.hash('admin123', 10);
    const mainAdminId = '00000000-0000-0000-0000-000000000003';

    const { rows: existingMainAdmin } = await pool.query('SELECT id FROM app_users WHERE email = $1', [mainAdminEmail]);
    if (existingMainAdmin.length > 0) {
      await pool.query('UPDATE app_users SET password_hash = $1 WHERE email = $2', [mainAdminPassword, mainAdminEmail]);
    } else {
      await pool.query('INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)', [mainAdminId, mainAdminEmail, mainAdminPassword]);
    }
    await pool.query('INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET role = $3', [mainAdminId, 'Main Administrator', 'main_admin', null]);

    // --- Create System Admin ---
    const systemAdminEmail = 'system@techhub.in';
    const systemAdminPassword = await bcrypt.hash('admin123', 10);
    const systemAdminId = '00000000-0000-0000-0000-000000000004';

    const { rows: existingSystemAdmin } = await pool.query('SELECT id FROM app_users WHERE email = $1', [systemAdminEmail]);
    if (existingSystemAdmin.length > 0) {
      await pool.query('UPDATE app_users SET password_hash = $1 WHERE email = $2', [systemAdminPassword, systemAdminEmail]);
    } else {
      await pool.query('INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)', [systemAdminId, systemAdminEmail, systemAdminPassword]);
    }
    await pool.query('INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET role = $3', [systemAdminId, 'System Administrator', 'system_admin', null]);

    await seedSampleActivity();
    console.log('Database maintenance seed complete');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
};
