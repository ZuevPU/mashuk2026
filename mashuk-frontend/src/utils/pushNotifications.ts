import { bridge, isVkEnvironment, withTimeout } from './vkBridgeClient';

const STORAGE_KEY = 'mashuk_push_allow_requested';

/** Запросить разрешение на push мини-приложения (один раз за сессию установки). */
export async function requestVkPushPermission(): Promise<boolean> {
  if (!isVkEnvironment() || typeof bridge.send !== 'function') return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return true;
    await withTimeout(
      (bridge.send as (method: string) => Promise<unknown>)('VKWebAppAllowNotifications'),
      8000,
    );
    localStorage.setItem(STORAGE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function resetPushPermissionPromptFlag(): void {
  localStorage.removeItem(STORAGE_KEY);
}
