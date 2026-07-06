import { bridge, isVkEnvironment, initVkBridge, withTimeout } from '../utils/vkBridgeClient';

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
  const candidates = [
    window.location.search.slice(1),
    window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '',
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const params = new URLSearchParams(raw);
    if (params.get('sign') || params.get('vk_user_id')) {
      return raw;
    }
  }
  return null;
}

function serializeLaunchParams(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, string>)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
  }
  return '';
}

export async function initAuth(): Promise<void> {
  if (authInitPromise) return authInitPromise;
  authInitPromise = (async () => {
    if (cachedLaunchParams) return;

    const fromUrl = extractLaunchParamsFromUrl();
    if (fromUrl) {
      cachedLaunchParams = fromUrl;
      return;
    }

    if (isVkEnvironment()) {
      try {
        await initVkBridge();
        const raw = await withTimeout(bridge.send('VKWebAppGetLaunchParams'), 5000) as unknown;
        const launchStr = serializeLaunchParams(raw);
        if (launchStr.includes('sign=') || launchStr.includes('vk_user_id=')) {
          cachedLaunchParams = launchStr;
          return;
        }
      } catch (e) {
        console.warn('VKWebAppGetLaunchParams failed', e);
      }
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

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}: ${text}`, res.status);
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

export function getHashSearchParams(): URLSearchParams {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.split('?')[1] : '';
  return new URLSearchParams(query || window.location.search.slice(1));
}

export function getApiUrl(): string {
  return API_URL;
}
