import { bridge, initVkBridge, isVkEnvironment } from './vkBridgeClient';

/** Make a string safe for VKWebAppOpenURL / window.open. */
export function normalizeExternalUrl(url: string): string | null {
  let raw = String(url || '').trim();
  if (!raw) return null;
  // strip copy-paste wrappers: "https://...", <https://...>
  raw = raw.replace(/^['"`<]+/, '').replace(/['"`>]+$/, '').trim();
  if (!raw) return null;

  if (/^(mailto:|tel:|tg:|viber:|whatsapp:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;

  // vk.com/..., t.me/..., www.example.org/path
  if (!/\s/.test(raw) && (raw.includes('.') || raw.includes('/'))) {
    return `https://${raw.replace(/^\/+/, '')}`;
  }
  return null;
}

function openViaAnchor(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Open an external URL from a VK Mini App.
 * Must be called directly from a user gesture when possible.
 */
export function openExternalUrl(url: string): void {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) return;

  // 1) Synchronous anchor click — preserves user-gesture (works in many VK WebViews
  //    where window.open is blocked and VKWebAppOpenURL is flaky).
  try {
    openViaAnchor(normalized);
  } catch {
    /* ignore */
  }

  // 2) Official bridge method for native VK clients
  if (typeof bridge.send === 'function') {
    void initVkBridge().then(() => {
      void (bridge.send as (method: string, params: { url: string }) => Promise<unknown>)(
        'VKWebAppOpenURL',
        { url: normalized },
      ).catch(() => {
        if (!isVkEnvironment()) {
          try {
            window.open(normalized, '_blank', 'noopener,noreferrer');
          } catch {
            /* ignore */
          }
        }
      });
    });
    return;
  }

  try {
    window.open(normalized, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}
