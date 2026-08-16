import crypto from 'crypto';
import QRCode from 'qrcode';
import { eq, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { buildEventAttendanceRef } from './eventAttendanceService.js';

/** Legacy long token for participant / event QR deep-links */
export function generateQrToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Crockford-like alphabet without 0/O/1/I for printed short codes */
const SHORT_QR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a dense 6-char task QR code (not yet uniqueness-checked). */
export function generateShortQrCode(length = 6): string {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += SHORT_QR_ALPHABET[bytes[i]! % SHORT_QR_ALPHABET.length];
  }
  return out;
}

/**
 * Normalize user/URL input to the stored task qr_token form.
 * Accepts МШК-XXXXXX, /q/XXXXXX, #/scan?qr=, legacy 32-hex, raw code.
 */
export function normalizeTaskQrCode(input: string): string {
  let s = (input || '').trim();
  if (!s) return '';

  s = s.replace(/^мшк[-–—\s]*/i, '').replace(/^mshk[-–—\s]*/i, '');

  const pathMatch = s.match(/\/q\/([A-Za-z0-9]+)/i);
  if (pathMatch?.[1]) s = pathMatch[1];

  try {
    if (s.includes('://') || s.startsWith('#') || s.includes('?')) {
      const hashIdx = s.indexOf('#');
      if (hashIdx >= 0) {
        const after = s.slice(hashIdx + 1);
        const qIdx = after.indexOf('?');
        const query = qIdx >= 0 ? after.slice(qIdx + 1) : after.replace(/^\/?(scan)?\/?/, '');
        const fromHash = new URLSearchParams(query.includes('=') ? query : `qr=${query}`).get('qr');
        if (fromHash) s = fromHash;
      }
      try {
        const u = new URL(s);
        const fromSearch = u.searchParams.get('qr');
        if (fromSearch) s = fromSearch;
      } catch {
        /* not a full URL */
      }
      const m = s.match(/[?&]qr=([^&\s#]+)/i);
      if (m?.[1]) s = decodeURIComponent(m[1]);
    }
  } catch {
    /* keep s */
  }

  s = s.replace(/^мшк[-–—\s]*/i, '').replace(/^mshk[-–—\s]*/i, '').trim();

  if (/^[a-f0-9]{32}$/i.test(s)) return s.toLowerCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(s)) return s.toUpperCase();
  return s;
}

export function formatTaskQrDisplayCode(code: string): string {
  const n = normalizeTaskQrCode(code);
  if (!n) return '';
  if (/^[a-f0-9]{32}$/i.test(n)) return n;
  return `МШК-${n}`;
}

/**
 * Reuse a stored task token so reprint/download does not invalidate printed QR.
 * Returns null when a new code must be allocated.
 */
export function reusableTaskQrToken(
  existing: string | null | undefined,
  regenerate = false,
): string | null {
  if (regenerate) return null;
  const raw = (existing || '').trim();
  if (!raw) return null;
  return normalizeTaskQrCode(raw) || raw;
}

export async function ensureTaskQrToken(
  existing: string | null | undefined,
  opts?: { regenerate?: boolean },
): Promise<{ token: string; reused: boolean; needsPersist: boolean }> {
  const reused = reusableTaskQrToken(existing, opts?.regenerate === true);
  if (reused) {
    return {
      token: reused,
      reused: true,
      needsPersist: reused !== (existing || '').trim(),
    };
  }
  return { token: await allocateTaskQrCode(), reused: false, needsPersist: true };
}

export async function persistTaskQrToken(
  taskId: number,
  existing: string | null | undefined,
  opts?: { regenerate?: boolean },
): Promise<string> {
  const result = await ensureTaskQrToken(existing, opts);
  if (result.needsPersist) {
    await db.update(tasks).set({ qrToken: result.token }).where(eq(tasks.id, taskId));
  }
  return result.token;
}

/** Allocate a unique short code for tasks.qr_token */
export async function allocateTaskQrCode(): Promise<string> {
  for (let i = 0; i < 24; i += 1) {
    const code = generateShortQrCode(6);
    const [ex] = await db.select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.qrToken, code))
      .limit(1);
    if (!ex) return code;
  }
  // Extremely unlikely collision storm — fall back to hex (still unique)
  return generateQrToken();
}

export async function findTaskByQrCode(raw: string) {
  const code = normalizeTaskQrCode(raw);
  if (!code) return null;
  const [task] = await db.select().from(tasks)
    .where(sql`lower(${tasks.qrToken}) = ${code.toLowerCase()}`)
    .limit(1);
  return task ?? null;
}

/** База ссылок в QR для участника — мини-приложение VK, не backend PUBLIC_URL. */
export function resolveParticipantAppBase(): string {
  const mini = env.VK_MINI_APP_URL?.trim();
  if (mini) return mini.replace(/\/$/, '');
  const pub = env.PUBLIC_URL?.trim();
  if (pub) return pub.replace(/\/$/, '');
  return 'https://vk.ru/app54662212';
}

/** Phone-camera URL: PUBLIC_URL/q/CODE → redirect into mini-app #/scan (auto-credit). */
export function buildTaskQrUrl(_baseUrl: string, _taskId: number, token: string): string {
  const code = normalizeTaskQrCode(token) || token;
  const pub = env.PUBLIC_URL?.trim();
  if (pub) return `${pub.replace(/\/$/, '')}/q/${encodeURIComponent(code)}`;
  return buildTaskScanDeepLink(code);
}

/** Deep link after /q/:code redirect: open scan panel and auto-credit the task. */
export function buildTaskScanDeepLink(code: string, _taskId?: number): string {
  const normalized = normalizeTaskQrCode(code) || code;
  return `${resolveParticipantAppBase()}/#/scan?qr=${encodeURIComponent(normalized)}`;
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
