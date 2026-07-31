import { eq, desc, and, isNull, like, or, inArray, lte } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import {
  adminActionsLog, answers, exchangeAnswers, exchangeQuestions,
  medals, participants, pointsLog, questions, tasks, taskSubmissions, userMedals, piggybank,
} from '../../db/schema.js';
import { queryPiggybankForExport } from '../../controllers/adminPiggybankController.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';
import { resolveActiveShiftId } from '../shiftService.js';
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
  if (opts.direction) conditions.push(eq(participants.direction, opts.direction));
  if (opts.groupId != null && !Number.isNaN(opts.groupId)) {
    conditions.push(eq(participants.groupId, opts.groupId));
  }
  const allP = await db.select().from(participants).where(and(...conditions));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores, computeMedalCountLeaderboard } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'day', day, track: 'total' });
  const medalCounts = await computeMedalCountLeaderboard(ids, { scope: 'day', day });

  const medalNamesByPid = new Map<number, string[]>();
  if (ids.length) {
    const { clampForumDay } = await import('../leaderboardQuery.js');
    const safeDay = clampForumDay(day);
    const shift = await (await import('../shiftService.js')).resolveActiveShift();
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
  if (opts.direction) conditions.push(eq(participants.direction, opts.direction));
  if (opts.groupId != null && !Number.isNaN(opts.groupId)) {
    conditions.push(eq(participants.groupId, opts.groupId));
  }
  const allP = await db.select().from(participants).where(and(...conditions));
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
  const allP = await db.select().from(participants).where(and(...conditions));
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
  const allP = await db.select().from(participants).where(and(...conditions));
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
  const allP = await db.select().from(participants).where(and(...conditions));
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
    .orderBy(desc(adminActionsLog.createdAt))
    .limit(5000);
  sendCsv(
    res,
    'moderation_log.csv',
    'time,admin_id,action,section,object_id',
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

export async function writeExchangeFullExport(res: Response): Promise<void> {
  const qs = await db.select({ q: exchangeQuestions, p: participants })
    .from(exchangeQuestions)
    .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id));
  const ans = await db.select({ a: exchangeAnswers, p: participants, q: exchangeQuestions })
    .from(exchangeAnswers)
    .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
    .leftJoin(exchangeQuestions, eq(exchangeAnswers.questionId, exchangeQuestions.id));
  sendCsv(
    res,
    'exchange.csv',
    'kind,id,participant_id,name,direction,text,status,time,points',
    [
      ...qs.map(r => ['question', r.q.id, r.p?.id, fullName(r.p), r.p?.direction, r.q.text, r.q.moderationStatus, r.q.createdAt, '']),
      ...ans.map(r => ['answer', r.a.id, r.p?.id, fullName(r.p), r.p?.direction, r.a.text, '', r.a.createdAt, '']),
    ],
  );
}

export async function writeActivityExport(res: Response): Promise<void> {
  const allP = await db.select().from(participants).where(isNull(participants.selfDeletedAt));
  const ids = allP.map(p => p.id);
  const shiftId = await resolveActiveShiftId();
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
  for (let d = 1; d <= 7; d++) {
    dayQsCache.set(d, published.filter(q => isTouchpointQuestionForForumDay(q, d)));
  }

  const rows = allP.map(p => {
    const answeredIds = answersByPid.get(p.id) ?? new Set<number>();
    let tp = 0;
    for (let d = 1; d <= 7; d++) {
      const dayQs = dayQsCache.get(d) ?? [];
      tp += touchpointCompletionRatio(dayQs, answeredIds, d).completed;
    }
    return [
      String(p.id), fullName(p), p.direction ?? '', p.groupName ?? '',
      p.lastActiveAt ? new Date(p.lastActiveAt).toISOString() : '',
      String(p.pathPoints ?? 0), String(p.experiencePoints ?? 0), String(tp),
    ];
  });
  sendCsv(
    res,
    'activity.csv',
    'participant_id,name,direction,group,last_active,path_points,exp_points,touchpoints_completed',
    rows,
  );
}

export async function writePointABSummaryExport(res: Response): Promise<void> {
  const rows = await loadEnrichedParticipants();
  sendCsv(
    res,
    'point_a_b_summary.csv',
    'id,name,point_a,point_b,start_role,strong_role,growth_role',
    rows.map(r => [r.id, r.fullName, r.pointA, r.pointB, r.startRole, r.strongRole, r.growthRole]),
  );
}

export async function writeDelayedMeasureTemplate(res: Response): Promise<void> {
  const { buildDelayedMeasureRows } = await import('./delayedMeasureService.js');
  const built = await buildDelayedMeasureRows(7);
  sendCsv(
    res,
    'delayed_measure_template.csv',
    'participant_id,full_name,measure_date,notes',
    built.rows.map(r => [r.participant_id, r.full_name, r.measure_date, r.notes]),
  );
}
