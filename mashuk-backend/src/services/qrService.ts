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

export function buildDeviceKey(input: {
  ip?: string | null;
  userAgent?: string | null;
  clientDeviceKey?: string | null;
}): string {
  const ip = (input.ip || 'unknown').trim().slice(0, 64);
  const ua = (input.userAgent || 'unknown').trim().slice(0, 512);
  const client = (input.clientDeviceKey || '').trim().slice(0, 128);
  return crypto.createHash('sha256').update(`${ip}|${ua}|${client}`).digest('hex').slice(0, 32);
}
