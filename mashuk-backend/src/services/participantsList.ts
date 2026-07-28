import {
  and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';

export type ParticipantListQuery = {
  q?: string;
  page?: number;
  limit?: number;
  directionIds?: number[];
  groupId?: number;
  pedagogicalRole?: string;
  strongRole?: string;
  activity?: 'active_today' | 'inactive_1d' | 'inactive_3d';
  includeDeleted?: boolean;
  /** Только участники с self_deleted_at (удалили профиль / исключены) */
  onlySelfDeleted?: boolean;
  ids?: number[];
  /** Фильтр по смене; по умолчанию задаётся в listParticipants */
  shiftId?: number;
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function buildParticipantWhere(query: ParticipantListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.shiftId != null && !Number.isNaN(query.shiftId)) {
    conditions.push(eq(participants.shiftId, query.shiftId));
  }
  if (query.onlySelfDeleted) {
    conditions.push(isNotNull(participants.selfDeletedAt));
  } else if (!query.includeDeleted) {
    conditions.push(isNull(participants.selfDeletedAt));
  }
  if (query.ids?.length) {
    conditions.push(inArray(participants.id, query.ids));
  }
  if (query.q?.trim()) {
    const raw = query.q.trim();
    const pattern = `%${raw.replace(/[%_\\]/g, '\\$&')}%`;
    const vkNum = Number(raw);
    if (!Number.isNaN(vkNum) && String(vkNum) === raw.replace(/\s/g, '')) {
      conditions.push(or(
        ilike(participants.firstName, pattern),
        ilike(participants.lastName, pattern),
        ilike(participants.direction, pattern),
        eq(participants.vkId, vkNum),
        sql`CAST(${participants.id} AS TEXT) = ${raw}`,
      )!);
    } else {
      conditions.push(or(
        ilike(participants.firstName, pattern),
        ilike(participants.lastName, pattern),
        ilike(participants.direction, pattern),
      )!);
    }
  }
  if (query.directionIds?.length) {
    conditions.push(inArray(participants.directionId, query.directionIds));
  }
  if (query.groupId != null && !Number.isNaN(query.groupId)) {
    conditions.push(eq(participants.groupId, query.groupId));
  }
  if (query.pedagogicalRole?.trim()) {
    conditions.push(eq(participants.pedagogicalRole, query.pedagogicalRole.trim()));
  }
  if (query.strongRole?.trim()) {
    conditions.push(eq(participants.strongRole, query.strongRole.trim()));
  }
  const now = new Date();
  if (query.activity === 'active_today') {
    conditions.push(gte(participants.lastActiveAt, startOfTodayUtc()));
  } else if (query.activity === 'inactive_1d') {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    conditions.push(or(isNull(participants.lastActiveAt), lt(participants.lastActiveAt, cutoff))!);
  } else if (query.activity === 'inactive_3d') {
    const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    conditions.push(or(isNull(participants.lastActiveAt), lt(participants.lastActiveAt, cutoff))!);
  }

  return conditions.length ? and(...conditions) : undefined;
}

export function mapParticipantListRow(p: typeof participants.$inferSelect) {
  const path = p.pathPoints ?? 0;
  const exp = p.experiencePoints ?? 0;
  return {
    ...p,
    totalRating: path + exp,
  };
}

export async function queryParticipants(query: ParticipantListQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, Math.min(500, query.limit || 50));
  const offset = (page - 1) * limit;
  const where = buildParticipantWhere(query);

  let countQuery = db.select({ count: count() }).from(participants);
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [total] = await countQuery;

  let listQuery = db.select().from(participants)
    .orderBy(query.onlySelfDeleted ? desc(participants.selfDeletedAt) : desc(participants.createdAt))
    .limit(limit).offset(offset);
  if (where) listQuery = listQuery.where(where) as typeof listQuery;
  const list = await listQuery;

  return {
    participants: list.map(mapParticipantListRow),
    totalCount: total.count,
    page,
    limit,
  };
}

export function parseParticipantListQuery(req: { query: Record<string, unknown> }): ParticipantListQuery {
  const directionRaw = req.query.directionId ?? req.query['directionId[]'];
  let directionIds: number[] | undefined;
  if (Array.isArray(directionRaw)) {
    directionIds = directionRaw.map(v => Number(v)).filter(n => !Number.isNaN(n));
  } else if (typeof directionRaw === 'string' && directionRaw.includes(',')) {
    directionIds = directionRaw.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
  } else if (directionRaw != null && directionRaw !== '') {
    const n = Number(directionRaw);
    if (!Number.isNaN(n)) directionIds = [n];
  }

  const idsRaw = req.query.ids;
  let ids: number[] | undefined;
  if (typeof idsRaw === 'string' && idsRaw.trim()) {
    ids = idsRaw.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
  }

  const activity = req.query.activity as ParticipantListQuery['activity'];
  const validActivity = activity === 'active_today' || activity === 'inactive_1d' || activity === 'inactive_3d'
    ? activity
    : undefined;

  return {
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
    directionIds,
    groupId: req.query.groupId != null ? Number(req.query.groupId) : undefined,
    pedagogicalRole: typeof req.query.pedagogicalRole === 'string' ? req.query.pedagogicalRole : undefined,
    strongRole: typeof req.query.strongRole === 'string' ? req.query.strongRole : undefined,
    activity: validActivity,
    includeDeleted: req.query.includeDeleted === 'true' || req.query.includeDeleted === '1',
    onlySelfDeleted: req.query.onlySelfDeleted === 'true' || req.query.onlySelfDeleted === '1'
      || req.query.list === 'hidden',
    ids,
    shiftId: req.query.shiftId != null && req.query.shiftId !== ''
      ? Number(req.query.shiftId)
      : undefined,
  };
}
