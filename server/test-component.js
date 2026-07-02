
import { query } from './src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

const testComponent = async () => {
  try {
    console.log('Testing component insertion...');
    // First get a center id
    const centers = await query('SELECT id FROM centers LIMIT 1');
    const centerId = centers.rows[0]?.id;
    if (!centerId) {
      console.log('No centers found, creating a test center...');
      const newCenter = await query(
        'INSERT INTO centers (name, location) VALUES ($1, $2) RETURNING id',
        ['Test Hub', 'Test Location']
      );
      centerId = newCenter.rows[0].id;
    }
    console.log('Using center id:', centerId);
    const payload = {
      name: 'Test Arduino',
      category: 'Microcontrollers',
      description: 'Test component',
      total_quantity: 10,
      available_quantity: 10,
      max_usage_limit: 10,
      unit_cost: 250,
      center_id: centerId,
      status: 'active',
      sku: 'TEST-123',
      qr_code: 'test-qr',
      // updated_at: new Date().toISOString()
    };
    console.log('Payload:', payload);
    const result = await query(
      `INSERT INTO components (name, category, description, sku, qr_code, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status, min_stock_threshold, course_id, course_name, skill_tags, is_shared_component)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        payload.name,
        payload.category,
        payload.description,
        payload.sku,
        payload.qr_code,
        payload.total_quantity,
        payload.available_quantity,
        payload.max_usage_limit,
        0,
        payload.unit_cost,
        payload.center_id,
        payload.status,
        5,
        null,
        null,
        null,
        false
      ]
    );
    console.log('Insert successful:', result.rows[0]);
  } catch (error) {
    console.error('Test failed:', error);
    console.error('Error details:', error.message, error.stack);
  }
};

testComponent().then(() => process.exit(0));
