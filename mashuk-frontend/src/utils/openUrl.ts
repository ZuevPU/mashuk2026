import { bridge, isVkEnvironment } from './vkBridgeClient';

/** Make a string safe for VKWebAppOpenURL / window.open. */
export function normalizeExternalUrl(url: string): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^(mailto:|tel:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  // vk.com/..., t.me/..., example.org/path
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?]|$)/i.test(raw)) {
    return `https://${raw}`;
  }
  return null;
}

export function openExternalUrl(url: string): void {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) return;

  if (isVkEnvironment() && typeof bridge.send === 'function') {
    void (bridge.send as (method: string, params: { url: string }) => Promise<unknown>)(
      'VKWebAppOpenURL',
      { url: normalized },
    ).catch(() => {
      window.open(normalized, '_blank', 'noopener,noreferrer');
    });
    return;
  }

  window.open(normalized, '_blank', 'noopener,noreferrer');
}
