import { eq, desc, asc, and, isNull, like, or, inArray, lte, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import {
  adminActionsLog, answers, exchangeAnswers, exchangeQuestions,
  medals, orgMessages, orgThreads, participants, pointsLog, questions, tasks, taskSubmissions, userMedals, piggybank, forumSettings, directions,
  participantDayState,
} from '../../db/schema.js';
import { queryPiggybankForExport } from '../../controllers/adminPiggybankController.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';
import { getShiftById } from '../shiftService.js';
import { addReadmeSheet, fullName } from './exportCommon.js';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { createWorkbook, sendWorkbook, sendCsv, sendSimpleXlsx } from './workbook.js';
import { sendLeaderboardCsv, sendLeaderboardXlsx } from './leaderboardExportHelpers.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';

export async function writePiggybankFullExport(req: AdminRequest, res: Response): Promise<void> {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const rows = await queryPiggybankForExport(req);
  if (format !== 'xlsx') {
    sendCsv(
      res,
      'piggybank.csv',
      'created_at,participant_id,participant,direction,group,day,tags,source,text,is_hidden,is_violation',
      rows.map(r => [
        r.createdAt, r.participantId, r.participantName, r.directionName ?? '', r.groupName ?? '',
        r.forumDay ?? '', r.tags, r.source ?? '', r.text,
        r.isHidden ? '1' : '0', r.isViolation ? '1' : '0',
      ]),
    );
    return;
  }
  const wb = await createWorkbook();
  addReadmeSheet(wb, ['Копилка + сводки по тегам и источникам. Колонки совпадают с данными в админке.']);
  const ws = wb.addWorksheet('Записи');
  ws.addRow(['ID участника', 'Участник', 'Направление', 'Группа', 'День', 'Дата', 'Текст', 'Теги', 'Источник', 'Скрыто', 'Нарушение']);
  for (const r of rows) {
    ws.addRow([
      r.participantId,
      r.participantName,
      r.directionName ?? '',
      r.groupName ?? '',
      r.forumDay ?? '',
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      r.text,
      r.tags,
      r.source ?? '',
      r.isHidden ? 'да' : '',
      r.isViolation ? 'да' : '',
    ]);
  }
  const tagAgg = new Map<string, number>();
  const srcAgg = new Map<string, number>();
  for (const r of rows) {
    const tags = String(r.tags || 'прочее').split(/[,;]/).map(t => t.trim()).filter(Boolean);
    for (const t of tags) tagAgg.set(t, (tagAgg.get(t) || 0) + 1);
    const src = r.source || 'unknown';
    srcAgg.set(src, (srcAgg.get(src) || 0) + 1);
  }
  const wsTags = wb.addWorksheet('По тегам');
  wsTags.addRow(['Тег', 'Количество']);
  for (const [tag, count] of tagAgg) wsTags.addRow([tag, count]);
  const wsSrc = wb.addWorksheet('По источникам');
  wsSrc.addRow(['Источник', 'Количество']);
  for (const [src, count] of srcAgg) wsSrc.addRow([src, count]);
  await sendWorkbook(res, wb, 'piggybank.xlsx');
}

export async function writeTasksCatalogExport(res: Response): Promise<void> {
  const all = await db.select().from(tasks);
  const published = all.filter(t => isPublishedStatus(t.status));
  const wb = await createWorkbook();
  const ws = wb.addWorksheet('Каталог');
  ws.addRow(['id', 'title', 'description', 'category', 'nomination', 'points', 'execution_type', 'confirmation', 'status']);
  for (const t of published) {
    ws.addRow([
      t.id, t.title, t.description, t.category, t.nomination, t.points,
      t.executionType, t.confirmationType, t.status,
    ]);
  }
  await sendWorkbook(res, wb, 'tasks_catalog.xlsx');
}

export async function writeTaskSubmissionsFullExport(
  res: Response,
  opts: { format?: string; shiftId?: number } = {},
): Promise<void> {
  const format = String(opts.format || 'xlsx').toLowerCase();
  const conditions = [];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  let q = db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  if (where) q = q.where(where) as typeof q;
  const rows = await q;
  const headers = [
    'ID участника', 'ФИО', 'ID задания', 'Задание', 'Статус', 'Ответ', 'Фото', 'Ссылка',
    'Отправлено', 'Проверено', 'Баллы', 'Комментарий модератора',
  ];
  const data = rows.map(r => [
    r.p?.id ?? '',
    fullName(r.p),
    r.t?.id ?? '',
    r.t?.title ?? '',
    r.s.status,
    r.s.answerText ?? '',
    r.s.photoUrl ?? '',
    r.s.postUrl ?? '',
    r.s.submittedAt ? new Date(r.s.submittedAt).toISOString() : '',
    r.s.checkedAt ? new Date(r.s.checkedAt).toISOString() : '',
    r.s.pointsAwarded ?? '',
    r.s.moderatorComment ?? '',
  ]);
  if (format === 'csv') {
    sendCsv(
      res,
      'task_submissions.csv',
      'participant_id,name,task_id,task_title,status,answer,photo,link,submitted_at,checked_at,points,moderator_comment',
      data,
    );
    return;
  }
  await sendSimpleXlsx(res, 'task_submissions.xlsx', 'Заявки', headers, data);
}

export async function writeRatingDayExport(
  res: Response,
  day: number,
  opts: { format?: string; shiftId?: number; direction?: string; groupId?: number } = {},
): Promise<void> {
  const format = String(opts.format || 'xlsx').toLowerCase();
  const conditions = [isNull(participants.selfDeletedAt)];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  if (opts.direction) conditions.push(or(eq(participants.direction, opts.direction), eq(directions.name, opts.direction))!);
  if (opts.groupId != null && !Number.isNaN(opts.groupId)) {
    conditions.push(eq(participants.groupId, opts.groupId));
  }
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор форума'));
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор'));
  const allP = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name,
    groupName: participants.groupName,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...conditions));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores, computeMedalCountLeaderboard } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'day', day, track: 'total' });
  const medalCounts = await computeMedalCountLeaderboard(ids, { scope: 'day', day });

  const medalNamesByPid = new Map<number, string[]>();
  if (ids.length) {
    const { clampForumDay } = await import('../leaderboardQuery.js');
    const safeDay = clampForumDay(day);
    const shift = opts.shiftId != null ? await getShiftById(opts.shiftId) : null;
    let dayStart: Date | null = null;
    let dayEnd: Date | null = null;
    if (shift?.startDate) {
      dayStart = new Date(shift.startDate);
      dayStart.setUTCDate(dayStart.getUTCDate() + (safeDay - 1));
      dayStart.setUTCHours(0, 0, 0, 0);
      dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    }
    const medalRows = await db.select({
      participantId: userMedals.participantId,
      name: medals.name,
      awardedAt: userMedals.awardedAt,
    }).from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(inArray(userMedals.participantId, ids));
    for (const r of medalRows) {
      if (!r.participantId || !r.name) continue;
      if (dayStart && dayEnd && r.awardedAt) {
        const t = new Date(r.awardedAt);
        if (t < dayStart || t >= dayEnd) continue;
      }
      const list = medalNamesByPid.get(r.participantId) ?? [];
      list.push(r.name);
      medalNamesByPid.set(r.participantId, list);
    }
  }

  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0, mc: medalCounts.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts || b.mc - a.mc);
  const data = ranked.map((r, i) => [
    i + 1, r.p.id, fullName(r.p), r.p.direction ?? '', r.p.groupName ?? '', r.pts,
    r.mc, (medalNamesByPid.get(r.p.id) ?? []).join('; '),
  ]);
  const meta = {
    exportType: 'rating_day',
    participantCount: ranked.length,
    participantsPool: allP.length,
    scope: 'day' as const,
    day,
    track: 'total',
  };
  if (format === 'csv') {
    sendLeaderboardCsv(
      res,
      `leaderboard_day${day}.csv`,
      'rank,participant_id,name,direction,group,points,medal_count,medals',
      data,
      meta,
    );
    return;
  }
  await sendLeaderboardXlsx(
    res,
    `rating_day_${day}.xlsx`,
    'Рейтинг',
    ['Место', 'ID участника', 'ФИО', 'Направление', 'Группа', 'Баллы', 'Медалей', 'Медали'],
    data,
    meta,
  );
}

export async function writeRatingTotalExport(
  res: Response,
  opts: { format?: string; shiftId?: number; direction?: string; groupId?: number; track?: string } = {},
): Promise<void> {
  const format = String(opts.format || 'csv').toLowerCase();
  const track = opts.track || 'total';
  const conditions = [isNull(participants.selfDeletedAt)];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  if (opts.direction) conditions.push(or(eq(participants.direction, opts.direction), eq(directions.name, opts.direction))!);
  if (opts.groupId != null && !Number.isNaN(opts.groupId)) {
    conditions.push(eq(participants.groupId, opts.groupId));
  }
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор форума'));
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор'));
  const allP = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name,
    groupName: participants.groupName,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...conditions));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'total', track });

  const medalNamesByPid = new Map<number, string[]>();
  if (ids.length) {
    const medalRows = await db.select({
      participantId: userMedals.participantId,
      name: medals.name,
    }).from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(inArray(userMedals.participantId, ids));
    for (const r of medalRows) {
      if (!r.participantId || !r.name) continue;
      const list = medalNamesByPid.get(r.participantId) ?? [];
      list.push(r.name);
      medalNamesByPid.set(r.participantId, list);
    }
  }

  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const data = ranked.map((r, i) => [
    i + 1, r.p.id, fullName(r.p), r.p.direction ?? '', r.p.groupName ?? '',
    r.pts, r.p.pathPoints ?? 0, r.p.experiencePoints ?? 0, r.p.bonusPoints ?? 0,
    (medalNamesByPid.get(r.p.id) ?? []).join('; '),
  ]);
  const meta = {
    exportType: 'rating_total',
    participantCount: ranked.length,
    participantsPool: allP.length,
    scope: 'total' as const,
    track,
  };
  if (format === 'xlsx') {
    await sendLeaderboardXlsx(
      res,
      'leaderboard_total.xlsx',
      'Итоговый рейтинг',
      ['Место', 'ID', 'ФИО', 'Направление', 'Группа', 'Баллы', 'Путь', 'Опыт', 'Бонус', 'Медали'],
      data,
      meta,
    );
    return;
  }
  sendLeaderboardCsv(
    res,
    'leaderboard_total.csv',
    'rank,participant_id,name,direction,group,points,path,experience,bonus,medals',
    data,
    meta,
  );
}

export async function writeRatingShiftExport(
  res: Response,
  opts: { format?: string; shiftId?: number } = {},
): Promise<void> {
  const format = String(opts.format || 'csv').toLowerCase();
  const conditions = [isNull(participants.selfDeletedAt)];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор форума'));
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор'));
  const allP = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name,
    groupName: participants.groupName,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...conditions));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'shift', track: 'total' });

  const medalsByPid = new Map<number, string[]>();
  const nomsByPid = new Map<number, Set<string>>();
  if (ids.length) {
    const medalRows = await db.select({
      participantId: userMedals.participantId,
      name: medals.name,
    }).from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(inArray(userMedals.participantId, ids));
    for (const r of medalRows) {
      if (!r.participantId || !r.name) continue;
      const list = medalsByPid.get(r.participantId) ?? [];
      list.push(r.name);
      medalsByPid.set(r.participantId, list);
    }
    const nomRows = await db.select({
      participantId: taskSubmissions.participantId,
      nomination: tasks.nomination,
      status: taskSubmissions.status,
    }).from(taskSubmissions)
      .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(and(
        inArray(taskSubmissions.participantId, ids),
        eq(taskSubmissions.status, 'approved'),
      ));
    for (const r of nomRows) {
      if (!r.nomination) continue;
      const set = nomsByPid.get(r.participantId) ?? new Set<string>();
      set.add(r.nomination);
      nomsByPid.set(r.participantId, set);
    }
  }

  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const data = ranked.map((r, i) => [
    i + 1, r.p.id, fullName(r.p), r.pts,
    r.p.pathPoints ?? 0, r.p.experiencePoints ?? 0, r.p.bonusPoints ?? 0,
    (medalsByPid.get(r.p.id) ?? []).join('; '),
    [...(nomsByPid.get(r.p.id) ?? [])].join('; '),
  ]);
  const meta = {
    exportType: 'rating_shift',
    participantCount: ranked.length,
    participantsPool: allP.length,
    scope: 'shift' as const,
    track: 'total',
  };
  if (format === 'xlsx') {
    await sendLeaderboardXlsx(
      res,
      'leaderboard_shift.xlsx',
      'Рейтинг',
      ['Место', 'ID участника', 'ФИО', 'Баллы', 'Путь', 'Опыт', 'Бонус', 'Медали', 'Номинации'],
      data,
      meta,
    );
    return;
  }
  sendLeaderboardCsv(
    res,
    'leaderboard_shift.csv',
    'rank,participant_id,name,points,path,experience,bonus,medals,nominations',
    data,
    meta,
  );
}

export async function writeRatingNominationExport(
  res: Response,
  nominationKey: string,
  opts: { scope?: 'day' | 'shift'; day?: number; format?: string; shiftId?: number } = {},
): Promise<void> {
  const format = String(opts.format || 'csv').toLowerCase();
  const scope = opts.scope === 'day' ? 'day' : 'shift';
  const conditions = [isNull(participants.selfDeletedAt)];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор форума'));
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор'));
  const allP = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name,
    groupName: participants.groupName,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...conditions));
  const ids = allP.map(p => p.id);
  const { computeNominationLeaderboard, NOMINATION_LABELS } = await import('../leaderboardService.js');
  const scores = await computeNominationLeaderboard(nominationKey, ids, {
    scope,
    day: scope === 'day' ? opts.day : undefined,
  });
  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .filter(r => r.pts > 0)
    .sort((a, b) => b.pts - a.pts);
  const data = ranked.map((r, i) => [i + 1, r.p.id, fullName(r.p), r.p.direction ?? '', r.pts]);
  const meta = {
    exportType: 'rating_nomination',
    participantCount: ranked.length,
    participantsPool: allP.length,
    scope: scope as 'day' | 'shift',
    day: scope === 'day' ? opts.day : undefined,
    nomination: nominationKey,
  };
  const suffix = scope === 'day' && opts.day ? `_day${opts.day}` : '_shift';
  if (format === 'xlsx') {
    await sendLeaderboardXlsx(
      res,
      `nomination_${nominationKey}${suffix}.xlsx`,
      NOMINATION_LABELS[nominationKey] ?? nominationKey,
      ['Место', 'ID участника', 'ФИО', 'Направление', 'Баллы'],
      data,
      meta,
    );
    return;
  }
  sendLeaderboardCsv(
    res,
    `nomination_${nominationKey}${suffix}.csv`,
    'rank,participant_id,name,direction,points',
    data,
    meta,
  );
}

export async function writeMedalLeaderboardExport(
  res: Response,
  opts: {
    format?: string;
    shiftId?: number;
    scope?: 'day' | 'shift';
    day?: number;
    medalMode?: 'count' | 'holders';
    medalId?: number;
  } = {},
): Promise<void> {
  const format = String(opts.format || 'csv').toLowerCase();
  const scope = opts.scope === 'day' ? 'day' : 'shift';
  const medalMode = opts.medalMode === 'holders' ? 'holders' : 'count';
  const conditions = [isNull(participants.selfDeletedAt)];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор форума'));
  conditions.push(ne(sql`LOWER(COALESCE(${directions.name}, ${participants.direction}))`, 'организатор'));
  const allP = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: directions.name,
    groupName: participants.groupName,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants)
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...conditions));
  const ids = allP.map(p => p.id);
  const {
    computeMedalCountLeaderboard,
    participantIdsWithMedal,
  } = await import('../leaderboardService.js');

  let ranked: { p: typeof allP[number]; score: number }[];
  if (medalMode === 'holders' && opts.medalId) {
    const holders = await participantIdsWithMedal(opts.medalId);
    ranked = allP
      .filter(p => holders.has(p.id))
      .map(p => ({ p, score: 1 }))
      .sort((a, b) => fullName(a.p).localeCompare(fullName(b.p), 'ru'));
  } else {
    const scores = await computeMedalCountLeaderboard(ids, {
      scope,
      day: scope === 'day' ? opts.day : undefined,
    });
    ranked = allP
      .map(p => ({ p, score: scores.get(p.id) ?? 0 }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || fullName(a.p).localeCompare(fullName(b.p), 'ru'));
  }

  const data = ranked.map((r, i) => [i + 1, r.p.id, fullName(r.p), r.p.direction ?? '', r.score]);
  const meta = {
    exportType: 'medal_leaderboard',
    participantCount: ranked.length,
    participantsPool: allP.length,
    scope: scope as 'day' | 'shift',
    day: scope === 'day' ? opts.day : undefined,
    medalMode,
  };
  const suffix = scope === 'day' && opts.day ? `_day${opts.day}` : '_shift';
  const modeSuffix = medalMode === 'holders' && opts.medalId ? `_medal${opts.medalId}` : '_count';
  if (format === 'xlsx') {
    await sendLeaderboardXlsx(
      res,
      `medal_leaderboard${suffix}${modeSuffix}.xlsx`,
      'Медали',
      ['Место', 'ID участника', 'ФИО', 'Направление', medalMode === 'holders' ? 'Медаль' : 'Медалей'],
      data,
      meta,
    );
    return;
  }
  sendLeaderboardCsv(
    res,
    `medal_leaderboard${suffix}${modeSuffix}.csv`,
    'rank,participant_id,name,direction,medal_score',
    data,
    meta,
  );
}

export async function writeMedalsExport(
  res: Response,
  opts: { format?: string; shiftId?: number } = {},
): Promise<void> {
  const format = String(opts.format || 'xlsx').toLowerCase();
  const conditions = [];
  if (opts.shiftId != null && !Number.isNaN(opts.shiftId)) {
    conditions.push(eq(participants.shiftId, opts.shiftId));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  let q = db.select({ um: userMedals, p: participants, m: medals })
    .from(userMedals)
    .leftJoin(participants, eq(userMedals.participantId, participants.id))
    .leftJoin(medals, eq(userMedals.medalId, medals.id));
  if (where) q = q.where(where) as typeof q;
  const rows = await q;
  const data = rows.map(r => [
    r.p?.id ?? '',
    fullName(r.p),
    r.m?.name ?? '',
    r.m?.level ?? '',
    r.um.awardedAt ? new Date(r.um.awardedAt).toISOString() : '',
  ]);
  if (format === 'csv') {
    sendCsv(res, 'medals_awarded.csv', 'participant_id,name,medal,level,awarded_at', data);
    return;
  }
  await sendSimpleXlsx(
    res,
    'medals.xlsx',
    'Медали',
    ['ID участника', 'ФИО', 'Медаль', 'Уровень', 'Выдано'],
    data,
  );
}

export async function writeModerationLogExport(res: Response): Promise<void> {
  const rows = await db.select().from(adminActionsLog)
    .where(or(
      like(adminActionsLog.section, '%task%'),
      like(adminActionsLog.section, '%moder%'),
      like(adminActionsLog.actionType, '%moder%'),
    ))
    .orderBy(desc(adminActionsLog.createdAt));
  sendCsv(
    res,
    'moderation_log.csv',
    'Время,ID админа,Действие,Раздел,ID объекта',
    rows.map(r => [r.createdAt, r.adminId, r.actionType, r.section, r.objectId]),
  );
}

export async function writePointsManualExport(res: Response): Promise<void> {
  const rows = await db.select({ pl: pointsLog, p: participants })
    .from(pointsLog)
    .leftJoin(participants, eq(pointsLog.participantId, participants.id))
    .where(and(
      isNull(pointsLog.revokedAt),
      or(
        like(pointsLog.actionType, 'admin_manual%'),
      ),
    ));
  sendCsv(
    res,
    'points_manual.csv',
    'participant_id,name,action,points,time',
    rows.map(r => [r.p?.id, fullName(r.p), r.pl.actionType, r.pl.points, r.pl.createdAt]),
  );
}

/** Category slugs for exchange questions; empty map if table not migrated yet. */
async function loadExchangeCategorySlugById(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const { exchangeCategories } = await import('../../db/schema.js');
    const cats = await db.select({
      id: exchangeCategories.id,
      slug: exchangeCategories.slug,
    }).from(exchangeCategories);
    for (const c of cats) {
      if (c.id != null) map.set(c.id, c.slug || '');
    }
  } catch {
    /* exchange_categories may be missing on older DBs — export still works */
  }
  return map;
}

export async function collectExchangeExportRows(opts?: {
  shiftId?: number | null;
}): Promise<Array<Array<string | number>>> {
  const shiftId = opts?.shiftId;
  const inShift = (pShiftId: number | null | undefined) => (
    shiftId == null || pShiftId === shiftId
  );

  const colCheck = await db.execute(sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exchange_questions'
      AND column_name = 'category_id'
    LIMIT 1
  `);
  const hasCategoryId = (colCheck.rows as unknown[]).length > 0;

  // Raw selects: schema may lag migrations (no category_id / exchange_categories).
  const qRes = await db.execute(hasCategoryId
    ? sql`
      SELECT
        q.id, q.text, q.moderation_status, q.created_at, q.participant_id, q.category_id,
        p.first_name, p.last_name, p.direction, p.shift_id
      FROM exchange_questions q
      LEFT JOIN participants p ON p.id = q.participant_id
    `
    : sql`
      SELECT
        q.id, q.text, q.moderation_status, q.created_at, q.participant_id,
        NULL::int AS category_id,
        p.first_name, p.last_name, p.direction, p.shift_id
      FROM exchange_questions q
      LEFT JOIN participants p ON p.id = q.participant_id
    `);
  const aRes = await db.execute(sql`
    SELECT
      a.id, a.text, a.created_at, a.participant_id,
      p.first_name, p.last_name, p.direction, p.shift_id
    FROM exchange_answers a
    LEFT JOIN participants p ON p.id = a.participant_id
  `);

  const catById = await loadExchangeCategorySlugById();
  const qRows = (qRes.rows as Array<Record<string, unknown>>).filter(r => inShift(r.shift_id as number | null));
  const aRows = (aRes.rows as Array<Record<string, unknown>>).filter(r => inShift(r.shift_id as number | null));

  return [
    ...qRows.map(r => {
      const catId = r.category_id != null ? Number(r.category_id) : null;
      return [
        'вопрос',
        Number(r.id),
        r.participant_id != null ? Number(r.participant_id) : '',
        fullName({
          firstName: (r.first_name as string) ?? null,
          lastName: (r.last_name as string) ?? null,
        }),
        (r.direction as string) ?? '',
        (catId != null && !Number.isNaN(catId) ? catById.get(catId) : '') || '',
        String(r.text ?? ''),
        String(r.moderation_status ?? ''),
        r.created_at ? new Date(String(r.created_at)).toISOString() : '',
      ];
    }),
    ...aRows.map(r => [
      'ответ',
      Number(r.id),
      r.participant_id != null ? Number(r.participant_id) : '',
      fullName({
        firstName: (r.first_name as string) ?? null,
        lastName: (r.last_name as string) ?? null,
      }),
      (r.direction as string) ?? '',
      '',
      String(r.text ?? ''),
      '',
      r.created_at ? new Date(String(r.created_at)).toISOString() : '',
    ]),
  ];
}

export async function writeExchangeFullExport(
  res: Response,
  opts?: { format?: string; shiftId?: number | null },
): Promise<void> {
  const format = String(opts?.format || 'xlsx').toLowerCase();
  const rows = await collectExchangeExportRows({ shiftId: opts?.shiftId });
  const headers = [
    'Тип', 'ID', 'ID участника', 'ФИО', 'Направление', 'Категория', 'Текст', 'Статус', 'Время',
  ];
  if (format === 'csv') {
    sendCsv(res, 'exchange.csv', headers.join(','), rows);
    return;
  }
  await sendSimpleXlsx(res, 'exchange.xlsx', 'Обмен опытом', headers, rows);
}

const ORG_STATUS_RU: Record<string, string> = {
  waiting: 'Ожидает ответа',
  answered: 'Отвечено',
  closed: 'Закрыто',
};

const ORG_SENDER_RU: Record<string, string> = {
  participant: 'Участник',
  admin: 'Дирекция / админ',
};

/** Выгрузка «Связь с дирекцией»: обращения участников и переписка. */
export async function writeOrgDirectorExport(
  res: Response,
  opts?: { shiftId?: number | null; status?: string | null },
): Promise<void> {
  const conditions = [];
  if (opts?.shiftId != null) conditions.push(eq(participants.shiftId, opts.shiftId));
  if (opts?.status) conditions.push(eq(orgThreads.status, opts.status));

  const threads = await db.select({
    t: orgThreads,
    p: participants,
  }).from(orgThreads)
    .innerJoin(participants, eq(orgThreads.participantId, participants.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orgThreads.updatedAt));

  const threadIds = threads.map(r => r.t.id);
  const messages = threadIds.length
    ? await db.select().from(orgMessages)
      .where(inArray(orgMessages.threadId, threadIds))
      .orderBy(asc(orgMessages.createdAt), asc(orgMessages.id))
    : [];

  const messagesByThread = new Map<number, typeof messages>();
  for (const m of messages) {
    const list = messagesByThread.get(m.threadId) ?? [];
    list.push(m);
    messagesByThread.set(m.threadId, list);
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка «Связь с дирекцией» — обращения участников к дирекции форума.',
    'Лист «Обращения»: 1 строка = один тред (тема + первый вопрос участника).',
    'Лист «Сообщения»: вся переписка по тредам в хронологическом порядке.',
    `Тредов: ${threads.length}.`,
    `Сообщений: ${messages.length}.`,
    opts?.shiftId != null ? `Смена (shiftId): ${opts.shiftId}.` : 'Смена: без фильтра.',
    opts?.status ? `Статус: ${opts.status}.` : 'Статус: все.',
  ]);

  const wsThreads = wb.addWorksheet('Обращения');
  wsThreads.addRow([
    'ID треда',
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'Тема',
    'Первый вопрос участника',
    'Статус',
    'Сообщений',
    'От участника',
    'От дирекции',
    'Создано',
    'Обновлено',
  ]);

  for (const row of threads) {
    const list = messagesByThread.get(row.t.id) ?? [];
    const firstParticipantMsg = list.find(m => m.senderType === 'participant');
    const fromParticipant = list.filter(m => m.senderType === 'participant').length;
    const fromAdmin = list.filter(m => m.senderType === 'admin').length;
    const status = row.t.status || 'waiting';
    wsThreads.addRow([
      row.t.id,
      row.p.id,
      fullName(row.p),
      row.p.direction || '',
      row.p.groupName || '',
      row.t.subject || '',
      firstParticipantMsg?.text || row.t.subject || '',
      ORG_STATUS_RU[status] || status,
      list.length,
      fromParticipant,
      fromAdmin,
      row.t.createdAt ?? '',
      row.t.updatedAt ?? '',
    ]);
  }

  const wsMsg = wb.addWorksheet('Сообщения');
  wsMsg.addRow([
    'ID сообщения',
    'ID треда',
    'Тема треда',
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'Статус треда',
    'Кто написал',
    'ID отправителя',
    'Текст',
    'Время',
  ]);

  const threadMeta = new Map(threads.map(r => [r.t.id, r]));
  for (const m of messages) {
    const meta = threadMeta.get(m.threadId);
    if (!meta) continue;
    const status = meta.t.status || 'waiting';
    wsMsg.addRow([
      m.id,
      m.threadId,
      meta.t.subject || '',
      meta.p.id,
      fullName(meta.p),
      meta.p.direction || '',
      meta.p.groupName || '',
      ORG_STATUS_RU[status] || status,
      ORG_SENDER_RU[m.senderType] || m.senderType,
      m.senderId ?? '',
      m.text,
      m.createdAt ?? '',
    ]);
  }

  await sendWorkbook(res, wb, 'org_director.xlsx');
}

export async function writeActivityExport(
  res: Response,
  opts?: { format?: string; shiftId?: number | null },
): Promise<void> {
  const format = String(opts?.format || 'xlsx').toLowerCase();
  const shiftId = opts?.shiftId;
  if (shiftId == null) throw new Error('shiftId required for activity export');
  const pConds = [
    isNull(participants.selfDeletedAt),
    ne(sql`LOWER(${participants.direction})`, 'организатор форума'),
  ];
  if (shiftId != null) pConds.push(eq(participants.shiftId, shiftId));
  const allP = await db.select().from(participants).where(and(...pConds));
  const ids = allP.map(p => p.id);
  const now = new Date();
  const published = await db.select().from(questions)
    .where(and(
      eq(questions.shiftId, shiftId),
      eq(questions.status, 'published'),
      or(isNull(questions.publishTime), lte(questions.publishTime, now)),
    ));

  const answersByPid = new Map<number, Set<number>>();
  if (ids.length) {
    const allAns = await db.select({
      participantId: answers.participantId,
      questionId: answers.questionId,
    }).from(answers).where(inArray(answers.participantId, ids));
    for (const a of allAns) {
      if (a.questionId == null) continue;
      let set = answersByPid.get(a.participantId);
      if (!set) {
        set = new Set();
        answersByPid.set(a.participantId, set);
      }
      set.add(a.questionId);
    }
  }

  const dayQsCache = new Map<number, typeof published>();
  for (let d = 1; d <= 8; d++) {
    dayQsCache.set(d, published.filter(q => isTouchpointQuestionForForumDay(q, d)));
  }

  const eveningDoneByPid = new Map<number, Set<number>>();
  if (ids.length) {
    const eveningStates = await db.select({
      participantId: participantDayState.participantId,
      dayNumber: participantDayState.dayNumber,
      eveningRatings: participantDayState.eveningRatings,
    }).from(participantDayState).where(inArray(participantDayState.participantId, ids));
    for (const s of eveningStates) {
      if (s.dayNumber < 1 || s.dayNumber > 8) continue;
      if (s.eveningRatings == null || typeof s.eveningRatings !== 'object') continue;
      let set = eveningDoneByPid.get(s.participantId);
      if (!set) {
        set = new Set();
        eveningDoneByPid.set(s.participantId, set);
      }
      set.add(s.dayNumber);
    }
  }

  const headers = [
    'ID участника', 'ФИО', 'Направление', 'Группа', 'Последняя активность',
    'Баллы Путь', 'Баллы Опыт', 'Точки осмысления',
  ];
  const rows = allP.map(p => {
    const answeredIds = answersByPid.get(p.id) ?? new Set<number>();
    const eveningDays = eveningDoneByPid.get(p.id) ?? new Set<number>();
    let tp = 0;
    for (let d = 1; d <= 8; d++) {
      const dayQs = dayQsCache.get(d) ?? [];
      tp += touchpointCompletionRatio(dayQs, answeredIds, d, {
        eveningDone: eveningDays.has(d),
      }).completed;
    }
    return [
      p.id, fullName(p), p.direction ?? '', p.groupName ?? '',
      p.lastActiveAt ? new Date(p.lastActiveAt).toISOString() : '',
      p.pathPoints ?? 0, p.experiencePoints ?? 0, tp,
    ];
  });
  if (format === 'csv') {
    sendCsv(res, 'activity.csv', headers.join(','), rows);
    return;
  }
  await sendSimpleXlsx(res, 'activity.xlsx', 'Активность', headers, rows);
}

export async function writePointABSummaryExport(res: Response): Promise<void> {
  const rows = await loadEnrichedParticipants();
  
  const { DEFAULT_EVENING_QUESTIONNAIRE_CONFIG } = await import('../eveningQuestionnaireConfig.js');
  const eveningFields = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.flatMap(s => s.fields);
  const goalFields = (await import('../roleService.js')).ROLE_CATALOG[0] ? [] : []; // Just to trigger import if needed
  
  // Actually load goal questions from forum settings to get the exact labels
  const [settings] = await db.select().from(forumSettings).limit(1);
  const onboarding = (settings as any)?.roleDiagnosticsConfig?.goalQuestions || [];

  const headers = [
    'ФИО',
    ...onboarding.map((q: any) => `Точка А: ${q.text}`),
    ...onboarding.map((q: any) => `Точка Б: ${q.text}`),
    'Роль на входе',
    'Сильная роль',
    'Роль роста'
  ];

  const data = rows.map(r => {
    const pointA = Array.isArray(r.pointA) ? r.pointA : [];
    const pointB = Array.isArray(r.pointB) ? r.pointB : [];
    
    return [
      r.fullName,
      ...onboarding.map((_: any, i: number) => pointA[i] || ''),
      ...onboarding.map((_: any, i: number) => pointB[i] || ''),
      r.startRole || '',
      r.strongRole || '',
      r.growthRole || ''
    ];
  });

  sendCsv(
    res,
    'point_a_b_summary.csv',
    headers.join(','),
    data
  );
}

export async function writeDelayedMeasureTemplate(res: Response, shiftId?: number | null): Promise<void> {
  const { buildDelayedMeasureRows } = await import('./delayedMeasureService.js');
  const built = await buildDelayedMeasureRows(7, shiftId);
  sendCsv(
    res,
    'delayed_measure_template.csv',
    'participant_id,full_name,measure_date,notes',
    built.rows.map(r => [r.participant_id, r.full_name, r.measure_date, r.notes]),
  );
}
