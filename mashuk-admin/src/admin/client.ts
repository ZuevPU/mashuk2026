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

export function adminAuthHeaders(extra?: HeadersInit): Record<string, string> {
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

function mediaOriginFromApiBase(apiBase: string): string {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (!base || base.startsWith('/')) return '';
  return base.replace(/\/api$/i, '');
}

/** Makes /uploads and localhost upload URLs load from the live API host. */
export function resolvePublicMediaUrl(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const origin = mediaOriginFromApiBase(API_BASE);
  const fromUploadsPath = (pathname: string) => {
    const name = pathname.replace(/^\/uploads\//, '');
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return raw;
    return origin ? `${origin}/uploads/${name}` : `/uploads/${name}`;
  };
  if (raw.startsWith('/uploads/')) return fromUploadsPath(raw);
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/uploads/')) {
      const local = /localhost|127\.0\.0\.1/i.test(parsed.hostname);
      if (local || origin) return fromUploadsPath(parsed.pathname);
    }
  } catch {
    // keep original
  }
  return raw;
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException
    ? e.name === 'AbortError'
    : Boolean(e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError');
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const res = await fetch(url, options);
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (isAbortError(e) || options.signal?.aborted) throw e;
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
    // charset + BOM from API so Excel opens Cyrillic correctly
    const blob = new Blob([csv as string], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }).catch(console.error);
}

/** Save a data: URL (e.g. QR PNG) as a file — window.open(dataUrl) is blocked after async. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl) throw new Error('Пустой файл');
  let href = dataUrl;
  let revoke: string | null = null;
  if (dataUrl.startsWith('data:')) {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('Некорректный data URL');
    const header = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const isBase64 = /;base64/i.test(header);
    const bytes = isBase64
      ? Uint8Array.from(atob(payload), c => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    revoke = URL.createObjectURL(new Blob([bytes], { type: mime }));
    href = revoke;
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) URL.revokeObjectURL(revoke);
}

export async function adminDownloadBinary(path: string, filename: string) {
  const base = getAdminApiBase();
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.');
  }
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetch(`${base}${path}`, {
    headers: adminAuthHeaders(),
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new Error('Сессия истекла. Войдите снова.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(parseAdminErrorResponse(res.status, text));
  }
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) throw new Error('Сервер вернул пустой файл');

  const head = new Uint8Array(buf.slice(0, 8));
  const asText = new TextDecoder().decode(head);
  const looksZip = head[0] === 0x50 && head[1] === 0x4b; // PK — xlsx/zip
  const looksPdf = asText.startsWith('%PDF');
  const looksHtml = asText.trimStart().startsWith('<!') || asText.trimStart().startsWith('<html');
  const looksJson = asText.trimStart().startsWith('{') || asText.trimStart().startsWith('[');
  const lowerName = filename.toLowerCase();

  if (looksHtml) {
    throw new Error('API вернул HTML вместо файла. Проверьте VITE_API_URL и пересоберите админку.');
  }
  if (lowerName.endsWith('.xlsx') && !looksZip) {
    if (looksJson) {
      throw new Error('Сервер вернул JSON вместо Excel. Обновите админку/бэкенд или скачайте «Выгрузить всё» заново.');
    }
    throw new Error(
      'Файл не является Excel (.xlsx). Часто это CSV/текст, сохранённый с неверным расширением — обновите страницу (Ctrl+F5) после деплоя.',
    );
  }
  if (lowerName.endsWith('.pdf') && !looksPdf) {
    throw new Error('Сервер вернул не PDF. Попробуйте ещё раз или проверьте права экспорта.');
  }

  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const blob = new Blob([buf], { type: ct });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Не отзывать сразу — иначе Chrome/Edge иногда сохраняют битый/пустой файл.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function adminFetchHtml(path: string): Promise<string> {
  const base = getAdminApiBase();
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Не задан VITE_API_URL. Укажите его в Timeweb Apps и пересоберите админку.');
  }
  const token = getAdminToken();
  if (!token) throw new Error('Не авторизован');
  const res = await fetch(`${base}${path}`, {
    headers: adminAuthHeaders(),
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new Error('Сессия истекла. Войдите снова.');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(parseAdminErrorResponse(res.status, text));
  return text;
}
