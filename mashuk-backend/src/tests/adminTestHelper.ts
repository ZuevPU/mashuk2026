import type { Express } from 'express';
import request from 'supertest';
import assert from 'node:assert/strict';

export function interestsFromOnboardingMeta(meta: {
  interestGroups?: Array<{ tags?: string[] }>;
  interestMin?: number;
  interestMax?: number;
}): string[] {
  const tags = [...new Set((meta.interestGroups || []).flatMap(g => g.tags || []).filter(Boolean))];
  const min = typeof meta.interestMin === 'number' && meta.interestMin > 0 ? meta.interestMin : 1;
  const max = typeof meta.interestMax === 'number' && meta.interestMax > 0 ? meta.interestMax : Math.max(min, 8);
  const need = Math.min(max, Math.max(min, 1));
  const picked = tags.slice(0, need);
  assert.ok(picked.length >= min, `onboarding-meta has ${picked.length} interest tags, need ${min}`);
  return picked;
}

export function groupIdForDirection(
  groups: Array<{ id: number; directionId?: number | null }> | undefined,
  directionId: number,
): number | null {
  const match = (groups || []).find(g => g.directionId == null || g.directionId === directionId);
  return match?.id ?? null;
}

export async function getAdminBearerToken(app: Express): Promise<string> {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ login: 'zuev', password: 'ZuevPu26' });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.token);
  return res.body.token as string;
}

export async function resolveTestAdminShiftId(app: Express, token: string): Promise<number> {
  const res = await request(app)
    .get('/api/admin/shift-options')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, res.text);
  const activeId = Number(res.body.activeShiftId);
  if (Number.isFinite(activeId) && activeId > 0) return activeId;
  const first = Number(res.body.shifts?.[0]?.id);
  assert.ok(Number.isFinite(first) && first > 0, 'no admin shift to test against');
  return first;
}

export async function getAdminAuthHeaders(app: Express): Promise<Record<string, string>> {
  const token = await getAdminBearerToken(app);
  const shiftId = await resolveTestAdminShiftId(app, token);
  return {
    Authorization: `Bearer ${token}`,
    'X-Admin-Shift-Id': String(shiftId),
  };
}
