import { bridge, isVkEnvironment, withTimeout } from './vkBridgeClient';

const STORAGE_KEY = 'mashuk_push_allow_requested';
const LAUNCH_PARAMS_KEY = 'mashuk_vk_launch_params';

function readLaunchParamsRaw(): string {
  try {
    return sessionStorage.getItem(LAUNCH_PARAMS_KEY) || '';
  } catch {
    return '';
  }
}

/** vk_are_notifications_enabled=1 в launch params VK Mini App. */
export function areVkNotificationsEnabledInLaunchParams(): boolean {
  const raw = readLaunchParamsRaw();
  if (!raw) return false;
  try {
    const qs = raw.startsWith('?') ? raw.slice(1) : raw;
    return new URLSearchParams(qs).get('vk_are_notifications_enabled') === '1';
  } catch {
    return false;
  }
}

type AllowNotificationsResult = { result?: boolean };

/** Запросить разрешение на push мини-приложения; повторный запрос возможен после отказа. */
export async function requestVkPushPermission(): Promise<boolean> {
  if (!isVkEnvironment() || typeof bridge.send !== 'function') return false;

  if (areVkNotificationsEnabledInLaunchParams()) {
    try {
      localStorage.setItem(STORAGE_KEY, 'granted');
    } catch {
      // ignore
    }
    return true;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'granted' || stored === '1') return true;
  } catch {
    // ignore
  }

  try {
    const raw = await withTimeout(
      (bridge.send as (method: string) => Promise<unknown>)('VKWebAppAllowNotifications'),
      8000,
    );
    const granted = (raw as AllowNotificationsResult)?.result === true;
    try {
      localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied');
    } catch {
      // ignore
    }
    return granted;
  } catch {
    return false;
  }
}

export function resetPushPermissionPromptFlag(): void {
  localStorage.removeItem(STORAGE_KEY);
}
