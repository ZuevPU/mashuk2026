import { bridge, isVkEnvironment } from './vkBridgeClient';

export function openExternalUrl(url: string): void {
  if (!url) return;
  if (isVkEnvironment()) {
    (bridge.send as (method: string, params: { url: string }) => Promise<unknown>)('VKWebAppOpenURL', { url }).catch(() => {
      window.open(url, '_blank');
    });
  } else {
    window.open(url, '_blank');
  }
}
