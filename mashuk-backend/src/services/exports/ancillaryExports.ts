import { eq, desc, and, isNull, like, or } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import {
  adminActionsLog, exchangeAnswers, exchangeQuestions,
  medals, participants, pointsLog, tasks, taskSubmissions, userMedals, piggybank,
} from '../../db/schema.js';
import { queryPiggybankForExport } from '../../controllers/adminPiggybankController.js';
import { isPublishedStatus } from '../publishStatus.js';
import { addReadmeSheet, fullName } from './exportCommon.js';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { createWorkbook, sendWorkbook, sendCsv } from './workbook.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';

export async function writePiggybankFullExport(req: AdminRequest, res: Response): Promise<void> {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const rows = await queryPiggybankForExport(req);
  if (format !== 'xlsx') {
    sendCsv(
      res,
      'piggybank.csv',
      'created_at,participant,direction,group,day,tags,source,text',
      rows.map(r => [
        r.createdAt, r.participantName, r.directionName ?? '', '',
        r.tags, r.source ?? '', r.text,
      ]),
    );
    return;
  }
  const wb = await createWorkbook();
  addReadmeSheet(wb, ['Копилка + сводки по тегам и источникам.']);
  const ws = wb.addWorksheet('Записи');
  ws.addRow(['participant_id', 'direction', 'group', 'day', 'time', 'text', 'tag', 'source', 'block_link']);
  for (const r of rows) {
    ws.addRow([
      '', r.directionName, '', '', r.createdAt, r.text, r.tags, r.source ?? '', '',
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
  wsTags.addRow(['tag', 'count']);
  for (const [tag, count] of tagAgg) wsTags.addRow([tag, count]);
  const wsSrc = wb.addWorksheet('По источникам');
  wsSrc.addRow(['source', 'count']);
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

export async function writeTaskSubmissionsFullExport(res: Response): Promise<void> {
  const rows = await db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  sendCsv(
    res,
    'task_submissions.csv',
    'participant_id,task_id,status,answer,photo,link,submitted_at,checked_at,points,moderator_comment',
    rows.map(r => [
      r.p?.id, r.t?.id, r.s.status, r.s.answerText ?? '', r.s.photoUrl ?? '', r.s.postUrl ?? '',
      r.s.submittedAt, r.s.checkedAt, r.s.pointsAwarded, r.s.moderatorComment ?? '',
    ]),
  );
}

export async function writeRatingDayExport(res: Response, day: number): Promise<void> {
  const allP = await db.select().from(participants).where(isNull(participants.selfDeletedAt));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'day', day, track: 'total' });
  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  sendCsv(
    res,
    `leaderboard_day${day}.csv`,
    'rank,participant_id,name,points',
    ranked.map((r, i) => [i + 1, r.p.id, fullName(r.p), r.pts]),
  );
}

export async function writeRatingShiftExport(res: Response): Promise<void> {
  const allP = await db.select().from(participants).where(isNull(participants.selfDeletedAt));
  const ids = allP.map(p => p.id);
  const { computeLeaderboardScores } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'shift', track: 'total' });
  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  sendCsv(
    res,
    'leaderboard_shift.csv',
    'rank,participant_id,name,points,path,experience,bonus',
    ranked.map((r, i) => [
      i + 1, r.p.id, fullName(r.p), r.pts,
      r.p.pathPoints ?? 0, r.p.experiencePoints ?? 0, r.p.bonusPoints ?? 0,
    ]),
  );
}

export async function writeRatingNominationExport(res: Response, nominationKey: string): Promise<void> {
  const allTasks = await db.select().from(tasks);
  const taskIds = new Set(
    allTasks.filter(t => t.nomination === nominationKey).map(t => t.id),
  );
  const subs = await db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  const byParticipant = new Map<number, { p: typeof participants.$inferSelect; pts: number }>();
  for (const r of subs) {
    if (!r.p || !r.s.taskId || !taskIds.has(r.s.taskId)) continue;
    if (r.s.status !== 'approved') continue;
    const cur = byParticipant.get(r.p.id) ?? { p: r.p, pts: 0 };
    cur.pts += r.s.pointsAwarded ?? r.t?.points ?? 0;
    byParticipant.set(r.p.id, cur);
  }
  const ranked = [...byParticipant.values()].sort((a, b) => b.pts - a.pts);
  sendCsv(
    res,
    `nomination_${nominationKey}.csv`,
    'rank,participant_id,name,points',
    ranked.map((r, i) => [i + 1, r.p.id, fullName(r.p), r.pts]),
  );
}

export async function writeMedalsExport(res: Response): Promise<void> {
  const rows = await db.select({ um: userMedals, p: participants, m: medals })
    .from(userMedals)
    .leftJoin(participants, eq(userMedals.participantId, participants.id))
    .leftJoin(medals, eq(userMedals.medalId, medals.id));
  sendCsv(
    res,
    'medals_awarded.csv',
    'participant_id,name,medal,level,awarded_at',
    rows.map(r => [r.p?.id, fullName(r.p), r.m?.name, r.m?.level, r.um.awardedAt]),
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
  const { countTouchpointsForDay } = await import('../../controllers/programController.js');
  const rows = await Promise.all(allP.map(async p => {
    let tp = 0;
    for (let d = 1; d <= 7; d++) {
      const c = await countTouchpointsForDay(p.id, d);
      tp += c.completed;
    }
    return [
      String(p.id), fullName(p), p.direction ?? '', p.groupName ?? '',
      p.lastActiveAt ? new Date(p.lastActiveAt).toISOString() : '',
      String(p.pathPoints ?? 0), String(p.experiencePoints ?? 0), String(tp),
    ];
  }));
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
  sendCsv(
    res,
    'delayed_measure_template.csv',
    'participant_id,full_name,measure_date,notes',
    [],
  );
}
