const ADMIN_TOKEN_KEY = 'mashuk_admin_token';
const ADMIN_SHIFT_ID_KEY = 'mashuk_admin_shift_id';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export const ADMIN_SHIFT_CHANGED_EVENT = 'mashuk-admin-shift-changed';

export function getAdminEditingShiftId(): number | null {
  const raw = sessionStorage.getItem(ADMIN_SHIFT_ID_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setAdminEditingShiftId(id: number | null): void {
  const prev = getAdminEditingShiftId();
  const next = id != null && Number.isFinite(id) && id > 0 ? id : null;
  if (prev === next) return;
  if (next != null) sessionStorage.setItem(ADMIN_SHIFT_ID_KEY, String(next));
  else sessionStorage.removeItem(ADMIN_SHIFT_ID_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_SHIFT_CHANGED_EVENT, { detail: next }));
  }
}

function adminAuthHeaders(extra?: HeadersInit): Record<string, string> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token || ''}`,
  };
  const shiftId = getAdminEditingShiftId();
  if (shiftId != null) headers['X-Admin-Shift-Id'] = String(shiftId);
  if (extra) {
    const h = new Headers(extra);
    h.forEach((value, key) => {
      headers[key] = value;
    });
  }
  return headers;
}

function normalizeApiUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim();
  if (!normalized.startsWith('/') && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(normalized);
  if (normalized.startsWith('http://') && !isLocalhost) {
    normalized = normalized.replace(/^http:\/\//, 'https://');
  }
  return normalized.replace(/\/$/, '');
}

export const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost')
    ? normalizeApiUrl(import.meta.env.VITE_API_URL)
    : 'https://zuevpu-mashuk2026-ae82.twc1.net/api')
  : normalizeApiUrl(import.meta.env.VITE_API_URL || '');

export function getAdminApiBase(): string {
  return API_BASE ? `${API_BASE}/admin` : '/api/admin';
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('api-error', { detail: 'Ошибка сети. Проверьте подключение.' }));
        }
        throw e;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

export async function adminLogin(login: string, password: string) {
  const base = getAdminApiBase();
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  const data = text ? JSON.parse(text) : null;
  if (!data?.token) throw new Error('Сервер не вернул токен');
  setAdminToken(data.token);
  return data;
}

function parseAdminErrorResponse(status: number, text: string): string {
  if (status === 429) {
    return 'Слишком много запросов. Подождите минуту и обновите страницу.';
  }
  if (!text) return `HTTP ${status}`;
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    if (typeof body.error === 'string' && body.error) return body.error;
    if (typeof body.message === 'string' && body.message) return body.message;
  } catch {
    if (text.length <= 300 && !text.trimStart().startsWith('<')) return text;
  }
  return `HTTP ${status}`;
}

export async function adminFetch(path: string, options: RequestInit = {}) {
  const base = getAdminApiBase();
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.');
  }
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetchWithRetry(`${base}${path}`, {
    ...options,
    headers: adminAuthHeaders({
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }),
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new Error('Сессия истекла. Войдите снова.');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(parseAdminErrorResponse(res.status, text));
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || text.trimStart().startsWith('<!')) {
    throw new Error(
      'API вернул HTML вместо JSON. Проверьте VITE_API_URL в Timeweb Apps и пересоберите админку.',
    );
  }
  if (ct.includes('text/csv')) return text;
  return text ? JSON.parse(text) : null;
}

export function downloadCsv(path: string, filename: string) {
  adminFetch(path).then((csv: unknown) => {
    const blob = new Blob([csv as string], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }).catch(console.error);
}

export async function adminDownloadBinary(path: string, filename: string) {
  const base = getAdminApiBase();
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetch(`${base}${path}`, {
    headers: adminAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export async function adminFetchHtml(path: string): Promise<string> {
  const base = getAdminApiBase();
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetch(`${base}${path}`, {
    headers: adminAuthHeaders(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text;
}
