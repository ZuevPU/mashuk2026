import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participants, directions } from '../../db/schema.js';
import { buildParticipantWhere, type ParticipantListQuery } from '../participantsList.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { matchesActivity, matchesAgeCategory, AGE_CATEGORY_BUCKETS } from './cohortFilters.js';
import { isOrganizerParticipant } from '../leaderboardQuery.js';
import { filterAnswersByCohort, restrictToCohort } from './cohortRestrict.js';

export { filterAnswersByCohort, restrictToCohort };

const COHORT_CACHE_TTL_MS = 45_000;
const COHORT_CACHE_MAX = 12;

type CohortRow = Awaited<ReturnType<typeof loadCohortUncached>>[number];
type CacheRec = { at: number; rows: CohortRow[] };

const cohortCache = new Map<string, CacheRec>();
const cohortInflight = new Map<string, Promise<CohortRow[]>>();

function cohortCacheKey(filters: AnalyticsFilters, req?: AdminRequest): string {
  const curatorDir = req?.adminRole === 'curator'
    ? String((req as AdminRequest & { directionId?: number }).directionId ?? '')
    : '';
  return [
    filters.shiftId ?? '',
    filters.participantId ?? '',
    filters.roleKey ?? '',
    filters.direction ?? '',
    filters.group ?? '',
    filters.ageCategory ?? '',
    filters.activity ?? '',
    filters.organizers ? '1' : '0',
    curatorDir,
  ].join('|');
}

function rememberCohort(key: string, rows: CohortRow[]) {
  cohortCache.set(key, { at: Date.now(), rows });
  if (cohortCache.size <= COHORT_CACHE_MAX) return;
  const oldest = [...cohortCache.entries()].sort((a, b) => a[1].at - b[1].at);
  while (oldest.length > COHORT_CACHE_MAX) {
    const drop = oldest.shift();
    if (drop) cohortCache.delete(drop[0]);
  }
}

async function loadCohortUncached(filters: AnalyticsFilters, req?: AdminRequest) {
  const q: ParticipantListQuery = { includeDeleted: false };
  if (filters.shiftId != null) q.shiftId = filters.shiftId;
  if (filters.participantId) q.ids = [filters.participantId];
  if (filters.roleKey) q.pedagogicalRole = filters.roleKey;
  if (req?.adminRole === 'curator') {
    const dirId = (req as AdminRequest & { directionId?: number }).directionId;
    if (dirId) q.directionIds = [dirId];
  }
  const where = buildParticipantWhere(q);
  const loaded = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: sql<string | null>`COALESCE(${directions.name}, ${participants.direction})`,
    directionId: participants.directionId,
    directionStored: participants.direction,
    directionIsOrganizer: directions.isOrganizer,
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
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
    forumPoints: participants.forumPoints,
  }).from(participants)
    .leftJoin(directions, and(
      eq(participants.directionId, directions.id),
      eq(directions.shiftId, participants.shiftId),
    ))
    .where(where ?? isNull(participants.selfDeletedAt));

  let rows = loaded
    .filter(p => {
      const isOrg = isOrganizerParticipant({
        isOrganizer: p.directionIsOrganizer,
        directionId: p.directionId,
        names: [p.direction, p.directionStored],
      });
      return filters.organizers ? isOrg : !isOrg;
    })
    .map(({ directionStored: _drop, directionIsOrganizer: _flag, ...rest }) => rest);

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

/**
 * Когорта участников для аналитики. Короткий in-memory кэш + coalescing,
 * чтобы /hub/forum и /hub/forum-extras (и параллельные билдеры) не ходили в БД дважды.
 */
export async function loadCohortParticipants(filters: AnalyticsFilters, req?: AdminRequest) {
  const key = cohortCacheKey(filters, req);
  const hit = cohortCache.get(key);
  if (hit && Date.now() - hit.at < COHORT_CACHE_TTL_MS) {
    return hit.rows.slice();
  }

  let pending = cohortInflight.get(key);
  if (!pending) {
    pending = loadCohortUncached(filters, req).then(
      rows => {
        rememberCohort(key, rows);
        cohortInflight.delete(key);
        return rows;
      },
      err => {
        cohortInflight.delete(key);
        throw err;
      },
    );
    cohortInflight.set(key, pending);
  }
  const rows = await pending;
  return rows.slice();
}

export async function cohortParticipantIds(filters: AnalyticsFilters, req?: AdminRequest): Promise<number[]> {
  const rows = await loadCohortParticipants(filters, req);
  return rows.map(p => p.id);
}

export async function listFilterOptions(shiftId?: number | null) {
  const where = shiftId != null
    ? and(isNull(participants.selfDeletedAt), eq(participants.shiftId, shiftId))
    : isNull(participants.selfDeletedAt);
  const [rows, catalog] = await Promise.all([
    db.select({
      groupName: participants.groupName,
      role: participants.pedagogicalRole,
      position: participants.position,
    }).from(participants).where(where),
    shiftId != null
      ? db.select({
        name: directions.name,
        isOrganizer: directions.isOrganizer,
      }).from(directions).where(eq(directions.shiftId, shiftId))
      : Promise.resolve([] as Array<{ name: string; isOrganizer: boolean | null }>),
  ]);
  const sortRu = (a: string, b: string) => a.localeCompare(b, 'ru');
  const organizerDirections = catalog
    .filter(d => d.isOrganizer === true)
    .map(d => String(d.name || '').trim())
    .filter(Boolean)
    .sort(sortRu);
  const regularDirections = catalog
    .filter(d => d.isOrganizer !== true)
    .map(d => String(d.name || '').trim())
    .filter(Boolean)
    .sort(sortRu);
  const groups = [...new Set(rows.map(r => r.groupName || 'без группы'))];
  const roles = [...new Set(rows.map(r => r.role).filter(Boolean))] as string[];
  const activities = [...new Set(rows.map(r => r.position).filter(Boolean))] as string[];
  activities.sort(sortRu);
  return {
    directions: regularDirections,
    organizerDirections,
    groups,
    roles,
    ageCategories: AGE_CATEGORY_BUCKETS.map(b => ({ id: b.id, label: b.label })),
    activities,
  };
}

