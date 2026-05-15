import express from 'express';
import cors from 'cors';
import { PORT } from './config/env.js';
import studentRoutes from './routes/studentRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import pool from './config/db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Ignore self-signed certificates in the entire Node.js process (useful for local SMTP/development)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Routes
app.use('/api', apiRoutes);
app.use('/api/student', studentRoutes);

import { seedStudentData } from './seedData.js';

// Database Initialization
const initDb = async () => {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
};

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
  await initDb();
  await seedStudentData();
  console.log(`Smart IoT Inventory Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Student Module APIs ready for Flutter integration`);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});
