/**
 * API origin:
 * - VITE_API_URL when set (any mode)
 * - In dev, default '' = same origin so Vite proxies /api → backend (see vite.config.ts). Run `npm run dev` to start both.
 * - In production, '' = same host (configure reverse proxy for /api).
 */
function apiBase(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '';
  }
  return '';
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    rest.body = JSON.stringify(json);
  }
  const url = `${apiBase()}${path}`;
  let res: Response;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    res = await fetch(url, { ...rest, headers, signal: ctrl.signal });
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      isAbort
        ? 'Request timed out. Is the API running? Use npm run dev (starts API + site) or npm run dev:server.'
        : 'Cannot reach the API server. From the project folder run npm run dev (starts the API on port 8787 and the website). PostgreSQL must be running. Frontend-only: npm run dev:web plus npm run dev:server in another terminal.',
      0
    );
  } finally {
    clearTimeout(t);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    let msg =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: string }).error)
        : res.statusText;
    const detail =
      typeof parsed === 'object' && parsed !== null && 'detail' in parsed
        ? String((parsed as { detail: string }).detail)
        : '';
    if (detail) msg = `${msg}: ${detail}`;
    if (import.meta.env.DEV && (res.status === 502 || res.status === 503 || res.status === 504)) {
      msg +=
        ' — The dev proxy could not reach the API. Ensure the backend is running. From the project folder run npm run dev (starts API + Vite). The API uses PostgreSQL when DATABASE_URL works; otherwise it falls back to in-memory data.';
    }
    if (res.status === 404 && path.startsWith('/api')) {
      const origin = (apiBase() || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
      const apiRoot = `${origin}/api`;
      msg += ` — Verify GET ${apiRoot} (JSON with "app":"smart-inventory-api") and GET ${apiRoot}/health. If those work, this request path may be wrong. From the project folder run npm run dev.`;
    }
    throw new ApiError(msg, res.status);
  }
  return parsed as T;
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, json?: unknown) {
  return apiRequest<T>(path, { method: 'POST', json });
}

export function apiPatch<T>(path: string, json?: unknown) {
  return apiRequest<T>(path, { method: 'PATCH', json });
}

export function apiDelete(path: string) {
  return apiRequest<void>(path, { method: 'DELETE' });
}
