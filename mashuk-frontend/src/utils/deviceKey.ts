const STORAGE_KEY = 'mashuk_device_key';

/** Стабильный идентификатор устройства в браузере (дополнение к IP/UA на сервере). */
export function getDeviceKey(): string {
  try {
    let key = localStorage.getItem(STORAGE_KEY);
    if (!key) {
      key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEY, key);
    }
    return key;
  } catch {
    return 'unknown-device';
  }
}
