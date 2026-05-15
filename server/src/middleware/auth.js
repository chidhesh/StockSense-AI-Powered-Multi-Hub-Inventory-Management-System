import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

export const authMiddleware = (req, res, next) => {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireMaster = (req, res, next) => {
  const role = req.auth?.role;
  const isMaster = role === 'master_admin' || role?.toLowerCase() === 'system administrator';
  if (!isMaster) return res.status(403).json({ error: 'Master admin only' });
  next();
};

export const isManager = (role) => {
  const r = String(role).trim().toLowerCase();
  return r === 'center_admin' || r === 'inventory manager';
};
