import { bridge, isVkEnvironment, initVkBridge, withTimeout } from '../utils/vkBridgeClient';
import {
  captureLaunchParamsEarly,
  isValidLaunchParamsString,
  persistLaunchParams,
  readLaunchParamsFromLocation,
  serializeLaunchParamsFromBridge,
} from '../utils/launchParams';

// Capture before React/router can rewrite location.hash (VK hash router drops #?vk_* on navigate).
const earlyLaunchParams = typeof window !== 'undefined' ? captureLaunchParamsEarly() : null;

function normalizeApiUrl(url: string): string {
  if (!url) return '/api';
  let normalized = url.trim();
  if (!normalized.startsWith('/') && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(normalized);
  if (normalized.startsWith('http://') && !isLocalhost) {
    normalized = normalized.replace(/^http:\/\//, 'https://');
  }
  return normalized;
}

const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost') 
      ? normalizeApiUrl(import.meta.env.VITE_API_URL) 
      : 'https://zuevpu-mashuk2026-ae82.twc1.net/api')
  : normalizeApiUrl(import.meta.env.VITE_API_URL || '/api');

// Fallback handles production URL

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let cachedLaunchParams: string | null = null;
let authInitPromise: Promise<void> | null = null;

function extractLaunchParamsFromUrl(): string | null {
  return readLaunchParamsFromLocation();
}

function serializeLaunchParams(raw: unknown): string {
  return serializeLaunchParamsFromBridge(raw);
}

export async function initAuth(): Promise<void> {
  if (authInitPromise) return authInitPromise;
  authInitPromise = (async () => {
    if (cachedLaunchParams) return;

    if (isValidLaunchParamsString(earlyLaunchParams)) {
      cachedLaunchParams = earlyLaunchParams;
      return;
    }

    const fromUrl = extractLaunchParamsFromUrl();
    if (fromUrl) {
      cachedLaunchParams = fromUrl;
      persistLaunchParams(fromUrl);
      return;
    }

    if (isVkEnvironment()) {
      try {
        await initVkBridge();
        const raw = await withTimeout(bridge.send('VKWebAppGetLaunchParams'), 8000) as unknown;
        const launchStr = serializeLaunchParams(raw);
        if (isValidLaunchParamsString(launchStr)) {
          cachedLaunchParams = launchStr;
          persistLaunchParams(launchStr);
          return;
        }
      } catch (e) {
        console.warn('VKWebAppGetLaunchParams failed', e);
      }
    }

    try {
      const stored = sessionStorage.getItem('mashuk_vk_launch_params');
      if (isValidLaunchParamsString(stored)) {
        cachedLaunchParams = stored;
      }
    } catch {
      // ignore
    }
  })();
  return authInitPromise;
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cachedLaunchParams) {
    headers['Authorization'] = `Bearer ${cachedLaunchParams}`;
  } else if (!import.meta.env.PROD) {
    headers['X-Test-Vk-Id'] = '1';
  }
  const shiftId = getStoredShiftId();
  if (shiftId) headers['X-Shift-Id'] = String(shiftId);
  return headers;
}

function ensureAuthReady(): void {
  if (import.meta.env.PROD && !cachedLaunchParams) {
    throw new ApiError(
      'Откройте приложение через VK Mini App. В обычном браузере авторизация недоступна.',
      401,
    );
  }
}

function parseApiErrorMessage(status: number, text: string): string {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const body = JSON.parse(trimmed) as { error?: string; message?: string; code?: string; min?: number; current?: number };
      const code = String(body.code || body.error || '');
      if (code === 'NO_CATEGORY') {
        return typeof body.error === 'string' && body.error !== 'NO_CATEGORY'
          ? body.error
          : 'Выберите тему вопроса — без рубрики опубликовать нельзя';
      }
      if (code === 'TEXT_TOO_SHORT') {
        return typeof body.error === 'string' && body.error !== 'TEXT_TOO_SHORT'
          ? body.error
          : `Добавьте деталей. Сейчас ${body.current ?? 0} из ${body.min ?? 60} символов.`;
      }
      if (code === 'ANSWER_TOO_SHORT') {
        return typeof body.error === 'string' && body.error !== 'ANSWER_TOO_SHORT'
          ? body.error
          : 'Похоже, это реакция, а не ответ. Нажмите 👍 под вопросом — автор увидит.';
      }
      if (typeof body.error === 'string' && body.error) return body.error;
      if (typeof body.message === 'string' && body.message) return body.message;
    } catch {
      if (trimmed.length <= 200 && !trimmed.startsWith('<')) return trimmed;
    }
  }
  if (status === 401) return 'Нужна авторизация через VK Mini App';
  if (status === 403) return 'Доступ запрещён';
  if (status === 404) return 'Не найдено';
  if (status === 400) return 'Некорректный запрос';
  if (status === 422) return 'Проверьте заполнение формы';
  return `Ошибка сервера (${status})`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const message = parseApiErrorMessage(res.status, text);
    throw new ApiError(message, res.status);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || text.trimStart().startsWith('<!')) {
    throw new ApiError(
      'API returned HTML instead of JSON. Check VITE_API_URL points to the backend (https://...ae82.../api).',
      res.status,
    );
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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

export async function apiGet<T>(path: string): Promise<T> {
  await initAuth();
  ensureAuthReady();
  const res = await fetchWithRetry(`${API_URL}${path}`, { headers: getAuthHeaders() });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  await initAuth();
  ensureAuthReady();
  const res = await fetchWithRetry(`${API_URL}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  await initAuth();
  ensureAuthReady();
  const res = await fetchWithRetry(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiDownloadBlob(path: string): Promise<Blob> {
  await initAuth();
  ensureAuthReady();
  const res = await fetchWithRetry(`${API_URL}${path}`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) message = j.error;
    } catch { /* plain text */ }
    throw new ApiError(message, res.status);
  }
  return res.blob();
}

export function getHashSearchParams(): URLSearchParams {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.split('?')[1] : '';
  return new URLSearchParams(query || window.location.search.slice(1));
}

export function getApiUrl(): string {
  return API_URL;
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
  const origin = mediaOriginFromApiBase(API_URL);
  const fromUploadsPath = (pathname: string) => {
    const marker = '/uploads/';
    const idx = pathname.indexOf(marker);
    const name = (idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\/uploads\//, ''))
      .split(/[?#]/)[0];
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return raw;
    return origin ? `${origin}/uploads/${name}` : `/uploads/${name}`;
  };
  if (raw.includes('/uploads/')) {
    try {
      const parsed = raw.startsWith('http') ? new URL(raw) : null;
      const pathname = parsed?.pathname || raw;
      const local = parsed ? /localhost|127\.0\.0\.1/i.test(parsed.hostname) : false;
      if (!parsed || local || origin || raw.startsWith('/uploads/')) {
        return fromUploadsPath(pathname.startsWith('/') ? pathname : `/${pathname}`);
      }
    } catch {
      return fromUploadsPath(raw);
    }
  }
  return raw;
}

const SHIFT_ID_KEY = 'mashuk-shift-id';

export function getStoredShiftId(): number | null {
  try {
    const raw = localStorage.getItem(SHIFT_ID_KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setStoredShiftId(id: number | null): void {
  try {
    if (id == null || id <= 0) localStorage.removeItem(SHIFT_ID_KEY);
    else localStorage.setItem(SHIFT_ID_KEY, String(id));
  } catch {
    // ignore quota / private mode
  }
}

const SHIFT_CHOICE_KEY = 'mashuk-shift-choice-done';

export function getShiftChoiceDone(): boolean {
  try {
    return sessionStorage.getItem(SHIFT_CHOICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setShiftChoiceDone(done = true): void {
  try {
    if (done) sessionStorage.setItem(SHIFT_CHOICE_KEY, '1');
    else sessionStorage.removeItem(SHIFT_CHOICE_KEY);
    localStorage.removeItem(SHIFT_CHOICE_KEY);
  } catch {
    // ignore quota / private mode
  }
}
