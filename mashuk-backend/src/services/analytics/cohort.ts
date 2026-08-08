import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participants, directions } from '../../db/schema.js';
import { buildParticipantWhere, type ParticipantListQuery } from '../participantsList.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { matchesActivity, matchesAgeCategory, AGE_CATEGORY_BUCKETS } from './cohortFilters.js';

export async function loadCohortParticipants(filters: AnalyticsFilters, req?: AdminRequest) {
  const q: ParticipantListQuery = { includeDeleted: false };
  if (filters.shiftId != null) q.shiftId = filters.shiftId;
  if (filters.participantId) q.ids = [filters.participantId];
  if (filters.roleKey) q.pedagogicalRole = filters.roleKey;
  if (req?.adminRole === 'curator') {
    const dirId = (req as AdminRequest & { directionId?: number }).directionId;
    if (dirId) q.directionIds = [dirId];
  }
  const where = buildParticipantWhere(q);
  let rows = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name, // Use fresh name from table
    directionId: participants.directionId,
    groupId: participants.groupId,
    groupName: participants.groupName,
    age: participants.age,
    pedagogicalRole: participants.pedagogicalRole,
    strongRole: participants.strongRole,
    onboardingCompletedAt: participants.onboardingCompletedAt,
    lastActiveAt: participants.lastActiveAt,
    position: participants.position,
    interests: participants.interests,
    goalAnswers: participants.goalAnswers,
    pointBAnswers: participants.pointBAnswers,
    region: participants.region,
    workplace: participants.workplace,
    growthRole: participants.growthRole,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(where ?? isNull(participants.selfDeletedAt));
  
  // Исключаем организаторов из аналитики и рейтингов
  rows = rows.filter(p => {
    const d = (p.direction || '').toLowerCase();
    return d !== 'организатор форума' && d !== 'организатор';
  });

  if (filters.direction) {
    rows = rows.filter(p => p.direction === filters.direction);
  }
  if (filters.group) {
    rows = rows.filter(p => (p.groupName || 'без группы') === filters.group);
  }
  if (filters.roleKey) {
    rows = rows.filter(p => p.pedagogicalRole === filters.roleKey || p.strongRole === filters.roleKey);
  }
  if (filters.ageCategory) {
    rows = rows.filter(p => matchesAgeCategory(p.age, filters.ageCategory));
  }
  if (filters.activity) {
    rows = rows.filter(p => matchesActivity(p.position, filters.activity));
  }
  return rows;
}

export async function cohortParticipantIds(filters: AnalyticsFilters, req?: AdminRequest): Promise<number[]> {
  const rows = await loadCohortParticipants(filters, req);
  return rows.map(p => p.id);
}

export async function listFilterOptions(shiftId?: number | null) {
  const where = shiftId != null
    ? and(isNull(participants.selfDeletedAt), eq(participants.shiftId, shiftId))
    : isNull(participants.selfDeletedAt);
  const rows = await db.select({
    direction: participants.direction,
    groupName: participants.groupName,
    role: participants.pedagogicalRole,
    position: participants.position,
  }).from(participants).where(where);
  const directions = [...new Set(rows.map(r => r.direction).filter(Boolean))] as string[];
  const groups = [...new Set(rows.map(r => r.groupName || 'без группы'))];
  const roles = [...new Set(rows.map(r => r.role).filter(Boolean))] as string[];
  const activities = [...new Set(rows.map(r => r.position).filter(Boolean))] as string[];
  activities.sort((a, b) => a.localeCompare(b, 'ru'));
  return {
    directions,
    groups,
    roles,
    ageCategories: AGE_CATEGORY_BUCKETS.map(b => ({ id: b.id, label: b.label })),
    activities,
  };
}

export function filterAnswersByCohort<T extends { participantId: number }>(
  rows: T[],
  ids: Set<number>,
): T[] {
  return rows.filter(r => ids.has(r.participantId));
}
