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
