import vkBridgeModule from '@vkontakte/vk-bridge';

const mod = vkBridgeModule as unknown as { default?: typeof vkBridgeModule };
export const bridge = mod.default ?? vkBridgeModule;
export function isVkEnvironment(): boolean {
  return typeof bridge.isEmbedded === 'function' && bridge.isEmbedded();
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

// VK Bridge calls made before VKWebAppInit resolves can hang or fail silently
// on native VK apps (iOS/Android) — every caller must await this first.
export function initVkBridge(): Promise<void> {
  if (vkInitPromise) return vkInitPromise;
  if (!isVkEnvironment() || typeof bridge.send !== 'function') {
    vkInitPromise = Promise.resolve();
    return vkInitPromise;
  }
  vkInitPromise = withTimeout(bridge.send('VKWebAppInit'), 5000)
    .then(() => undefined)
    .catch(() => undefined);
  return vkInitPromise;
}

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
      return 'Сканер VK недоступен на этом устройстве — вставьте ссылку с QR вручную или откройте QR камерой телефона';
    case 'timeout':
      return 'Сканер VK не ответил — попробуйте ещё раз или вставьте ссылку с QR вручную';
    case 'error':
      return 'Не удалось открыть сканер VK — проверьте доступ к камере или вставьте ссылку с QR вручную';
    case 'cancelled':
    default:
      return 'Сканирование отменено';
  }
}
