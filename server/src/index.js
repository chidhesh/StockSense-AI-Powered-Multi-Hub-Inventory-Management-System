import express from 'express';
import cors from 'cors';
import { PORT } from './config/env.js';
import studentRoutes from './routes/studentRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import pool from './config/db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixAllComponentAvailability } from './lib/availability-fix.js';

// Ignore self-signed certificates in the entire Node.js process (useful for local SMTP/development)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Routes
app.use('/api', apiRoutes);
app.use('/api/student', studentRoutes);
app.use('/api', transferRoutes);

// Add ai_debug_info column if it doesn't exist
const addDebugInfoColumn = async () => {
  try {
    await pool.query('ALTER TABLE replenishment_requests ADD COLUMN IF NOT EXISTS ai_debug_info jsonb');
    console.log('ai_debug_info column added/verified successfully');
  } catch (error) {
    console.error('Failed to add ai_debug_info column:', error);
  }
};

// Add missing columns to notifications table
const addNotificationColumns = async () => {
  try {
    await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id text');
    await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_type text CHECK (reference_type IN (\'replenishment\', \'purchase\', \'transfer\', \'component\'))');
    await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS redirect_url text');
    await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data jsonb DEFAULT \'{}\'');
    await pool.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
    await pool.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
      type IN (
        'low_stock',
        'transfer_recommendation',
        'transfer_approval',
        'transfer_dispatch',
        'transfer_delivery',
        'purchase_approval',
        'purchase_ordered',
        'purchase_delivered',
        'inventory_update',
        'replenishment_request',
        'system'
      )
    )`);
    console.log('Notifications columns added/verified successfully');
  } catch (error) {
    console.error('Failed to add notifications columns:', error);
  }
};

// Database Initialization
const initDb = async () => {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    await addNotificationColumns();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
};

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
  await initDb();
  await addDebugInfoColumn();
  await fixAllComponentAvailability();
  console.log('Persistent PostgreSQL detected; no demo data seeding');
  console.log(`Smart IoT Inventory Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Student Module APIs ready for Flutter integration`);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});
// End of file
