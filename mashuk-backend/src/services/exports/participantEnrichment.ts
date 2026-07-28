import { eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank, participants } from '../../db/schema.js';
import { getLevel } from '../pointsService.js';
import { fullName, formatTs } from './exportCommon.js';

export async function countIdeasForParticipant(participantId: number): Promise<number> {
  const rows = await db.select({ id: piggybank.id, tags: piggybank.tags })
    .from(piggybank)
    .where(eq(piggybank.participantId, participantId));
  let n = 0;
  for (const r of rows) {
    const tags = r.tags;
    const arr = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
    if (arr.some(t => String(t).toLowerCase().includes('иде'))) n += 1;
  }
  return n;
}

export async function enrichParticipantRow(p: typeof participants.$inferSelect) {
  const [pathLevel, expLevel, ideas] = await Promise.all([
    getLevel(p.pathPoints ?? 0, 'path'),
    getLevel(p.experiencePoints ?? 0, 'experience'),
    countIdeasForParticipant(p.id),
  ]);
  const total = (p.pathPoints ?? 0) + (p.experiencePoints ?? 0) + (p.bonusPoints ?? 0);
  const goal = p.goalAnswers as Record<string, unknown> | null;
  const pointB = p.pointBAnswers as Record<string, unknown> | null;
  const interests = Array.isArray(p.interests) ? (p.interests as string[]).join('; ') : JSON.stringify(p.interests ?? '');
  return {
    id: p.id,
    fullName: fullName(p),
    vkId: p.vkId,
    age: p.age,
    direction: p.direction,
    groupName: p.groupName,
    workplace: p.workplace,
    position: p.position,
    registeredAt: formatTs(p.onboardingCompletedAt ?? p.createdAt),
    pathPoints: p.pathPoints ?? 0,
    experiencePoints: p.experiencePoints ?? 0,
    bonusPoints: p.bonusPoints ?? 0,
    totalRating: total,
    pathLevel,
    experienceLevel: expLevel,
    ideasCount: ideas,
    consentPd: p.consentPd ? 'да' : 'нет',
    consentAnalytics: p.consentAnalytics ? 'да' : 'нет',
    consentPdVersion: p.consentPdVersion,
    consentAnalyticsVersion: p.consentAnalyticsVersion,
    consentDate: p.consentPd ? formatTs(p.onboardingCompletedAt) : '',
    pointA: goal ? JSON.stringify(goal) : '',
    pointB: pointB ? JSON.stringify(pointB) : '',
    startRole: p.pedagogicalRole,
    strongRole: p.strongRole,
    growthRole: p.growthRole,
    nextExperiment: p.nextExperiment,
    interests,
    roleAnswers: p.roleAnswers ? JSON.stringify(p.roleAnswers) : '',
  };
}

export async function loadEnrichedParticipants(limit = 5000) {
  const list = await db.select().from(participants)
    .where(isNull(participants.selfDeletedAt))
    .limit(limit);
  const out = [];
  for (const p of list) {
    out.push(await enrichParticipantRow(p));
  }
  return out;
}
