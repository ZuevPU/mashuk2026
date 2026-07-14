import crypto from 'crypto';
import { env } from '../config/env.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminRole = 'admin' | 'moderator' | 'analyst' | 'director';

export function createAdminToken(adminId: number, login: string, role: string = 'admin'): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ adminId, login, role, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.ADMIN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string): { adminId: number; login: string; role: string } | null {
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
      role?: string;
      exp: number;
    };
    if (!data.adminId || !data.login || data.exp < Date.now()) return null;
    return { adminId: data.adminId, login: data.login, role: data.role || 'admin' };
  } catch {
    return null;
  }
}

/** Матрица прав v1 */
export function roleCan(role: string, action: 'read' | 'moderate' | 'export' | 'settings' | 'users' | 'delete'): boolean {
  if (role === 'admin' || role === 'superadmin') return true;
  if (role === 'director') return action === 'read' || action === 'export';
  if (role === 'analyst') return action === 'read' || action === 'export';
  if (role === 'moderator') return action === 'read' || action === 'moderate';
  return false;
}

export const ADMIN_RIGHTS_MATRIX: Array<{
  role: string;
  label: string;
  actions: Record<'read' | 'moderate' | 'export' | 'settings' | 'users' | 'delete', boolean>;
}> = (['admin', 'director', 'analyst', 'moderator'] as const).map(role => ({
  role,
  label: role,
  actions: {
    read: roleCan(role, 'read'),
    moderate: roleCan(role, 'moderate'),
    export: roleCan(role, 'export'),
    settings: roleCan(role, 'settings'),
    users: roleCan(role, 'users'),
    delete: roleCan(role, 'delete'),
  },
}));
