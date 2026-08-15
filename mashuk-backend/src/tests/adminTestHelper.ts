import type { Express } from 'express';
import request from 'supertest';
import assert from 'node:assert/strict';

export function interestsFromOnboardingMeta(meta: {
  interestGroups?: Array<{ tags?: string[] }>;
  interestMin?: number;
}): string[] {
  const tags = [...new Set((meta.interestGroups || []).flatMap(g => g.tags || []).filter(Boolean))];
  const min = typeof meta.interestMin === 'number' && meta.interestMin > 0 ? meta.interestMin : 5;
  const picked = tags.slice(0, Math.max(min, 5));
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
