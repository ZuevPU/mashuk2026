import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function publicUploadUrl(filename: string): string {
  const baseUrl = env.PUBLIC_URL || `http://localhost:${env.PORT}`;
  return `${baseUrl}/uploads/${filename}`;
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
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid dataUrl format');
  }
  const ext = match[1].split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image too large (max 5MB)');
  }
  return saveImageBuffer(buffer, ext);
}
