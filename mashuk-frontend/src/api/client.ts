import { bridge, isVkEnvironment } from '../utils/vkBridgeClient';

function normalizeApiUrl(url: string): string {
  if (!url) return '/api';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
}

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL || '/api');

let cachedLaunchParams: string | null = null;
let authInitPromise: Promise<void> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function initAuth(): Promise<void> {
  if (authInitPromise) return authInitPromise;
  authInitPromise = (async () => {
    if (cachedLaunchParams) return;

    if (isVkEnvironment()) {
      try {
        const raw = await bridge.send('VKWebAppGetLaunchParams') as unknown;
        let launchStr = '';
        if (typeof raw === 'string') {
          launchStr = raw;
        } else if (raw && typeof raw === 'object') {
          launchStr = Object.entries(raw as Record<string, string>)
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
            .join('&');
        }
        if (launchStr.includes('vk_')) {
          cachedLaunchParams = launchStr;
          return;
        }
      } catch (e) {
        console.warn('VKWebAppGetLaunchParams failed', e);
      }
    }

    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.split('?')[1]
      : '';
    const search = window.location.search.slice(1);
    const launch = hashQuery || search;
    if (launch && launch.includes('vk_')) {
      cachedLaunchParams = launch;
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
  } else {
    headers['X-Test-Vk-Id'] = '1';
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(`HTTP ${res.status}: ${text}`, res.status);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  await initAuth();
  const res = await fetch(`${API_URL}${path}`, { headers: getAuthHeaders() });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  await initAuth();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  await initAuth();
  const res = await fetch(`${API_URL}${path}`, {
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
