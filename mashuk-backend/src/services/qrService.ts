import crypto from 'crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { buildEventAttendanceRef } from './eventAttendanceService.js';

/** Генерация токена для QR deep-link */
export function generateQrToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** База ссылок в QR для участника — мини-приложение VK, не backend PUBLIC_URL. */
export function resolveParticipantAppBase(): string {
  const mini = env.VK_MINI_APP_URL?.trim();
  if (mini) return mini.replace(/\/$/, '');
  const pub = env.PUBLIC_URL?.trim();
  if (pub) return pub.replace(/\/$/, '');
  return 'https://vk.ru/app54662212';
}

export function buildTaskQrUrl(baseUrl: string, taskId: number, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#/tasks?task=${taskId}&qr=${token}`;
}

/**
 * Event QR: with VK_GROUP_ID → community write-link (phone camera → bot).
 * Otherwise mini-app deep link #/program?event=&qr=.
 */
export function buildEventQrUrl(baseUrl: string, eventId: number, token: string): string {
  const groupId = env.VK_GROUP_ID?.trim();
  if (groupId) {
    const ref = buildEventAttendanceRef(eventId, token);
    const numeric = groupId.replace(/^club/i, '');
    return `https://vk.me/club${numeric}?ref=${encodeURIComponent(ref)}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/#/program?event=${eventId}&qr=${token}`;
}

export function buildParticipantQrUrl(baseUrl: string, participantId: number, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#/volunteer?p=${participantId}&qr=${token}`;
}

export async function buildQrDataUrl(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

const WEAK_CLIENT_DEVICE_KEYS = new Set(['', 'unknown', 'unknown-device']);

/**
 * Fingerprint for QR anti-share checks.
 * Prefer the client install id only — venue Wi‑Fi NAT + similar VK WebView UAs
 * made ip|ua|client collide across unrelated phones (especially when client was
 * the shared fallback "unknown-device").
 * Without a reliable client id, return an ephemeral key so device-block never
 * false-positives; same-participant duplicates are still blocked separately.
 */
export function buildDeviceKey(input: {
  ip?: string | null;
  userAgent?: string | null;
  clientDeviceKey?: string | null;
}): string {
  const client = (input.clientDeviceKey || '').trim().slice(0, 128);
  if (client && !WEAK_CLIENT_DEVICE_KEYS.has(client.toLowerCase())) {
    return crypto.createHash('sha256').update(`client:${client}`).digest('hex').slice(0, 32);
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(`ephemeral:${nonce}`).digest('hex').slice(0, 32);
}
