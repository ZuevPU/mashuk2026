const STORAGE_KEY = 'mashuk_vk_launch_params';
const PENDING_QR_KEY = 'mashuk_pending_task_qr';

export type PendingTaskQr = { qr: string; taskId?: number };

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

/** True when we already have (or can read) VK launch params for API Bearer auth. */
export function hasUsableLaunchParams(): boolean {
  if (isValidLaunchParamsString(readLaunchParamsFromLocation())) return true;
  try {
    return isValidLaunchParamsString(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function parsePendingTaskQrRaw(raw: string | null): PendingTaskQr | null {
  if (!raw) return null;
  try {
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as PendingTaskQr;
      if (parsed?.qr && typeof parsed.qr === 'string') {
        return {
          qr: parsed.qr,
          taskId: typeof parsed.taskId === 'number' && parsed.taskId > 0 ? parsed.taskId : undefined,
        };
      }
      return null;
    }
    // Legacy: plain code string
    return { qr: raw };
  } catch {
    return { qr: raw };
  }
}

export function setPendingTaskQr(qr: string, taskId?: number): void {
  try {
    const payload: PendingTaskQr = { qr };
    if (taskId && taskId > 0) payload.taskId = taskId;
    sessionStorage.setItem(PENDING_QR_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Read task QR from hash before router rewrite (#/scan?qr= / #/tasks?…&qr=). */
export function capturePendingTaskQrEarly(): string | null {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    let code: string | null = null;
    let taskId: number | undefined;
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      const params = new URLSearchParams(hash.slice(qIdx + 1));
      code = params.get('qr');
      const t = Number(params.get('task'));
      if (Number.isFinite(t) && t > 0) taskId = t;
    }
    if (!code) {
      const m = hash.match(/(?:^|[?&/])qr=([^&\s]+)/i);
      if (m?.[1]) code = decodeURIComponent(m[1]);
    }
    if (code) {
      setPendingTaskQr(code, taskId);
      return code;
    }
    return peekPendingTaskQr()?.qr ?? null;
  } catch {
    return null;
  }
}

export function peekPendingTaskQr(): PendingTaskQr | null {
  try {
    return parsePendingTaskQrRaw(sessionStorage.getItem(PENDING_QR_KEY));
  } catch {
    return null;
  }
}

/** Consume stashed QR once (clears storage). */
export function takePendingTaskQr(): PendingTaskQr | null {
  try {
    const v = parsePendingTaskQrRaw(sessionStorage.getItem(PENDING_QR_KEY));
    if (v) sessionStorage.removeItem(PENDING_QR_KEY);
    return v;
  } catch {
    return null;
  }
}

export function clearPendingTaskQr(): void {
  try {
    sessionStorage.removeItem(PENDING_QR_KEY);
  } catch {
    /* ignore */
  }
}
