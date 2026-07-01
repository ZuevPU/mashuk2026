import { bridge, isVkEnvironment } from './vkBridgeClient';
import { apiPost, initAuth } from '../api/client';

export async function uploadTaskPhoto(): Promise<string | null> {
  if (isVkEnvironment()) {
    try {
      const result = await (bridge as { send: (method: string, props?: object) => Promise<unknown> })
        .send('VKWebAppShowImageUpload', { type: 'photo' });
      if (result && typeof result === 'object' && 'file' in result) {
        const file = (result as { file: string }).file;
        await initAuth();
        const uploaded = await apiPost<{ url: string }>('/upload', { photoUrl: file });
        return uploaded.url;
      }
      if (result && typeof result === 'object' && 'url' in result) {
        return (result as { url: string }).url;
      }
    } catch (e) {
      console.warn('VK image upload failed', e);
    }
  }

  const url = prompt('URL фото (dev-режим):');
  if (!url) return null;

  if (/^https?:\/\//.test(url)) {
    await initAuth();
    const uploaded = await apiPost<{ url: string }>('/upload', { photoUrl: url });
    return uploaded.url;
  }

  if (url.startsWith('data:image/')) {
    await initAuth();
    const uploaded = await apiPost<{ url: string }>('/upload', { dataUrl: url });
    return uploaded.url;
  }

  return url;
}
