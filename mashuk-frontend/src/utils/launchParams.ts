const STORAGE_KEY = 'mashuk_vk_launch_params';

/** Read VK launch params from URL before the hash router rewrites location.hash. */
export function readLaunchParamsFromLocation(): string | null {
  const candidates: string[] = [];

  const search = window.location.search;
  if (search.length > 1) {
    candidates.push(search.startsWith('?') ? search.slice(1) : search);
  }

  const hash = window.location.hash;
  if (hash.startsWith('#?')) {
    candidates.push(hash.slice(2));
  } else if (hash.includes('?')) {
    candidates.push(hash.slice(hash.indexOf('?') + 1));
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const params = new URLSearchParams(raw);
    if (params.get('sign') || params.get('vk_user_id')) {
      return raw;
    }
  }
  return null;
}

/** Serialize VKWebAppGetLaunchParams response (official VK format). */
export function serializeLaunchParamsFromBridge(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.startsWith('?') ? raw.slice(1) : raw;
  }
  if (!raw || typeof raw !== 'object') return '';

  return Object.entries(raw as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function isValidLaunchParamsString(raw: string | null | undefined): raw is string {
  return Boolean(raw && (raw.includes('sign=') || raw.includes('vk_user_id=')));
}

/** Capture params synchronously on startup; persist for SPA navigation. */
export function captureLaunchParamsEarly(): string | null {
  const fromLocation = readLaunchParamsFromLocation();
  if (fromLocation) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromLocation);
    } catch {
      // ignore private mode / quota
    }
    return fromLocation;
  }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (isValidLaunchParamsString(stored)) return stored;
  } catch {
    // ignore
  }
  return null;
}

export function persistLaunchParams(raw: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // ignore
  }
}
