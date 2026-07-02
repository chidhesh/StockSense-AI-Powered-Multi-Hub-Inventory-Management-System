import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import pool from '../config/db.js';
import { query } from '../config/db.js';
import { JWT_SECRET } from '../config/env.js';
import aiService from '../services/aiService.js';
import {
  sendStockAlert,
  sendBulkStockAlert,
  sendShortageAlertEmail,
  sendPurchaseRecommendationEmail,
  sendInventoryAlertBundle,
} from '../notificationService.js';
import { buildInventoryAlertsFromComponents } from '../alertHelpers.js';
import { generateSimpleInventory, generateSimpleTransactions, convertToCSV } from '../simpleDummyDataGenerator.js';

const router = express.Router();

// #region debug-point A:replenishment-debug-reporter
const reportReplenishmentDebug = (message, payload = {}) => {
  const url = process.env.DEBUG_SERVER_URL || 'http://127.0.0.1:7777/event';
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: process.env.DEBUG_SESSION_ID || 'replenishment-404',
      runId: process.env.DEBUG_RUN_ID || 'pre-fix',
      hypothesisId: payload.hypothesisId || 'A',
      message,
      payload,
      ts: new Date().toISOString(),
    }),
  }).catch(() => {});
};
// #endregion debug-point A:replenishment-debug-reporter

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    // #region debug-point B:replenishment-auth-missing-token
    if (req.originalUrl?.includes('/replenishment-requests')) {
      reportReplenishmentDebug('Missing auth token on replenishment request', {
        hypothesisId: 'B',
        method: req.method,
        url: req.originalUrl,
      });
    }
    // #endregion debug-point B:replenishment-auth-missing-token
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    // #region debug-point B:replenishment-auth-invalid-token
    if (req.originalUrl?.includes('/replenishment-requests')) {
      reportReplenishmentDebug('Invalid auth token on replenishment request', {
        hypothesisId: 'B',
        method: req.method,
        url: req.originalUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // #endregion debug-point B:replenishment-auth-invalid-token
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const buildUpdateQuery = (table, id, body) => {
  const keys = Object.keys(body).filter((key) => body[key] !== undefined);
  if (!keys.length) return null;
  const assignments = keys.map((key, index) => `"${key}" = $${index + 1}`);
  const values = keys.map((key) => body[key]);
  const placeholder = `$${keys.length + 1}`;
  return {
    sql: `UPDATE ${table} SET ${assignments.join(', ')}${keys.includes('updated_at') ? '' : ', updated_at = NOW()'} WHERE id = ${placeholder} RETURNING *`,
    values: [...values, id],
  };
};

const formatQueryList = (rows) => rows.map((row) => ({ ...row }));

const sendThresholdCrossingAlerts = async ({
  componentName,
  centerId,
  centerName,
  previousAvailable,
  currentAvailable,
  totalQuantity,
}) => {
  const safeTotal = Number(totalQuantity) || 0;
  const lowThreshold = Math.max(1, Math.ceil(safeTotal * 0.2));
  const enteredOutOfStock = previousAvailable > 0 && currentAvailable === 0;
  const enteredLowStock = previousAvailable > lowThreshold && currentAvailable > 0 && currentAvailable <= lowThreshold;

  if (!enteredOutOfStock && !enteredLowStock) return;

  const recipientsResult = await query(
    `SELECT DISTINCT u.email
     FROM app_users u
     JOIN profiles p ON p.id = u.id
     WHERE (
       p.role = 'master_admin'
       OR LOWER(p.role) = 'system administrator'
       OR (p.role = 'center_admin' AND p.center_id = $1)
     )
     AND u.email IS NOT NULL
     AND u.email <> ''`,
    [centerId]
  );

  const recipients = recipientsResult.rows.map((r) => r.email).filter(Boolean);
  if (!recipients.length) return;

  const componentRow = await query(
    `SELECT name, category, available_quantity, total_quantity, max_usage_limit, unit_cost, status, course_name, skill_tags
     FROM components WHERE center_id = $1 AND name = $2 LIMIT 1`,
    [centerId, componentName]
  );
  const component = componentRow.rows[0];
  const alertBundle = component
    ? buildInventoryAlertsFromComponents([component])
    : {
        low_stock_alerts: [{
          componentName,
          currentStock: currentAvailable,
          minimumRequired: lowThreshold,
          predictedWeeklyDemand: Math.max(lowThreshold, 12),
          suggestedVendor: 'Tech Components Hub, Bangalore',
        }],
        shortage_alerts: [],
        purchase_recommendations: [],
        purchase_reason: '',
      };

  await Promise.all(
    recipients.map((email) =>
      sendInventoryAlertBundle({
        email,
        phone: null,
        ...alertBundle,
      }).catch((err) => {
        console.error('Stock alert email failed:', err?.message || err);
      })
    )
  );
};

router.get('/', (req, res) => {
  res.json({ app: 'smart-inventory-api', ok: true, timestamp: new Date() });
});

router.get('/health', (req, res) => {
  res.json({ app: 'smart-inventory-api', ok: true, timestamp: new Date() });
});

router.get('/public/admin-exists', async (req, res) => {
  try {
    const result = await query(
      `SELECT id FROM profiles WHERE role = 'main_admin' LIMIT 1`
    );
    res.json({ exists: result.rows.length > 0 });
  } catch (error) {
    console.error('Check admin exists failed:', error);
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Notifications fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Mark notification read failed:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/auth/register', async (req, res) => {
  const { email, password, full_name, role, center_id } = req.body;
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'email, password, full_name, and role are required' });
  }

  try {
    const existing = await query('SELECT id FROM app_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const isMainAdminRequest = role === 'main_admin';
    if (isMainAdminRequest) {
      const existingAdmin = await query(
        `SELECT id FROM profiles WHERE role = 'main_admin' LIMIT 1`
      );
      if (existingAdmin.rows.length > 0) {
        return res.status(403).json({ error: 'A main administrator already exists. Only one main administrator is allowed.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();

    await query('INSERT INTO app_users (id, email, password_hash) VALUES ($1, $2, $3)', [id, email, passwordHash]);
    await query('INSERT INTO profiles (id, full_name, role, center_id) VALUES ($1, $2, $3, $4)', [id, full_name, role, center_id || null]);

    return res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Auth register failed:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await query(
      `SELECT u.id, u.email, u.password_hash, p.full_name, p.role, p.center_id, p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
       FROM app_users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    const profile = {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      center_id: user.center_id,
      created_at: user.profile_created_at,
      updated_at: user.profile_updated_at,
    };

    return res.json({ token, user: { id: user.id, email: user.email }, profile });
  } catch (error) {
    console.error('Auth login failed:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await query(
      `SELECT u.id, u.email, p.full_name, p.role, p.center_id, p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
       FROM app_users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [payload.id]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({
      user: { id: row.id, email: row.email },
      profile: {
        id: row.id,
        full_name: row.full_name,
        role: row.role,
        center_id: row.center_id,
        email: row.email,
        created_at: row.profile_created_at,
        updated_at: row.profile_updated_at,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
});

router.get('/public/centers', async (req, res) => {
  try {
    // By default return all centers. If the client wants to omit known demo hubs,
    // set ?exclude_demo=true which will filter a small set of seed/demo names.
    const { exclude_demo } = req.query;
    const demoNames = ['main iot hub', 'secondary lab', 'secondary hub'];
    let sql = `
      SELECT DISTINCT ON (LOWER(TRIM(name)))
        id, name, location, admin_name, contact_email, contact_phone, capacity, type, created_at, updated_at
      FROM centers
    `;
    const params = [];
    if (String(exclude_demo) === 'true') {
      sql += ` WHERE LOWER(TRIM(name)) NOT IN (${demoNames.map((_, i) => `$${i + 1}`).join(', ')})`;
      params.push(...demoNames);
    }
    sql += ' ORDER BY LOWER(TRIM(name)), created_at ASC';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Public centers failed:', error);
    return res.status(500).json({ error: 'Failed to load centers' });
  }
});

router.get('/centers', async (req, res) => {
  try {
    // Return all centers by default. Use ?exclude_demo=true to hide known demo hubs.
    const { exclude_demo } = req.query;
    const demoNames = ['main iot hub', 'secondary lab', 'secondary hub'];
    let sql = `
      SELECT DISTINCT ON (LOWER(TRIM(name)))
        id, name, location, admin_name, contact_email, contact_phone, capacity, type, created_at, updated_at
      FROM centers
    `;
    const params = [];
    if (String(exclude_demo) === 'true') {
      sql += ` WHERE LOWER(TRIM(name)) NOT IN (${demoNames.map((_, i) => `$${i + 1}`).join(', ')})`;
      params.push(...demoNames);
    }
    sql += ' ORDER BY LOWER(TRIM(name)), created_at ASC';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Centers fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load centers' });
  }
});

router.post('/centers', async (req, res) => {
  try {
    const {
      name,
      location,
      admin_name = null,
      contact_email = null,
      contact_phone = null,
      capacity = 0,
      type = null,
    } = req.body;

    const result = await query(
      `INSERT INTO centers (name, location, admin_name, contact_email, contact_phone, capacity, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, location, admin_name, contact_email, contact_phone, capacity, type]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Center creation failed:', error);
    return res.status(500).json({ error: 'Failed to create center' });
  }
});

router.patch('/centers/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('centers', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Center update failed:', error);
    return res.status(500).json({ error: 'Failed to update center' });
  }
});

router.delete('/centers/:id', async (req, res) => {
  try {
    await query('DELETE FROM centers WHERE id = $1', [req.params.id]);
    return res.status(204).end();
  } catch (error) {
    console.error('Center delete failed:', error);
    return res.status(500).json({ error: 'Failed to delete center' });
  }
});

router.get('/components', async (req, res) => {
  try {
    const { center_id } = req.query;
    let sql = 'SELECT * FROM components';
    const values = [];
    
    // Validate UUID format if center_id is provided
    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (center_id && center_id !== 'undefined' && center_id !== 'null' && isUuid(center_id)) {
      sql += ' WHERE center_id = $1';
      values.push(center_id);
    }
    sql += ' ORDER BY name';
    const result = await query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Components fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load components', details: error.message });
  }
});

router.post('/components', async (req, res) => {
  try {
    console.log('POST /api/components req.body:', JSON.stringify(req.body, null, 2));
    const {
      name,
      category,
      description = '',
      sku = null,
      qr_code = null,
      total_quantity = 0,
      available_quantity = 0,
      max_usage_limit = 10,
      usage_count = 0,
      unit_cost = 0,
      center_id,
      status = 'active',
      min_stock_threshold = 5,
      course_id = null,
      course_name = null,
      skill_tags = null,
      is_shared_component = false,
    } = req.body;

    const result = await query(
      `INSERT INTO components (name, category, description, sku, qr_code, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status, min_stock_threshold, course_id, course_name, skill_tags, is_shared_component)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (name, center_id) DO UPDATE SET
         total_quantity = components.total_quantity + EXCLUDED.total_quantity,
         available_quantity = components.available_quantity + EXCLUDED.available_quantity,
         updated_at = NOW()
       RETURNING *`,
      [name, category, description, sku, qr_code, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status, min_stock_threshold, course_id, course_name, skill_tags, is_shared_component]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Component creation failed:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ error: 'Failed to create component', details: error.message });
  }
});

router.patch('/components/:id', async (req, res) => {
  try {
    const componentId = req.params.id;
    
    // If we're updating total_quantity, recalculate available_quantity properly
    if (req.body.total_quantity !== undefined) {
      // First, get current issued/damaged quantities from transactions
      const txResult = await query(`
        SELECT 
          SUM(CASE WHEN transaction_type = 'issue' THEN quantity ELSE 0 END) as issued,
          SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END) as returned,
          SUM(CASE WHEN transaction_type = 'damaged' THEN quantity ELSE 0 END) as damaged
        FROM inventory_transactions
        WHERE component_id = $1
      `, [componentId]);
      
      const txData = txResult.rows[0];
      const issued = Number(txData.issued) || 0;
      const returned = Number(txData.returned) || 0;
      const damaged = Number(txData.damaged) || 0;
      
      // Calculate net issued: issued - returned
      const netIssued = Math.max(0, issued - returned);
      
      // Calculate new available_quantity: total_quantity - net_issued - damaged
      const newTotal = Number(req.body.total_quantity);
      const newAvailable = Math.max(0, newTotal - netIssued - damaged);
      
      // Update available_quantity in the request body
      req.body.available_quantity = newAvailable;
    }
    
    const update = buildUpdateQuery('components', componentId, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Component update failed:', error);
    return res.status(500).json({ error: 'Failed to update component' });
  }
});

router.delete('/components/:id', async (req, res) => {
  try {
    await query('DELETE FROM components WHERE id = $1', [req.params.id]);
    return res.status(204).end();
  } catch (error) {
    console.error('Component delete failed:', error);
    return res.status(500).json({ error: 'Failed to delete component' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const { center_id } = req.query;
    let sql = 'SELECT id, full_name, roll_number, branch, phone, email, address, qr_code, center_id, created_at, updated_at FROM students';
    const values = [];
    
    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (center_id && center_id !== 'undefined' && center_id !== 'null' && isUuid(center_id)) {
      sql += ' WHERE center_id = $1';
      values.push(center_id);
    }
    sql += ' ORDER BY full_name';
    const result = await query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Students fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load students', details: error.message });
  }
});

router.post('/students', async (req, res) => {
  try {
    const { full_name, roll_number, branch = null, phone = null, email = null, address = null, center_id = null } = req.body;
    const result = await query(
      `INSERT INTO students (full_name, roll_number, branch, phone, email, address, center_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, full_name, roll_number, branch, phone, email, address, qr_code, center_id, created_at, updated_at`,
      [full_name, roll_number, branch, phone, email, address, center_id]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Student creation failed:', error);
    return res.status(500).json({ error: 'Failed to create student' });
  }
});

router.patch('/students/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('students', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Student update failed:', error);
    return res.status(500).json({ error: 'Failed to update student' });
  }
});

router.delete('/students/:id', async (req, res) => {
  try {
    await query('DELETE FROM students WHERE id = $1', [req.params.id]);
    return res.status(204).end();
  } catch (error) {
    console.error('Student delete failed:', error);
    return res.status(500).json({ error: 'Failed to delete student' });
  }
});

router.get('/inventory-transactions', async (req, res) => {
  try {
    const { limit = '1000', student_uuid, component_id, center_id } = req.query;
    const filters = [];
    const values = [];

    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (student_uuid && isUuid(student_uuid)) {
      values.push(String(student_uuid));
      filters.push(`it.student_uuid = $${values.length}`);
    }
    if (component_id && isUuid(component_id)) {
      values.push(String(component_id));
      filters.push(`it.component_id = $${values.length}`);
    }
    if (center_id && center_id !== 'undefined' && center_id !== 'null' && isUuid(center_id)) {
      values.push(String(center_id));
      filters.push(`it.center_id = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const maxLimit = Math.min(Number(limit) || 1000, 10000);
    const result = await query(`
      SELECT it.*,
             c.name as component_name,
             c.sku as component_sku,
             COALESCE(it.student_name, s.full_name) as student_name,
             ctr.name as center_name,
             ctr.location as center_location
      FROM inventory_transactions it
      LEFT JOIN components c ON it.component_id = c.id
      LEFT JOIN students s ON it.student_uuid = s.id
      LEFT JOIN centers ctr ON it.center_id = ctr.id
      ${where} 
      ORDER BY it.created_at DESC 
      LIMIT ${maxLimit}
    `, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Transactions fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load inventory transactions' });
  }
});

router.post('/inventory-transactions', async (req, res) => {
  try {
    const {
      component_id,
      center_id,
      transaction_type,
      quantity = 1,
      student_uuid = null,
      student_name = null,
      student_id = null,
      usage_count = 0,
      notes = null,
      performed_by = null,
      session_date = null,
    } = req.body;

    // Start a database transaction
    await query('BEGIN');

    // 0. Validate student belongs to the hub (if student is provided)
    if (student_uuid) {
      const { rows: studentRows } = await query(
        'SELECT center_id FROM students WHERE id = $1',
        [student_uuid]
      );
      if (studentRows.length > 0 && studentRows[0].center_id !== center_id) {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'Student does not belong to this hub/center.' });
      }
    }

    // 1. Check current stock and validate component hub
    const { rows: componentRows } = await query(
      'SELECT available_quantity, name, center_id FROM components WHERE id = $1 FOR UPDATE',
      [component_id]
    );
    
    if (componentRows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Component not found' });
    }

    const component = componentRows[0];
    
    // Validate component belongs to the transaction center
    if (component.center_id !== center_id) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Component does not belong to the selected hub.' });
    }

    if (transaction_type === 'issue' || transaction_type === 'damaged') {
      if (component.available_quantity < quantity) {
        await query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for ${component.name}. Available: ${component.available_quantity}` });
      }
    }

    // Stock is updated by DB trigger trg_update_stock on INSERT (avoid double deduction)
    const result = await query(
      `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, usage_count, notes, performed_by, session_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, usage_count, notes, performed_by, session_date]
    );

    await query('COMMIT');

    if (transaction_type === 'issue' || transaction_type === 'damaged') {
      const { rows: postUpdateRows } = await query(
        'SELECT available_quantity, total_quantity, center_id, name FROM components WHERE id = $1',
        [component_id]
      );
      const postUpdate = postUpdateRows[0];
      if (postUpdate) {
        const centerResult = await query('SELECT name FROM centers WHERE id = $1', [postUpdate.center_id]);
        const centerName = centerResult.rows[0]?.name || 'Unknown Center';
        sendThresholdCrossingAlerts({
          componentName: postUpdate.name,
          centerId: postUpdate.center_id,
          centerName,
          previousAvailable: Number(component.available_quantity),
          currentAvailable: Number(postUpdate.available_quantity),
          totalQuantity: Number(postUpdate.total_quantity),
        }).catch((err) => {
          console.error('Threshold email alert handler failed:', err?.message || err);
        });
      }
    }

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await query('ROLLBACK');
    console.error('Transaction creation failed:', error);
    return res.status(500).json({ error: 'Failed to create inventory transaction' });
  }
});

router.get('/invoices', async (req, res) => {
  try {
    const result = await query('SELECT * FROM invoices ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (error) {
    console.error('Invoice fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load invoices' });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const {
      invoice_number,
      vendor_name,
      vendor_contact = null,
      items = [],
      subtotal = 0,
      tax_rate = 18,
      tax_amount = 0,
      total_amount = 0,
      center_id = null,
      status = 'pending',
      invoice_date = new Date().toISOString().split('T')[0],
      created_by = null,
    } = req.body;

    const result = await query(
      `INSERT INTO invoices (invoice_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, invoice_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [invoice_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, invoice_date, created_by]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Invoice creation failed:', error);
    return res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.patch('/invoices/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('invoices', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Invoice update failed:', error);
    return res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.get('/procurement/quotations', async (req, res) => {
  try {
    const result = await query('SELECT * FROM quotations ORDER BY created_at DESC');
    const mapped = result.rows.map((row) => ({
      ...row,
      valid_until: row.quote_date,
    }));
    return res.json(mapped);
  } catch (error) {
    console.error('Quotations fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load quotations' });
  }
});

router.post('/procurement/quotations', async (req, res) => {
  try {
    const {
      quotation_number,
      vendor_name,
      vendor_contact = null,
      items = [],
      subtotal = 0,
      tax_rate = 18,
      tax_amount = 0,
      total_amount = 0,
      center_id = null,
      status = 'draft',
      valid_until = null,
      notes = null,
      created_by = null,
    } = req.body;

    const result = await query(
      `INSERT INTO quotations (quote_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, quote_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [quotation_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, valid_until || new Date().toISOString().split('T')[0], created_by]
    );
    const row = result.rows[0];
    return res.status(201).json({ ...row, valid_until: row.quote_date });
  } catch (error) {
    console.error('Quotation creation failed:', error);
    return res.status(500).json({ error: 'Failed to create quotation' });
  }
});

router.patch('/procurement/quotations/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('quotations', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Quotation update failed:', error);
    return res.status(500).json({ error: 'Failed to update quotation' });
  }
});

router.get('/procurement/orders', async (req, res) => {
  try {
    const result = await query('SELECT * FROM orders ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (error) {
    console.error('Orders fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load purchase orders' });
  }
});

router.post('/procurement/orders', async (req, res) => {
  try {
    const {
      order_number,
      quotation_id = null,
      vendor_name,
      vendor_contact = null,
      items = [],
      subtotal = 0,
      tax_rate = 18,
      tax_amount = 0,
      total_amount = 0,
      center_id = null,
      status = 'pending',
      order_date = new Date().toISOString().split('T')[0],
      created_by = null,
    } = req.body;

    const result = await query(
      `INSERT INTO orders (order_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, order_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [order_number, vendor_name, vendor_contact, items, subtotal, tax_rate, tax_amount, total_amount, center_id, status, order_date, created_by]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Order creation failed:', error);
    return res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

router.patch('/procurement/orders/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('orders', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Order update failed:', error);
    return res.status(500).json({ error: 'Failed to update purchase order' });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const result = await query('SELECT * FROM reports ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (error) {
    console.error('Reports fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.post('/reports', async (req, res) => {
  try {
    const { report_type, title, center_id = null, period_start, period_end, data = {}, generated_by = null } = req.body;
    const result = await query(
      `INSERT INTO reports (report_type, title, center_id, period_start, period_end, data, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [report_type, title, center_id, period_start, period_end, data, generated_by]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Report creation failed:', error);
    return res.status(500).json({ error: 'Failed to create report' });
  }
});

router.get('/profiles', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.full_name, p.role, p.center_id, p.created_at, p.updated_at,
              c.name AS center_name, c.location AS center_location,
              u.email AS email
       FROM profiles p
       LEFT JOIN app_users u ON u.id = p.id
       LEFT JOIN centers c ON c.id = p.center_id
       ORDER BY p.full_name`
    );
    return res.json(result.rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      role: row.role,
      center_id: row.center_id,
      email: row.email ? String(row.email).toLowerCase() : '',
      created_at: row.created_at,
      updated_at: row.updated_at,
      center: row.center_name ? { id: row.center_id, name: row.center_name, location: row.center_location } : undefined,
    })));
  } catch (error) {
    console.error('Profiles fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load profiles' });
  }
});

router.patch('/profiles/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('profiles', req.params.id, req.body);
    if (!update) return res.status(400).json({ error: 'No fields to update' });
    const result = await query(update.sql, update.values);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile update failed:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/download/data-info', async (_req, res) => {
  const data = {
    source: 'Smart Inventory Forecasting System - Dummy Dataset Generator',
    generatedAt: new Date().toISOString(),
    dataset: {
      centers: [
        { id: 'CENTER-A', name: 'Center-A', location: 'Building 1' },
        { id: 'CENTER-B', name: 'Center-B', location: 'Building 2' },
      ],
      products: 5,
      timeRange: {
        startDate: '2025-12-01',
        endDate: '2026-02-28',
        daysOfData: 90,
      },
      recordCounts: {
        inventoryRecords: 900,
        transactionRecords: 1000,
      },
    },
  };
  return res.json(data);
});

router.get('/download/inventory-csv', async (_req, res) => {
  const data = generateSimpleInventory();
  const csv = convertToCSV(data);
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-dummy.csv"');
  res.type('text/csv').send(csv);
});

router.get('/download/transactions-csv', async (_req, res) => {
  const data = generateSimpleTransactions();
  const csv = convertToCSV(data);
  res.setHeader('Content-Disposition', 'attachment; filename="transactions-dummy.csv"');
  res.type('text/csv').send(csv);
});

router.get('/download/all-data-csv', async (_req, res) => {
  const inventory = generateSimpleInventory();
  const transactions = generateSimpleTransactions();
  const inventoryCsv = convertToCSV(inventory);
  const transactionCsv = convertToCSV(transactions);
  const combined = `INVENTORY_DATA\n${inventoryCsv}\n\nTRANSACTION_DATA\n${transactionCsv}`;
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-transactions-combined.csv"');
  res.type('text/csv').send(combined);
});

router.post('/notifications/stock-alert', async (req, res) => {
  try {
    const result = await sendStockAlert(req.body);
    return res.json({ success: true, results: result });
  } catch (error) {
    console.error('Stock alert failed:', error);
    return res.status(500).json({ error: 'Failed to send stock alert' });
  }
});

router.post('/notifications/bulk-stock-alert', async (req, res) => {
  try {
    const { centerId, sendFullBundle, email, phone, components, centerName, senderName } = req.body;

    if (sendFullBundle && centerId && email) {
      const { rows } = await query(
        `SELECT id, name, category, available_quantity, total_quantity, max_usage_limit, unit_cost, status, course_name, skill_tags
         FROM components WHERE center_id = $1`,
        [centerId]
      );
      const alertBundle = buildInventoryAlertsFromComponents(rows);
      const result = await sendInventoryAlertBundle({ email, phone, ...alertBundle });
      return res.json({ success: true, results: result, alertBundle });
    }

    const result = await sendBulkStockAlert({ email, phone, components, centerName, senderName });
    return res.json({ success: true, results: result });
  } catch (error) {
    console.error('Bulk stock alert failed:', error);
    return res.status(500).json({ error: 'Failed to send bulk stock alert' });
  }
});

router.post('/notifications/shortage-alert', async (req, res) => {
  try {
    const result = await sendShortageAlertEmail(req.body);
    return res.json({ success: true, results: result });
  } catch (error) {
    console.error('Shortage alert failed:', error);
    return res.status(500).json({ error: 'Failed to send shortage alert' });
  }
});

router.post('/notifications/purchase-recommendation', async (req, res) => {
  try {
    const result = await sendPurchaseRecommendationEmail(req.body);
    return res.json({ success: true, results: result });
  } catch (error) {
    console.error('Purchase recommendation failed:', error);
    return res.status(500).json({ error: 'Failed to send purchase recommendation' });
  }
});

router.post('/notifications/inventory-alerts', async (req, res) => {
  try {
    const { email, phone, centerId } = req.body;
    if (!email || !centerId) {
      return res.status(400).json({ error: 'email and centerId are required' });
    }
    const { rows } = await query(
      `SELECT id, name, category, available_quantity, total_quantity, max_usage_limit, unit_cost, status, course_name, skill_tags
       FROM components WHERE center_id = $1`,
      [centerId]
    );
    const alertBundle = buildInventoryAlertsFromComponents(rows);
    const result = await sendInventoryAlertBundle({ email, phone, ...alertBundle });
    return res.json({ success: true, results: result, alertBundle });
  } catch (error) {
    console.error('Inventory alerts failed:', error);
    return res.status(500).json({ error: 'Failed to send inventory alerts' });
  }
});

router.get('/notifications/check-stock', async (req, res) => {
  try {
    const { centerId, lowThreshold = 20, highThreshold = 80 } = req.query;
    
    let sql = `
      SELECT c.id, c.name, c.category, c.available_quantity as "currentQty", 
             c.total_quantity as "totalQty", c.center_id as "centerId", 
             c.max_usage_limit as "maxUsageLimit", c.unit_cost as "unitCost",
             c.status, c.course_name as "courseName", c.skill_tags as "skillTags",
             ctr.name as "centerName"
      FROM components c
      LEFT JOIN centers ctr ON c.center_id = ctr.id
    `;
    
    const values = [];
    if (centerId) {
      sql += ` WHERE c.center_id = $1`;
      values.push(centerId);
    }
    
    const { rows } = await query(sql, values);
    
    const lowStock = [];
    const highStock = [];
    
    rows.forEach(item => {
      const percentage = (item.currentQty / item.totalQty) * 100;
      if (percentage <= lowThreshold) {
        lowStock.push({ ...item, percentage, alertType: 'low_stock', threshold: lowThreshold });
      } else if (percentage >= highThreshold) {
        highStock.push({ ...item, percentage, alertType: 'high_stock', threshold: highThreshold });
      }
    });
    
    return res.json({
      lowStock,
      highStock,
      summary: {
        totalComponents: rows.length,
        lowStockCount: lowStock.length,
        highStockCount: highStock.length
      }
    });
  } catch (error) {
    console.error('Check stock levels failed:', error);
    return res.status(500).json({ error: 'Failed to check stock levels' });
  }
});

router.post('/admin/cleanup-duplicates', async (req, res) => {
  try {
    // 1. Sum up quantities for duplicate groups
    await query(`
      WITH duplicate_groups AS (
        SELECT name, center_id, 
               MIN(id) as keep_id,
               SUM(total_quantity) as sum_total,
               SUM(available_quantity) as sum_available
        FROM components
        GROUP BY name, center_id
        HAVING COUNT(*) > 1
      )
      UPDATE components c
      SET total_quantity = dg.sum_total,
          available_quantity = dg.sum_available,
          updated_at = NOW()
      FROM duplicate_groups dg
      WHERE c.id = dg.keep_id
    `);

    // 2. Delete the redundant records
    const deleteResult = await query(`
      DELETE FROM components
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM components
        GROUP BY name, center_id
      )
    `);

    return res.json({ 
      success: true, 
      message: `Inventory cleanup complete. Removed ${deleteResult.rowCount} duplicate records.` 
    });
  } catch (error) {
    console.error('Cleanup duplicates failed:', error);
    return res.status(500).json({ error: 'Failed to cleanup duplicates' });
  }
});

// Stock Alerts and Predictions
// Import TensorFlow.js
import * as tf from '@tensorflow/tfjs';

// Simple demand forecasting model using TensorFlow.js
const trainDemandModel = async () => {
  // Create a simple sequential model for regression
  const model = tf.sequential();
  
  // Input layer: [available_quantity, total_quantity, center_id_encoded, component_id_encoded]
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [4] }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'linear' })); // Regression output
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  
  // Generate some synthetic training data
  // Features: [available_qty, total_qty, center_code, component_code]
  // Target: predicted_demand_30_days
  const trainingData = [];
  const targets = [];
  
  for (let i = 0; i < 100; i++) {
    const available = Math.floor(Math.random() * 50);
    const total = available + Math.floor(Math.random() * 50);
    const centerCode = Math.random();
    const componentCode = Math.random();
    const demand = Math.max(5, Math.floor((total - available) * 2 + Math.random() * 20));
    
    trainingData.push([available, total, centerCode, componentCode]);
    targets.push(demand);
  }
  
  const xs = tf.tensor2d(trainingData);
  const ys = tf.tensor2d(targets, [100, 1]);
  
  // Train the model
  await model.fit(xs, ys, {
    epochs: 100,
    verbose: 0
  });
  
  return model;
};

let trainedModel = null;

// Initialize model on server start
trainDemandModel().then(model => {
  trainedModel = model;
  console.log('ML Demand Forecasting model trained successfully!');
}).catch(err => {
  console.error('Failed to train ML model:', err);
});

// Endpoint to get ML-powered stock alerts with predictions
router.get('/stock-alerts', async (req, res) => {
  try {
    const { rows: components } = await query(`
      SELECT c.*, cnt.name as center_name
      FROM components c
      JOIN centers cnt ON c.center_id = cnt.id
      WHERE c.status IN ('low_stock', 'out_of_stock')
      ORDER BY c.status DESC, c.updated_at DESC
    `);

    const alerts = [];
    for (const comp of components) {
      // Use ML model to predict demand
      let predictedDemand = Math.max(5, Math.ceil(comp.total_quantity * 0.3)); // Fallback
      
      if (trainedModel) {
        try {
          // Simple encoding for center and component IDs
          const centerCode = comp.center_id ? comp.center_id.charCodeAt(0) / 255 : 0.5;
          const componentCode = comp.id ? comp.id.charCodeAt(0) / 255 : 0.5;
          
          // Create input tensor
          const input = tf.tensor2d([[
            comp.available_quantity, 
            comp.total_quantity, 
            centerCode, 
            componentCode
          ]]);
          
          // Predict demand
          const prediction = trainedModel.predict(input);
          const predictionValue = prediction.dataSync()[0];
          predictedDemand = Math.max(5, Math.ceil(predictionValue));
          
          // Clean up
          input.dispose();
          prediction.dispose();
        } catch (err) {
          console.warn('ML prediction failed, using fallback:', err);
        }
      }
      
      // Find other centers with excess of this component
      const { rows: excessCenters } = await query(`
        SELECT c2.*, cnt2.name as center_name
        FROM components c2
        JOIN centers cnt2 ON c2.center_id = cnt2.id
        WHERE c2.name = $1 AND c2.center_id != $2
        AND (c2.available_quantity / c2.total_quantity) >= 0.7
        ORDER BY (c2.available_quantity / c2.total_quantity) DESC
      `, [comp.name, comp.center_id]);

      const transferOptions = excessCenters.map(ec => ({
        source_center_id: ec.center_id,
        source_center_name: ec.center_name,
        available_excess: ec.available_quantity - Math.ceil(ec.total_quantity * 0.5),
        suggested_transfer_quantity: Math.min(
          predictedDemand - comp.available_quantity,
          ec.available_quantity - Math.ceil(ec.total_quantity * 0.5)
        )
      })).filter(opt => opt.suggested_transfer_quantity > 0);

      alerts.push({
        id: `${comp.id}-${Date.now()}`,
        component_id: comp.id,
        component_name: comp.name,
        center_id: comp.center_id,
        center_name: comp.center_name,
        available_quantity: comp.available_quantity,
        total_quantity: comp.total_quantity,
        status: comp.status,
        predicted_demand_30_days: predictedDemand,
        recommendation: transferOptions.length > 0 ? 'transfer' : 'purchase',
        transfer_options: transferOptions,
        created_at: new Date().toISOString(),
        uses_ml_prediction: !!trainedModel
      });
    }

    return res.json(alerts);
  } catch (error) {
    console.error('Fetch stock alerts failed:', error);
    return res.status(500).json({ error: 'Failed to load stock alerts' });
  }
});

// Create split transfer requests
router.post('/hub-transfers/split', async (req, res) => {
  try {
    const { destination_center_id, component_id, splits, requested_by, notes } = req.body;
    
    await query('BEGIN');
    
    const parentId = crypto.randomUUID();
    
    // First create parent request (optional, for tracking)
    const totalQuantity = splits.reduce((sum, s) => sum + s.quantity, 0);
    await query(`
      INSERT INTO hub_transfer_requests 
      (id, source_center_id, destination_center_id, component_id, quantity, status, requested_by, notes)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
    `, [parentId, splits[0]?.source_center_id || null, destination_center_id, component_id, totalQuantity, requested_by, notes]);

    // Create individual split requests
    const createdTransfers = [];
    for (const split of splits) {
      const result = await query(`
        INSERT INTO hub_transfer_requests 
        (source_center_id, destination_center_id, component_id, quantity, status, requested_by, parent_transfer_id, notes)
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
        RETURNING *
      `, [split.source_center_id, destination_center_id, component_id, split.quantity, requested_by, parentId, notes]);
      createdTransfers.push(result.rows[0]);
    }

    await query('COMMIT');
    return res.status(201).json({ parent_id: parentId, transfers: createdTransfers });
  } catch (error) {
    await query('ROLLBACK');
    console.error('Create split transfers failed:', error);
    return res.status(500).json({ error: 'Failed to create split transfer requests' });
  }
});

// Hub Transfer Routes
router.get('/hub-transfers', async (req, res) => {
  try {
    const { center_id } = req.query;
    let sql = `
      SELECT ht.*, 
             c_src.name as source_center_name, 
             c_dest.name as destination_center_name,
             comp.name as component_name
      FROM hub_transfer_requests ht
      JOIN centers c_src ON ht.source_center_id = c_src.id
      JOIN centers c_dest ON ht.destination_center_id = c_dest.id
      JOIN components comp ON ht.component_id = comp.id
    `;
    const values = [];
    if (center_id) {
      sql += ' WHERE ht.source_center_id = $1 OR ht.destination_center_id = $1';
      values.push(center_id);
    }
    sql += ' ORDER BY ht.created_at DESC';
    const result = await query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Fetch hub transfers failed:', error);
    return res.status(500).json({ error: 'Failed to load transfer requests' });
  }
});

router.post('/hub-transfers', async (req, res) => {
  try {
    const { source_center_id, destination_center_id, component_id, quantity, requested_by, notes } = req.body;
    const result = await query(
      `INSERT INTO hub_transfer_requests (source_center_id, destination_center_id, component_id, quantity, requested_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [source_center_id, destination_center_id, component_id, quantity, requested_by, notes]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create hub transfer failed:', error);
    return res.status(500).json({ error: 'Failed to create transfer request' });
  }
});

// Update transfer status (supports multi-step approval)
router.patch('/hub-transfers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user_id } = req.body;

    await query('BEGIN');
    
    // Get transfer details
    const { rows } = await query('SELECT * FROM hub_transfer_requests WHERE id = $1', [id]);
    const transfer = rows[0];
    
    if (!transfer) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    const updateData = { status, updated_at: new Date() };

    if (status === 'main_admin_approved') {
      updateData.approved_by_main = user_id;
    } else if (status === 'source_center_approved') {
      updateData.approved_by_source = user_id;
    } else if (status === 'completed') {
      updateData.completed_by = user_id;
      
      // Actually perform the inventory transfer now
      // 1. Deduct from source component
      const deductRes = await query(
        'UPDATE components SET available_quantity = available_quantity - $1, updated_at = NOW() WHERE id = $2 AND available_quantity >= $1 RETURNING *',
        [transfer.quantity, transfer.component_id]
      );

      if (deductRes.rowCount === 0) {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient stock in source hub' });
      }

      // 2. Add to destination hub
      const sourceComp = deductRes.rows[0];
      const { rows: destCompRows } = await query(
        'SELECT id FROM components WHERE name = $1 AND center_id = $2',
        [sourceComp.name, transfer.destination_center_id]
      );

      if (destCompRows.length > 0) {
        await query(
          'UPDATE components SET total_quantity = total_quantity + $1, available_quantity = available_quantity + $1, updated_at = NOW() WHERE id = $2',
          [transfer.quantity, destCompRows[0].id]
        );
      } else {
        await query(
          `INSERT INTO components (name, category, description, sku, total_quantity, available_quantity, center_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
          [sourceComp.name, sourceComp.category, sourceComp.description, sourceComp.sku, transfer.quantity, transfer.quantity, transfer.destination_center_id]
        );
      }

      // Record transaction
      await query(
        `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, notes, session_date, performed_by)
         VALUES ($1, $2, 'transfer', $3, $4, CURRENT_DATE, $5)`,
        [transfer.component_id, transfer.source_center_id, transfer.quantity, `Transferred to Hub: ${transfer.destination_center_id}`, user_id]
      );
    }

    const updateQuery = buildUpdateQuery('hub_transfer_requests', id, updateData);
    if (!updateQuery) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await query(updateQuery.sql, updateQuery.values);
    await query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await query('ROLLBACK');
    console.error('Update hub transfer failed:', error);
    return res.status(500).json({ error: 'Failed to update transfer request' });
  }
});

router.post('/admin/clear-demo-data', async (req, res) => {
  try {
    await query('BEGIN');
    await query('DELETE FROM inventory_transactions');
    await query('DELETE FROM components');
    await query('DELETE FROM students');
    await query('DELETE FROM invoices');
    await query('DELETE FROM quotations');
    await query('DELETE FROM orders');
    await query('DELETE FROM reports');
    // Keep centers and profiles/users to maintain system access
    await query('COMMIT');
    return res.json({ success: true, message: 'All demo data cleared. System ready for manual entry.' });
  } catch (error) {
    await query('ROLLBACK');
    console.error('Clear data failed:', error);
    return res.status(500).json({ error: 'Failed to clear demo data' });
  }
});

router.post('/admin/reseed', async (req, res) => {
  try {
    const { seedStudentData } = await import('../seedData.js');
    await seedStudentData();
    return res.json({ success: true, message: 'Database reseeded with fresh demo data.' });
  } catch (error) {
    console.error('Reseed failed:', error);
    return res.status(500).json({ error: 'Failed to reseed database' });
  }
});

router.post('/admin/cleanup-dummy-hubs', async (req, res) => {
  try {
    const { cleanupDummyCenters, seedSampleActivity } = await import('../seedData.js');
    await cleanupDummyCenters();
    await seedSampleActivity();
    const { rows } = await query(`
      SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, location
      FROM centers ORDER BY LOWER(TRIM(name)), created_at ASC
    `);
    return res.json({
      success: true,
      message: 'Dummy hubs removed and sample activity refreshed.',
      hubCount: rows.length,
      hubs: rows,
    });
  } catch (error) {
    console.error('Cleanup dummy hubs failed:', error);
    return res.status(500).json({ error: 'Failed to cleanup dummy hubs' });
  }
});

router.post('/replenishment-requests', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    // #region debug-point C:replenishment-route-hit
    reportReplenishmentDebug('Replenishment POST route hit', {
      hypothesisId: 'C',
      method: req.method,
      url: req.originalUrl,
      bodyKeys: Object.keys(req.body || {}),
      userId: req.user?.id || null,
    });
    // #endregion debug-point C:replenishment-route-hit
    const { componentId, centerId, requiredQuantity, reason } = req.body;
    if (!componentId || !centerId || !requiredQuantity) {
      // #region debug-point D:replenishment-validation-failed
      reportReplenishmentDebug('Replenishment validation failed', {
        hypothesisId: 'D',
        componentId: Boolean(componentId),
        centerId: Boolean(centerId),
        requiredQuantity: Boolean(requiredQuantity),
      });
      // #endregion debug-point D:replenishment-validation-failed
      return res.status(400).json({ error: 'componentId, centerId, and requiredQuantity are required' });
    }

    await client.query('BEGIN');

    const componentResult = await client.query(
      `SELECT id, name, center_id, available_quantity, min_stock_threshold
       FROM components
       WHERE id = $1`,
      [componentId]
    );
    const component = componentResult.rows[0];
    if (!component) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Component not found' });
    }
    if (component.center_id !== centerId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Component does not belong to the selected center' });
    }

    const centerResult = await client.query(
      `SELECT id, name FROM centers WHERE id = $1`,
      [centerId]
    );
    const center = centerResult.rows[0];
    if (!center) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Center not found' });
    }

    const requestId = `RR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const forecast = await aiService.forecastDemand(componentId, centerId);
    const decision = await aiService.decideTransferOrPurchase(
      componentId,
      centerId,
      Number(requiredQuantity)
    );

    let allocation = null;
    if (decision.decisionType === 'TRANSFER') {
      allocation = await aiService.allocateTransfers(
        decision.availableExcess || [],
        Number(requiredQuantity),
        componentId,
        centerId
      );
    }

    const insertResult = await client.query(
      `INSERT INTO replenishment_requests (
        id,
        request_id,
        component_id,
        component_name,
        center_id,
        center_name,
        current_quantity,
        min_stock_threshold,
        required_quantity,
        reason,
        requested_by,
        ai_forecast_quantity,
        ai_forecast_confidence,
        ai_decision_type,
        ai_decision_confidence,
        ai_reason,
        ai_transfer_allocation,
        ai_debug_info,
        status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING *`,
      [
        crypto.randomUUID(),
        requestId,
        component.id,
        component.name,
        center.id,
        center.name,
        Number(component.available_quantity) || 0,
        Number(component.min_stock_threshold) || 0,
        Number(requiredQuantity),
        reason || `Low stock detected for ${component.name}`,
        req.user.id,
        Number(forecast.forecastQuantity) || Number(requiredQuantity),
        Number(forecast.confidenceScore) || 0.5,
        decision.decisionType,
        Number(decision.confidenceScore) || 0.5,
        decision.reason,
        allocation ? JSON.stringify(allocation.allocationPlan) : null,
        decision.debugInfo ? JSON.stringify(decision.debugInfo) : null,
        'PENDING_AI_REVIEW'
      ]
    );

    const adminRecipients = await client.query(
      `SELECT u.id
       FROM app_users u
       JOIN profiles p ON p.id = u.id
       WHERE p.role IN ('system_admin', 'main_admin', 'master_admin')`
    );

    for (const admin of adminRecipients.rows) {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, reference_id, reference_type, redirect_url, data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          admin.id,
          'New Replenishment Request',
          `${component.name} needs ${Number(requiredQuantity)} units at ${center.name}.`,
          'replenishment_request',
          insertResult.rows[0].id,
          'replenishment',
          '/ai-decision-center',
          JSON.stringify({
            replenishmentRequestId: insertResult.rows[0].id,
            requestId,
            componentId: component.id,
            componentName: component.name,
            centerId: center.id,
            centerName: center.name,
            aiDecisionType: decision.decisionType,
          }),
        ]
      );
    }

    // Automatically complete AI review
    const updatedResult = await client.query(
      `UPDATE replenishment_requests
       SET status = 'AI_REVIEW_COMPLETE', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [insertResult.rows[0].id]
    );

    await client.query('COMMIT');
    // #region debug-point E:replenishment-success
    reportReplenishmentDebug('Replenishment request created', {
      hypothesisId: 'E',
      requestId: updatedResult.rows[0]?.request_id || null,
      componentId,
      centerId,
      requiredQuantity: Number(requiredQuantity),
    });
    // #endregion debug-point E:replenishment-success
    return res.status(201).json(updatedResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    // #region debug-point E:replenishment-error
    reportReplenishmentDebug('Replenishment request failed', {
      hypothesisId: 'E',
      method: req.method,
      url: req.originalUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    // #endregion debug-point E:replenishment-error
    console.error('Create replenishment request failed:', error);
    return res.status(500).json({
      error: 'Failed to create replenishment request',
      details: error.message,
    });
  } finally {
    client.release();
  }
});

router.get('/replenishment-requests', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM replenishment_requests
       ORDER BY created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Get replenishment requests failed:', error);
    return res.status(500).json({ error: 'Failed to load replenishment requests' });
  }
});

// Endpoint to generate purchase request from replenishment request
router.post('/replenishment-requests/:id/generate-purchase-request', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Get replenishment request
    const repReqResult = await client.query('SELECT * FROM replenishment_requests WHERE id = $1', [id]);
    const replenishmentRequest = repReqResult.rows[0];
    if (!replenishmentRequest) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Replenishment request not found' });
    }

    // Generate purchase request ID
    const purchaseRequestId = `PR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Calculate estimated cost (use component's unit cost if available)
    let estimatedCost = null;
    const componentResult = await client.query(
      'SELECT unit_cost FROM components WHERE id = $1',
      [replenishmentRequest.component_id]
    );
    if (componentResult.rows.length > 0) {
      estimatedCost = Number(componentResult.rows[0].unit_cost || 0) * Number(replenishmentRequest.required_quantity);
    }

    // Insert into purchase_requests
    const insertResult = await client.query(
      `INSERT INTO purchase_requests (
        id,
        request_id,
        component_name,
        required_quantity,
        estimated_cost,
        destination_hub_id,
        reason,
        ai_decision_type,
        ai_decision_confidence,
        ai_reason,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        crypto.randomUUID(),
        purchaseRequestId,
        replenishmentRequest.component_name,
        Number(replenishmentRequest.required_quantity),
        estimatedCost,
        replenishmentRequest.center_id,
        replenishmentRequest.reason,
        replenishmentRequest.ai_decision_type,
        replenishmentRequest.ai_decision_confidence,
        replenishmentRequest.ai_reason,
        req.user.id,
        'PENDING_ADMIN_APPROVAL'
      ]
    );

    // Update replenishment request status
    await client.query(
      `UPDATE replenishment_requests
       SET status = 'PURCHASE_REQUEST_GENERATED', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Notify admins
    const adminRecipients = await client.query(
      `SELECT u.id
       FROM app_users u
       JOIN profiles p ON p.id = u.id
       WHERE p.role IN ('system_admin', 'main_admin', 'master_admin')`
    );

    for (const admin of adminRecipients.rows) {
      await client.query(
        `INSERT INTO notifications (
          user_id, title, message, type, reference_id, reference_type, redirect_url, data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          admin.id,
          'New Purchase Request',
          `${replenishmentRequest.component_name} purchase request generated for ${replenishmentRequest.center_name}.`,
          'purchase_approval',
          insertResult.rows[0].id,
          'purchase',
          '/purchase-approval-center',
          JSON.stringify({
            purchaseRequestId: insertResult.rows[0].id,
            requestId: purchaseRequestId,
            replenishmentRequestId: id,
            componentName: replenishmentRequest.component_name,
            centerName: replenishmentRequest.center_name
          })
        ]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Generate purchase request failed:', error);
    return res.status(500).json({ error: 'Failed to generate purchase request', details: error.message });
  } finally {
    client.release();
  }
});

// Endpoint to mark AI review as complete (transitions from PENDING_AI_REVIEW → AI_REVIEW_COMPLETE)
router.patch('/replenishment-requests/:id/complete-ai-review', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE replenishment_requests
       SET status = 'AI_REVIEW_COMPLETE', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Replenishment request not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Complete AI review failed:', error);
    return res.status(500).json({ error: 'Failed to complete AI review' });
  }
});

export default router;
