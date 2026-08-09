const STORAGE_KEY = 'mashuk_device_key';

let memoryKey: string | null = null;

function createKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStored(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(storage: Storage, key: string): void {
  try {
    storage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Стабильный id установки в браузере/WebView.
 * Не возвращаем общий литерал вроде unknown-device — на форумном Wi‑Fi
 * он склеивал разных участников в один deviceKey на сервере.
 */
export function getDeviceKey(): string {
  if (typeof localStorage !== 'undefined') {
    const existing = readStored(localStorage);
    if (existing) return existing;
    const key = createKey();
    writeStored(localStorage, key);
    if (readStored(localStorage) === key) return key;
  }

  if (typeof sessionStorage !== 'undefined') {
    const existing = readStored(sessionStorage);
    if (existing) return existing;
    const key = createKey();
    writeStored(sessionStorage, key);
    if (readStored(sessionStorage) === key) return key;
  }

  if (!memoryKey) memoryKey = createKey();
  return memoryKey;
}
