import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participants } from '../../db/schema.js';
import { buildParticipantWhere, type ParticipantListQuery } from '../participantsList.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';

export async function loadCohortParticipants(filters: AnalyticsFilters, req?: AdminRequest) {
  const q: ParticipantListQuery = { includeDeleted: false };
  if (filters.participantId) q.ids = [filters.participantId];
  if (filters.roleKey) q.pedagogicalRole = filters.roleKey;
  if (req?.adminRole === 'curator') {
    const dirId = (req as AdminRequest & { directionId?: number }).directionId;
    if (dirId) q.directionIds = [dirId];
  }
  const where = buildParticipantWhere(q);
  let rows = await db.select().from(participants).where(where ?? isNull(participants.selfDeletedAt));
  if (filters.direction) {
    rows = rows.filter(p => p.direction === filters.direction);
  }
  if (filters.group) {
    rows = rows.filter(p => (p.groupName || 'без группы') === filters.group);
  }
  if (filters.roleKey) {
    rows = rows.filter(p => p.pedagogicalRole === filters.roleKey || p.strongRole === filters.roleKey);
  }
  return rows;
}

export async function cohortParticipantIds(filters: AnalyticsFilters, req?: AdminRequest): Promise<number[]> {
  const rows = await loadCohortParticipants(filters, req);
  return rows.map(p => p.id);
}

export async function listFilterOptions() {
  const rows = await db.select({
    direction: participants.direction,
    groupName: participants.groupName,
    role: participants.pedagogicalRole,
  }).from(participants).where(isNull(participants.selfDeletedAt));
  const directions = [...new Set(rows.map(r => r.direction).filter(Boolean))] as string[];
  const groups = [...new Set(rows.map(r => r.groupName || 'без группы'))];
  const roles = [...new Set(rows.map(r => r.role).filter(Boolean))] as string[];
  return { directions, groups, roles };
}

export function filterAnswersByCohort<T extends { participantId: number }>(
  rows: T[],
  ids: Set<number>,
): T[] {
  return rows.filter(r => ids.has(r.participantId));
}
