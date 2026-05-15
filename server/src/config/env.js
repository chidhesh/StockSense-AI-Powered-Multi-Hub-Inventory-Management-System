import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const PORT = process.env.PORT || 8787;
export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-replace-in-production';
export const PGMEM_FALLBACK = process.env.PGMEM_FALLBACK !== 'false';
export const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:5000';
export const EMAIL_USER = process.env.EMAIL_USER || process.env.SMTP_USER;
export const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASS;
