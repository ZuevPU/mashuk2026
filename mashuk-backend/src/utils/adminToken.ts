import crypto from 'crypto';
import { env } from '../config/env.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAdminToken(adminId: number, login: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ adminId, login, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.ADMIN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string): { adminId: number; login: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', env.ADMIN_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      adminId: number;
      login: string;
      exp: number;
    };
    if (!data.adminId || !data.login || data.exp < Date.now()) return null;
    return { adminId: data.adminId, login: data.login };
  } catch {
    return null;
  }
}
