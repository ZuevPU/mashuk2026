import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export const MAX_PARTICIPANT_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function publicUploadBaseUrl(): string {
  return (env.PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/$/, '');
}

export function publicUploadUrl(filename: string): string {
  return `${publicUploadBaseUrl()}/uploads/${filename}`;
}

const UPLOAD_NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function isSafeUploadFilename(name: string): boolean {
  return UPLOAD_NAME_RE.test(name) && name.length > 0 && name.length < 180;
}

/** Filename from `/uploads/x.jpg` or `https://host/api/uploads/x.jpg`. */
export function extractUploadFilename(raw: string): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  const marker = '/uploads/';
  const fromPath = (pathname: string) => {
    const idx = pathname.indexOf(marker);
    if (idx < 0) return null;
    const name = pathname.slice(idx + marker.length).split(/[?#]/)[0];
    return isSafeUploadFilename(name) ? name : null;
  };
  if (t.startsWith(marker) || !/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return fromPath(t.startsWith(marker) ? t : `/${t.replace(/^\/+/, '')}`);
  }
  try {
    return fromPath(new URL(t).pathname);
  } catch {
    return fromPath(t);
  }
}

/** Rewrite relative, /api/uploads or localhost /uploads URLs to the current public host. */
export function resolveStoredUploadUrl(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  const name = extractUploadFilename(t);
  return name ? publicUploadUrl(name) : t;
}

/** Portable path to store in DB (survives PUBLIC_URL changes). */
export function toStoredUploadPath(raw: string): string {
  const name = extractUploadFilename(raw);
  return name ? `/uploads/${name}` : String(raw || '').trim();
}

/** jsonb / string / {0: url} → public upload URLs. */
export function coerceImageUrlList(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) list = parsed;
        else list = [t];
      } catch {
        list = [t];
      }
    } else {
      list = [t];
    }
  } else if (raw && typeof raw === 'object') {
    list = Object.values(raw as Record<string, unknown>);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const resolved = resolveStoredUploadUrl(String(item ?? '').trim());
    if (!resolved) continue;
    if (!/^https?:\/\//.test(resolved) && !resolved.startsWith('/uploads/')) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/** True if URL points at our /uploads/ tree (same origin as PUBLIC_URL / local API). */
export function isOwnUploadUrl(raw: string): boolean {
  try {
    const base = publicUploadBaseUrl();
    const u = new URL(raw);
    const expected = new URL(`${base}/uploads/`);
    if (u.origin !== expected.origin) return false;
    if (!u.pathname.startsWith(expected.pathname)) return false;
    const name = u.pathname.slice(expected.pathname.length);
    return /^[a-zA-Z0-9._-]+$/.test(name) && name.length > 0;
  } catch {
    return false;
  }
}

export class UploadImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadImageError';
  }
}

/** Persist image bytes under uploads/ and return public URL. */
export function saveImageBuffer(buffer: Buffer, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
  ensureUploadDir();
  const filename = `${crypto.randomUUID()}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return publicUploadUrl(filename);
}

export async function saveUploadedImage(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new UploadImageError('Некорректный формат изображения');
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new UploadImageError('Допустимы только JPEG, PNG, WebP или GIF');
  }
  const ext = MIME_TO_EXT[mime] || 'jpg';
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw new UploadImageError('Некорректный формат изображения');
  }
  if (buffer.length === 0) {
    throw new UploadImageError('Пустой файл');
  }
  if (buffer.length > MAX_PARTICIPANT_IMAGE_BYTES) {
    throw new UploadImageError('Фото слишком большое (макс. 5 МБ)');
  }
  return saveImageBuffer(buffer, ext);
}
