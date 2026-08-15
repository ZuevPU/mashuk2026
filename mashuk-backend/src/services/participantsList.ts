import {
  and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { profileAiConsentOrderExpr } from './profileAiConsent.js';

export const PARTICIPANT_LIST_SORTS = [
  'id', 'vkId', 'name', 'direction', 'group', 'region',
  'role', 'path', 'experience', 'rating', 'activity', 'hiddenAt', 'consent',
] as const;

export type ParticipantListSort = typeof PARTICIPANT_LIST_SORTS[number];

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
  /** Для списка «Удалили профиль»: не резать по текущей смене */
  allShifts?: boolean;
  ids?: number[];
  /** Фильтр по смене; по умолчанию задаётся в listParticipants */
  shiftId?: number;
  sort?: ParticipantListSort;
  dir?: 'asc' | 'desc';
  /** Ключи yes/no поля согласия на ИИ-профиль — только с бэкенда, не из querystring */
  consentFieldKeys?: string[];
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function escapeIlike(raw: string): string {
  return raw.replace(/[%_\\]/g, '\\$&');
}

/** Поиск по ФИО: одно слово, «Имя Фамилия», частичные совпадения. */
export function buildParticipantNameMatch(
  q: string,
  cols: {
    firstName: typeof participants.firstName;
    lastName: typeof participants.lastName;
  } = { firstName: participants.firstName, lastName: participants.lastName },
): SQL | undefined {
  const raw = q.trim();
  if (!raw) return undefined;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const fullName = sql`TRIM(CONCAT(COALESCE(${cols.firstName}, ''), ' ', COALESCE(${cols.lastName}, '')))`;
  const reverseName = sql`TRIM(CONCAT(COALESCE(${cols.lastName}, ''), ' ', COALESCE(${cols.firstName}, '')))`;

  const tokenMatch = (token: string): SQL => {
    const pattern = `%${escapeIlike(token)}%`;
    return or(
      ilike(cols.firstName, pattern),
      ilike(cols.lastName, pattern),
      sql`${fullName} ILIKE ${pattern}`,
      sql`${reverseName} ILIKE ${pattern}`,
    )!;
  };

  if (tokens.length === 1) return tokenMatch(tokens[0]!);
  return and(...tokens.map(tokenMatch))!;
}

export function buildParticipantWhere(query: ParticipantListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.onlySelfDeleted) {
    conditions.push(isNotNull(participants.selfDeletedAt));
  } else if (!query.includeDeleted) {
    conditions.push(isNull(participants.selfDeletedAt));
  }
  // Смена: для «Удалили профиль» + allShifts не фильтруем.
  // Иначе null shift_id тоже терялся бы на любой выбранной смене.
  if (!(query.onlySelfDeleted && query.allShifts) && query.shiftId != null && !Number.isNaN(query.shiftId)) {
    if (query.onlySelfDeleted) {
      conditions.push(or(
        eq(participants.shiftId, query.shiftId),
        isNull(participants.shiftId),
      )!);
    } else {
      conditions.push(eq(participants.shiftId, query.shiftId));
    }
  }
  if (query.ids?.length) {
    conditions.push(inArray(participants.id, query.ids));
  }
  if (query.q?.trim()) {
    const raw = query.q.trim();
    const pattern = `%${escapeIlike(raw)}%`;
    const nameMatch = buildParticipantNameMatch(raw)!;
    const vkNum = Number(raw);
    if (!Number.isNaN(vkNum) && String(vkNum) === raw.replace(/\s/g, '')) {
      conditions.push(or(
        nameMatch,
        ilike(participants.direction, pattern),
        eq(participants.vkId, vkNum),
        sql`CAST(${participants.id} AS TEXT) = ${raw}`,
      )!);
    } else {
      conditions.push(or(
        nameMatch,
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
  // Фильтр активности не применяем к «Удалили профиль» — иначе список часто пустой.
  if (!query.onlySelfDeleted) {
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

export function buildParticipantOrderBy(query: ParticipantListQuery): SQL[] {
  const dirFn = query.dir === 'asc' ? asc : desc;
  const sort = query.sort;

  if (sort === 'consent') {
    const expr = profileAiConsentOrderExpr(query.consentFieldKeys ?? []);
    if (expr) {
      return [
        query.dir === 'asc' ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`,
        desc(participants.id),
      ];
    }
  }

  if (sort === 'rating') {
    return [
      dirFn(sql`COALESCE(${participants.pathPoints}, 0) + COALESCE(${participants.experiencePoints}, 0)`),
      desc(participants.id),
    ];
  }
  if (sort === 'name') {
    return [dirFn(participants.lastName), dirFn(participants.firstName), desc(participants.id)];
  }
  if (sort === 'id') return [dirFn(participants.id)];
  if (sort === 'vkId') return [dirFn(participants.vkId), desc(participants.id)];
  if (sort === 'direction') return [dirFn(participants.direction), desc(participants.id)];
  if (sort === 'group') return [dirFn(participants.groupName), desc(participants.id)];
  if (sort === 'region') return [dirFn(participants.region), desc(participants.id)];
  if (sort === 'role') return [dirFn(participants.pedagogicalRole), desc(participants.id)];
  if (sort === 'path') return [dirFn(participants.pathPoints), desc(participants.id)];
  if (sort === 'experience') return [dirFn(participants.experiencePoints), desc(participants.id)];
  if (sort === 'activity') {
    return query.onlySelfDeleted
      ? [dirFn(participants.selfDeletedAt), desc(participants.id)]
      : [dirFn(participants.lastActiveAt), desc(participants.id)];
  }
  if (sort === 'hiddenAt') return [dirFn(participants.selfDeletedAt), desc(participants.id)];

  return query.onlySelfDeleted
    ? [desc(participants.selfDeletedAt), desc(participants.id)]
    : [desc(participants.createdAt), desc(participants.id)];
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
    .orderBy(...buildParticipantOrderBy(query))
    .limit(limit).offset(offset);
  if (where) listQuery = listQuery.where(where) as typeof listQuery;
  const list = await listQuery;

  let incompleteCount = 0;
  if (!query.onlySelfDeleted) {
    const incompleteWhere = and(
      where,
      isNull(participants.onboardingCompletedAt),
    );
    const [incomplete] = await db.select({ count: count() }).from(participants)
      .where(incompleteWhere);
    incompleteCount = Number(incomplete?.count ?? 0);
  }

  return {
    participants: list.map(mapParticipantListRow),
    totalCount: total.count,
    incompleteCount,
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

  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : '';
  const sort = (PARTICIPANT_LIST_SORTS as readonly string[]).includes(sortRaw)
    ? sortRaw as ParticipantListSort
    : undefined;
  const dir = req.query.dir === 'asc' || req.query.dir === 'desc' ? req.query.dir : undefined;

  return {
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
    directionIds,
    groupId: req.query.groupId != null ? Number(req.query.groupId) : undefined,
    pedagogicalRole: typeof req.query.pedagogicalRole === 'string' ? req.query.pedagogicalRole : undefined,
    strongRole: typeof req.query.strongRole === 'string' ? req.query.strongRole : undefined,
    activity: validActivity,
    sort,
    dir,
    includeDeleted: req.query.includeDeleted === 'true' || req.query.includeDeleted === '1',
    onlySelfDeleted: req.query.onlySelfDeleted === 'true' || req.query.onlySelfDeleted === '1'
      || req.query.list === 'hidden',
    // Для «Удалили профиль» по умолчанию все смены; явно allShifts=false — только текущая.
    allShifts: req.query.allShifts === 'false' || req.query.allShifts === '0'
      ? false
      : (req.query.allShifts === 'true' || req.query.allShifts === '1'
        || req.query.onlySelfDeleted === 'true' || req.query.onlySelfDeleted === '1'
        || req.query.list === 'hidden'),
    ids,
    shiftId: req.query.shiftId != null && req.query.shiftId !== ''
      ? Number(req.query.shiftId)
      : undefined,
  };
}
