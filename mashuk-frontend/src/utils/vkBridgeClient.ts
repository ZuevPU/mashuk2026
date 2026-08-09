import vkBridgeModule from '@vkontakte/vk-bridge';

const mod = vkBridgeModule as unknown as { default?: typeof vkBridgeModule };
export const bridge = mod.default ?? vkBridgeModule;

/** True inside VK Mini App shell (embedded iframe or native WebView). */
export function isVkEnvironment(): boolean {
  try {
    if (typeof bridge.isEmbedded === 'function' && bridge.isEmbedded()) return true;
    if (typeof (bridge as { isWebView?: () => boolean }).isWebView === 'function'
      && (bridge as { isWebView: () => boolean }).isWebView()) {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Fallback: launch params present (iOS sometimes reports not-embedded briefly)
  try {
    const q = typeof window !== 'undefined' ? window.location.search : '';
    return /(?:^|[?&])vk_app_id=\d+/.test(q);
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('VK Bridge timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

let vkInitPromise: Promise<void> | null = null;

/**
 * Always notify the VK client with VKWebAppInit when bridge.send exists.
 * Do NOT gate on isEmbedded(): on iOS the flag can be false for a moment and
 * skipping Init shows the shell error «Приложение не инициализировано».
 */
export function initVkBridge(): Promise<void> {
  if (vkInitPromise) return vkInitPromise;
  if (typeof bridge.send !== 'function') {
    vkInitPromise = Promise.resolve();
    return vkInitPromise;
  }
  // Fire immediately; outside VK the promise rejects and we ignore it.
  vkInitPromise = withTimeout(bridge.send('VKWebAppInit'), 8000)
    .then(() => undefined)
    .catch(() => undefined);
  return vkInitPromise;
}

// Start Init as soon as this module loads (before React mounts) — critical for slow iOS WebViews.
void initVkBridge();

export type CodeReaderFailureReason = 'unavailable' | 'cancelled' | 'timeout' | 'error';

export type CodeReaderResult =
  | { ok: true; code: string }
  | { ok: false; reason: CodeReaderFailureReason; detail?: string };

function classifyBridgeError(err: unknown): CodeReaderFailureReason {
  const raw = (() => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  })();
  const text = raw.toLowerCase();

  if (text.includes('timeout')) return 'timeout';
  if (
    text.includes('denied')
    || text.includes('cancel')
    || text.includes('closed')
    || text.includes('user deny')
    || text.includes('user_denied')
  ) {
    return 'cancelled';
  }
  return 'error';
}

/** Native QR / barcode scanner with a typed failure reason. */
export async function readCodeWithVk(): Promise<CodeReaderResult> {
  await initVkBridge();
  if (!isVkEnvironment() || typeof bridge.send !== 'function') {
    return { ok: false, reason: 'unavailable', detail: 'not_embedded' };
  }
  try {
    const result = await withTimeout(
      bridge.send('VKWebAppOpenCodeReader') as Promise<{ code_data?: string; qr_code?: string }>,
      60_000,
    );
    const code = result?.code_data || result?.qr_code || null;
    if (typeof code === 'string' && code.trim()) {
      return { ok: true, code: code.trim() };
    }
    return { ok: false, reason: 'cancelled' };
  } catch (err) {
    return { ok: false, reason: classifyBridgeError(err), detail: err instanceof Error ? err.message : undefined };
  }
}

/** @deprecated Prefer readCodeWithVk for distinct error copy. */
export async function openCodeReader(): Promise<string | null> {
  const result = await readCodeWithVk();
  return result.ok ? result.code : null;
}

export function codeReaderFailureMessage(reason: CodeReaderFailureReason): string {
  switch (reason) {
    case 'unavailable':
      return 'Встроенный сканер VK здесь недоступен. Нажмите «Сфотографировать QR» или откройте QR обычной камерой телефона.';
    case 'timeout':
      return 'Сканер VK не ответил. Нажмите «Сфотографировать QR» — это работает без сканера VK.';
    case 'error':
      // Camera can be ON in iOS settings and CodeReader still fails (VK WebView / modal bug).
      return 'Сканер VK на этом телефоне не открылся (это бывает даже при включённой камере). Нажмите «Сфотографировать QR» или вставьте ссылку с QR.';
    case 'cancelled':
    default:
      return 'Сканирование отменено';
  }
}
