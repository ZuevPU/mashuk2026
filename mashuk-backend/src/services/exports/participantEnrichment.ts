import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank, participants } from '../../db/schema.js';
import { getLevelSync, getLevelThresholds } from '../pointsService.js';
import {
  buildParticipantWhere,
  type ParticipantListQuery,
} from '../participantsList.js';
import { fullName, formatTs } from './exportCommon.js';

export async function countIdeasForParticipant(participantId: number): Promise<number> {
  const rows = await db.select({ id: piggybank.id, tags: piggybank.tags })
    .from(piggybank)
    .where(eq(piggybank.participantId, participantId));
  let n = 0;
  for (const r of rows) {
    n += ideaCountFromTags(r.tags);
  }
  return n;
}

function ideaCountFromTags(tags: unknown): number {
  const arr = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
  return arr.some(t => String(t).toLowerCase().includes('иде')) ? 1 : 0;
}

async function loadIdeaCounts(participantIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (participantIds.length === 0) return map;
  const rows = await db.select({
    participantId: piggybank.participantId,
    tags: piggybank.tags,
  }).from(piggybank).where(inArray(piggybank.participantId, participantIds));
  for (const r of rows) {
    if (r.participantId == null) continue;
    const add = ideaCountFromTags(r.tags);
    if (!add) continue;
    map.set(r.participantId, (map.get(r.participantId) || 0) + add);
  }
  return map;
}

export function enrichParticipantRowSync(
  p: typeof participants.$inferSelect,
  opts: {
    pathThresholds: number[];
    expThresholds: number[];
    ideasCount: number;
  },
) {
  const pathLevel = getLevelSync(p.pathPoints ?? 0, opts.pathThresholds);
  const expLevel = getLevelSync(p.experiencePoints ?? 0, opts.expThresholds);
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
    ideasCount: opts.ideasCount,
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
    lastActiveAt: formatTs(p.lastActiveAt),
    isBlocked: p.isBlocked ? 'да' : 'нет',
  };
}

export async function enrichParticipantRow(p: typeof participants.$inferSelect) {
  const [pathThresholds, expThresholds, ideasCount] = await Promise.all([
    getLevelThresholds('path'),
    getLevelThresholds('experience'),
    countIdeasForParticipant(p.id),
  ]);
  return enrichParticipantRowSync(p, { pathThresholds, expThresholds, ideasCount });
}

export async function loadEnrichedParticipants(query: ParticipantListQuery = {}) {
  const limit = Math.max(1, Math.min(5000, query.limit || 5000));
  const where = buildParticipantWhere(query);
  let listQuery = db.select().from(participants)
    .orderBy(desc(participants.createdAt))
    .limit(limit);
  if (where) listQuery = listQuery.where(where) as typeof listQuery;
  const list = await listQuery;

  const [pathThresholds, expThresholds, ideaCounts] = await Promise.all([
    getLevelThresholds('path'),
    getLevelThresholds('experience'),
    loadIdeaCounts(list.map(p => p.id)),
  ]);

  return list.map(p => enrichParticipantRowSync(p, {
    pathThresholds,
    expThresholds,
    ideasCount: ideaCounts.get(p.id) || 0,
  }));
}
