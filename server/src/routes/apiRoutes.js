import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query } from '../config/db.js';
import { JWT_SECRET } from '../config/env.js';
import { sendStockAlert, sendBulkStockAlert } from '../notificationService.js';
import { generateSimpleInventory, generateSimpleTransactions, convertToCSV } from '../simpleDummyDataGenerator.js';

const router = express.Router();

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
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

  const alertType = enteredOutOfStock ? 'low_stock' : 'low_stock';
  const componentAlert = {
    componentName,
    currentQty: currentAvailable,
    threshold: lowThreshold,
    alertType,
  };

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

  const senderName = 'Smart Inventory System';
  await Promise.all(
    recipients.map((email) =>
      sendBulkStockAlert({
        email,
        phone: null,
        components: [componentAlert],
        centerName,
        senderName,
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
    const result = await query('SELECT id, name, location, admin_name, contact_email, contact_phone, capacity, type, created_at, updated_at FROM centers ORDER BY name');
    return res.json(result.rows);
  } catch (error) {
    console.error('Public centers failed:', error);
    return res.status(500).json({ error: 'Failed to load centers' });
  }
});

router.get('/centers', async (req, res) => {
  try {
    const result = await query('SELECT * FROM centers ORDER BY name');
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
    // Only apply filter if center_id is a non-empty string and not 'undefined'
    if (center_id && center_id !== 'undefined' && center_id !== 'null' && center_id.length > 10) {
      sql += ' WHERE center_id = $1';
      values.push(center_id);
    }
    sql += ' ORDER BY name';
    const result = await query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Components fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load components' });
  }
});

router.post('/components', async (req, res) => {
  try {
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
    } = req.body;

    const result = await query(
      `INSERT INTO components (name, category, description, sku, qr_code, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (name, center_id) DO UPDATE SET
         total_quantity = components.total_quantity + EXCLUDED.total_quantity,
         available_quantity = components.available_quantity + EXCLUDED.available_quantity,
         updated_at = NOW()
       RETURNING *`,
      [name, category, description, sku, qr_code, total_quantity, available_quantity, max_usage_limit, usage_count, unit_cost, center_id, status]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Component creation failed:', error);
    return res.status(500).json({ error: 'Failed to create component' });
  }
});

router.patch('/components/:id', async (req, res) => {
  try {
    const update = buildUpdateQuery('components', req.params.id, req.body);
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
    if (center_id && center_id !== 'undefined' && center_id !== 'null' && center_id.length > 10) {
      sql += ' WHERE center_id = $1';
      values.push(center_id);
    }
    sql += ' ORDER BY full_name';
    const result = await query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    console.error('Students fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load students' });
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

    if (student_uuid) {
      values.push(String(student_uuid));
      filters.push(`it.student_uuid = $${values.length}`);
    }
    if (component_id) {
      values.push(String(component_id));
      filters.push(`it.component_id = $${values.length}`);
    }
    if (center_id && center_id !== 'undefined' && center_id !== 'null' && center_id.length > 10) {
      values.push(String(center_id));
      filters.push(`it.center_id = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const maxLimit = Math.min(Number(limit) || 1000, 10000);
    const result = await query(`
      SELECT it.*, c.name as component_name, c.sku as component_sku 
      FROM inventory_transactions it
      LEFT JOIN components c ON it.component_id = c.id
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

    if (transaction_type === 'issue') {
      if (component.available_quantity < quantity) {
        await query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for ${component.name}. Available: ${component.available_quantity}` });
      }

      // 2. Decrease stock
      await query(
        'UPDATE components SET available_quantity = available_quantity - $1, updated_at = NOW() WHERE id = $2',
        [quantity, component_id]
      );
    } else if (transaction_type === 'return') {
      // 2. Increase stock
      await query(
        'UPDATE components SET available_quantity = available_quantity + $1, updated_at = NOW() WHERE id = $2',
        [quantity, component_id]
      );
    } else if (transaction_type === 'damaged') {
      // For damaged items, we might decrease available but keep total? 
      // Usually, damaged items are removed from available stock.
      await query(
        'UPDATE components SET available_quantity = available_quantity - $1, updated_at = NOW() WHERE id = $2',
        [quantity, component_id]
      );
    }

    const { rows: postUpdateRows } = await query(
      'SELECT available_quantity, total_quantity, center_id, name FROM components WHERE id = $1',
      [component_id]
    );
    const postUpdate = postUpdateRows[0];

    // 3. Record the transaction
    const result = await query(
      `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, usage_count, notes, performed_by, session_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [component_id, center_id, transaction_type, quantity, student_uuid, student_name, student_id, usage_count, notes, performed_by, session_date]
    );

    await query('COMMIT');

    if (postUpdate && (transaction_type === 'issue' || transaction_type === 'damaged')) {
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
      `SELECT p.id, p.full_name, p.role, p.center_id, p.created_at, p.updated_at, c.name AS center_name, c.location AS center_location
       FROM profiles p
       LEFT JOIN centers c ON c.id = p.center_id
       ORDER BY p.full_name`
    );
    return res.json(result.rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      role: row.role,
      center_id: row.center_id,
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
    const result = await sendBulkStockAlert(req.body);
    return res.json({ success: true, results: result });
  } catch (error) {
    console.error('Bulk stock alert failed:', error);
    return res.status(500).json({ error: 'Failed to send bulk stock alert' });
  }
});

router.get('/notifications/check-stock', async (req, res) => {
  try {
    const { centerId, lowThreshold = 20, highThreshold = 80 } = req.query;
    
    let sql = `
      SELECT c.id, c.name, c.category, c.available_quantity as "currentQty", 
             c.total_quantity as "totalQty", c.center_id as "centerId", 
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

export default router;
