import { bridge, isVkEnvironment } from './vkBridgeClient';
import { apiPost, initAuth } from '../api/client';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });
    // User cancelled without change — best-effort cleanup on next focus
    window.addEventListener('focus', () => {
      window.setTimeout(() => {
        if (!input.isConnected) return;
        if (!input.files?.length) {
          cleanup();
          resolve(null);
        }
      }, 300);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function validateImageFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Допустимы только JPEG, PNG, WebP или GIF');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Фото слишком большое (макс. 5 МБ)');
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:image/')) {
        resolve(result);
        return;
      }
      reject(new Error('Не удалось прочитать файл'));
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

async function uploadDataUrl(dataUrl: string): Promise<string> {
  await initAuth();
  const uploaded = await apiPost<{ url: string }>('/upload', { dataUrl });
  return uploaded.url;
}

/** Try VK bridge; only accept a data:image payload we can re-upload to our server. */
async function tryVkBridgeDataUrl(): Promise<string | null> {
  if (!isVkEnvironment()) return null;
  try {
    const result = await (bridge as { send: (method: string, props?: object) => Promise<unknown> })
      .send('VKWebAppShowImageUpload', { type: 'photo' });
    if (!result || typeof result !== 'object') return null;
    const file = 'file' in result ? (result as { file: unknown }).file : null;
    const url = 'url' in result ? (result as { url: unknown }).url : null;
    if (typeof file === 'string' && file.startsWith('data:image/')) return file;
    if (typeof url === 'string' && url.startsWith('data:image/')) return url;
    // External VK CDN URLs are not accepted as final photoUrl — fall through to file picker
  } catch (e) {
    console.warn('VK image upload failed', e);
  }
  return null;
}

export async function uploadTaskPhoto(): Promise<string | null> {
  const fromVk = await tryVkBridgeDataUrl();
  if (fromVk) {
    return uploadDataUrl(fromVk);
  }

  const file = await pickImageFile();
  if (!file) return null;
  validateImageFile(file);
  const dataUrl = await readFileAsDataUrl(file);
  return uploadDataUrl(dataUrl);
}
