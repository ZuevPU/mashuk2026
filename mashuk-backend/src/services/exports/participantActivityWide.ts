import type { Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  answers, participantDayState, piggybank, questions, taskSubmissions, tasks,
} from '../../db/schema.js';
import { emotionIdToZone, EMOTION_ZONE_LABELS } from '../emotionZones.js';
import { parseCheckinPayload } from '../analytics/zoneDistribution.js';
import { isPublishedStatus } from '../publishStatus.js';
import { EVENING_SCALE_KEYS } from '../touchpointTemplates.js';
import { computeLeaderboardScores } from '../leaderboardService.js';
import {
  addReadmeSheet,
  answerText,
  formatTs,
  fullName,
} from './exportCommon.js';
import { isEveningSummaryQuestion } from './eveningExportData.js';
import { touchpointTypeForQuestion } from './touchpointFilter.js';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { roleLabel } from './exportLabels.js';
import type { ParticipantListQuery } from '../participantsList.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

const FORUM_DAYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TEXT_CELL_LIMIT = 500;

export type WideParams = {
  day?: number;
  direction?: string;
  group?: string;
  participantId?: number;
  shiftId?: number | null;
};

export type ExportColumnDef = { key: string; label: string };

const DAY_BASE_COLUMNS: ExportColumnDef[] = [
  { key: 'id', label: 'ID' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'vk_id', label: 'VK ID' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'registered_at', label: 'Регистрация' },
  { key: 'start_role', label: 'Роль на входе' },
  { key: 'strong_role', label: 'Сильная роль' },
  { key: 'path_points', label: 'Путь' },
  { key: 'experience_points', label: 'Опыт' },
  { key: 'bonus_points', label: 'Бонус' },
  { key: 'total_rating', label: 'Рейтинг всего' },
  { key: 'forum_day', label: 'День форума' },
  { key: 'checkin_done', label: 'Check-in сдан (0/1)' },
  { key: 'checkin_zone', label: 'Check-in зона' },
  { key: 'checkin_count', label: 'Check-in ответов' },
  { key: 'direction_done', label: 'Направление сдано (0/1)' },
  { key: 'direction_answers_count', label: 'Направление · ответов' },
  { key: 'lesson_important_done', label: 'Урок о важном сдан (0/1)' },
  { key: 'lesson_important_count', label: 'Урок о важном · ответов' },
  { key: 'lesson_open_done', label: 'Открытый урок сдан (0/1)' },
  { key: 'lesson_open_count', label: 'Открытый урок · ответов' },
  { key: 'evening_done', label: 'Итоги дня сданы (0/1)' },
  { key: 'evening_direction', label: 'Итоги · направление' },
  { key: 'evening_lessonsImportant', label: 'Итоги · уроки о важном' },
  { key: 'evening_openLessons', label: 'Итоги · открытые уроки' },
  { key: 'evening_curator', label: 'Итоги · куратор' },
  { key: 'tasks_submitted_count', label: 'Заданий подано' },
  { key: 'tasks_approved_count', label: 'Заданий одобрено' },
  { key: 'tasks_points', label: 'Баллы за задания' },
  { key: 'active_role', label: 'Активная роль' },
  { key: 'tomorrow_role', label: 'Роль на завтра' },
  { key: 'experiment_status', label: 'Статус эксперимента' },
  { key: 'piggybank_entries_count', label: 'Копилка · записей' },
  { key: 'ideas_count', label: 'Идей' },
  { key: 'day_points', label: 'Баллы за день' },
];

function shiftDayColumns(): ExportColumnDef[] {
  const cols: ExportColumnDef[] = [];
  for (const d of FORUM_DAYS) {
    cols.push(
      { key: `checkin_d${d}`, label: `Check-in D${d} (0/1)` },
      { key: `evening_d${d}`, label: `Итоги D${d} (0/1)` },
      { key: `answers_d${d}`, label: `Ответов D${d}` },
      { key: `tasks_d${d}`, label: `Заданий D${d}` },
      { key: `role_d${d}`, label: `Роль D${d}` },
    );
  }
  return cols;
}

const SHIFT_BASE_COLUMNS: ExportColumnDef[] = [
  { key: 'id', label: 'ID' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'vk_id', label: 'VK ID' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'registered_at', label: 'Регистрация' },
  { key: 'start_role', label: 'Роль на входе' },
  { key: 'strong_role', label: 'Сильная роль' },
  { key: 'path_points', label: 'Путь' },
  { key: 'experience_points', label: 'Опыт' },
  { key: 'bonus_points', label: 'Бонус' },
  { key: 'total_rating', label: 'Рейтинг всего' },
  { key: 'answers_total', label: 'Ответов всего' },
  { key: 'checkin_days', label: 'Дней с check-in' },
  { key: 'evening_days', label: 'Дней с итогами' },
  { key: 'tasks_submitted_total', label: 'Заданий подано' },
  { key: 'tasks_approved_total', label: 'Заданий одобрено' },
  { key: 'tasks_points_total', label: 'Баллы за задания' },
  { key: 'piggybank_entries_count', label: 'Копилка · записей' },
  { key: 'ideas_count', label: 'Идей' },
  ...shiftDayColumns(),
];

export const PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS = DAY_BASE_COLUMNS;
export const PARTICIPANT_ACTIVITY_WIDE_SHIFT_COLUMNS = SHIFT_BASE_COLUMNS;

export function getWideColumnsForParams(params: WideParams): ExportColumnDef[] {
  return params.day != null && params.day > 0 ? DAY_BASE_COLUMNS : SHIFT_BASE_COLUMNS;
}

function clipText(s: string, limit = TEXT_CELL_LIMIT): string {
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}…`;
}

function zoneLabelFromAnswer(answerData: unknown): string {
  const p = parseCheckinPayload(answerData);
  const raw = (p as { emotionZone?: string }).emotionZone;
  const zone = (raw as keyof typeof EMOTION_ZONE_LABELS | undefined)
    ?? emotionIdToZone(p.emotion);
  if (!zone) return '';
  return EMOTION_ZONE_LABELS[zone as keyof typeof EMOTION_ZONE_LABELS] ?? String(zone);
}

function cohortMatch(
  p: { direction?: string | null; groupName?: string | null; id: number },
  params: WideParams,
): boolean {
  if (params.direction && p.direction !== params.direction) return false;
  if (params.group && p.groupName !== params.group) return false;
  if (params.participantId && p.id !== params.participantId) return false;
  return true;
}

export type WideBuildResult = {
  mode: 'day' | 'shift';
  day: number | null;
  columns: ExportColumnDef[];
  rows: Record<string, unknown>[];
  longRows: (string | number)[][];
  readme: string[];
};

export async function buildParticipantActivityWide(params: WideParams = {}): Promise<WideBuildResult> {
  const day = params.day != null && params.day > 0 ? params.day : null;
  const mode: 'day' | 'shift' = day != null ? 'day' : 'shift';
  const columns = getWideColumnsForParams(params);

  const listQuery: ParticipantListQuery = {
    page: 1,
    shiftId: params.shiftId ?? undefined,
  };
  const enriched = await loadEnrichedParticipants(listQuery);
  const people = enriched.filter(p => cohortMatch(p, params))
    .filter(p => (p.direction || '').toLowerCase() !== 'организатор форума');
  const ids = people.map(p => p.id);
  const idSet = new Set(ids);

  const [allQuestions, allAnswers, allSubs, allDayStates, allPiggy] = await Promise.all([
    db.select().from(questions),
    ids.length
      ? db.select().from(answers).where(inArray(answers.participantId, ids))
      : Promise.resolve([] as (typeof answers.$inferSelect)[]),
    ids.length
      ? db.select({ s: taskSubmissions, t: tasks })
        .from(taskSubmissions)
        .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
        .where(inArray(taskSubmissions.participantId, ids))
      : Promise.resolve([] as { s: typeof taskSubmissions.$inferSelect; t: typeof tasks.$inferSelect | null }[]),
    ids.length
      ? db.select().from(participantDayState).where(inArray(participantDayState.participantId, ids))
      : Promise.resolve([] as (typeof participantDayState.$inferSelect)[]),
    ids.length
      ? db.select({
        participantId: piggybank.participantId,
        id: piggybank.id,
      }).from(piggybank).where(inArray(piggybank.participantId, ids))
      : Promise.resolve([] as { participantId: number | null; id: number }[]),
  ]);

  const publishedQ = allQuestions.filter(q => isPublishedStatus(q.status));
  const qById = new Map(publishedQ.map(q => [q.id, q]));

  const answersByPid = new Map<number, typeof allAnswers>();
  for (const a of allAnswers) {
    if (!idSet.has(a.participantId)) continue;
    const q = a.questionId != null ? qById.get(a.questionId) : undefined;
    if (!q) continue;
    if (!answersByPid.has(a.participantId)) answersByPid.set(a.participantId, []);
    answersByPid.get(a.participantId)!.push(a);
  }

  const subsByPid = new Map<number, typeof allSubs>();
  for (const row of allSubs) {
    if (!idSet.has(row.s.participantId)) continue;
    if (!subsByPid.has(row.s.participantId)) subsByPid.set(row.s.participantId, []);
    subsByPid.get(row.s.participantId)!.push(row);
  }

  const dayStateByPid = new Map<number, (typeof participantDayState.$inferSelect)[]>();
  for (const s of allDayStates) {
    if (!idSet.has(s.participantId)) continue;
    if (!dayStateByPid.has(s.participantId)) dayStateByPid.set(s.participantId, []);
    dayStateByPid.get(s.participantId)!.push(s);
  }

  const piggyCount = new Map<number, number>();
  for (const r of allPiggy) {
    if (r.participantId == null) continue;
    piggyCount.set(r.participantId, (piggyCount.get(r.participantId) || 0) + 1);
  }

  let dayScores = new Map<number, number>();
  if (mode === 'day' && day != null && ids.length) {
    dayScores = await computeLeaderboardScores(ids, { scope: 'day', day, track: 'total' });
  }

  const longRows: (string | number)[][] = [];
  const rows: Record<string, unknown>[] = [];

  for (const p of people) {
    const pAnswers = answersByPid.get(p.id) || [];
    const pSubs = subsByPid.get(p.id) || [];
    const pStates = dayStateByPid.get(p.id) || [];
    const piggyEntries = piggyCount.get(p.id) || 0;

    if (mode === 'day' && day != null) {
      const dayAnswers = pAnswers.filter(a => {
        const q = a.questionId != null ? qById.get(a.questionId) : undefined;
        return q?.dayNumber === day;
      });
      const byTp: Record<string, typeof dayAnswers> = {};
      for (const a of dayAnswers) {
        const q = qById.get(a.questionId!)!;
        const tp = touchpointTypeForQuestion(q);
        if (!byTp[tp]) byTp[tp] = [];
        byTp[tp].push(a);
      }
      const checkins = byTp.checkin || [];
      const directionAns = byTp.direction || [];
      const lessonImp = byTp.lesson_important || [];
      const lessonOpen = byTp.lesson_open || [];

      const state = pStates.find(s => s.dayNumber === day);
      const ratings = (state?.eveningRatings ?? null) as Record<string, unknown> | null;
      const eveningFromAnswers = dayAnswers.some(a => {
        const q = a.questionId != null ? qById.get(a.questionId) : undefined;
        return q ? isEveningSummaryQuestion(q) : false;
      });
      const eveningDone = ratings || eveningFromAnswers ? 1 : 0;

      const daySubs = pSubs.filter(r => r.t?.dayNumber === day);
      const approved = daySubs.filter(r => r.s.status === 'approved');
      const tasksPoints = daySubs.reduce((s, r) => s + (r.s.pointsAwarded ?? 0), 0);

      const checkinZone = checkins.length
        ? zoneLabelFromAnswer(checkins[checkins.length - 1]!.answerData)
        : '';

      const row: Record<string, unknown> = {
        id: p.id,
        full_name: p.fullName,
        vk_id: p.vkId,
        direction: p.direction ?? '',
        group_name: p.groupName ?? '',
        registered_at: p.registeredAt,
        start_role: p.startRole ?? '',
        strong_role: p.strongRole ?? '',
        path_points: p.pathPoints,
        experience_points: p.experiencePoints,
        bonus_points: p.bonusPoints,
        total_rating: p.totalRating,
        forum_day: day,
        checkin_done: checkins.length > 0 ? 1 : 0,
        checkin_zone: checkinZone,
        checkin_count: checkins.length,
        direction_done: directionAns.length > 0 ? 1 : 0,
        direction_answers_count: directionAns.length,
        lesson_important_done: lessonImp.length > 0 ? 1 : 0,
        lesson_important_count: lessonImp.length,
        lesson_open_done: lessonOpen.length > 0 ? 1 : 0,
        lesson_open_count: lessonOpen.length,
        evening_done: eveningDone,
        evening_direction: ratings?.direction ?? '',
        evening_lessonsImportant: ratings?.lessonsImportant ?? '',
        evening_openLessons: ratings?.openLessons ?? '',
        evening_curator: ratings?.curator ?? '',
        tasks_submitted_count: daySubs.length,
        tasks_approved_count: approved.length,
        tasks_points: tasksPoints,
        active_role: roleLabel(state?.activeRoleKey),
        tomorrow_role: roleLabel(state?.tomorrowRoleKey),
        experiment_status: state?.experimentStatus ?? '',
        piggybank_entries_count: piggyEntries,
        ideas_count: p.ideasCount,
        day_points: dayScores.get(p.id) ?? 0,
      };
      rows.push(row);

      for (const a of dayAnswers) {
        const q = qById.get(a.questionId!);
        if (!q) continue;
        longRows.push([
          p.id,
          p.fullName,
          day,
          touchpointTypeForQuestion(q),
          q.text || q.title,
          clipText(answerText(a.answerData), 4000),
          formatTs(a.createdAt),
        ]);
      }
    } else {
      let answersTotal = 0;
      let checkinDays = 0;
      let eveningDays = 0;
      const perDay: Record<string, unknown> = {};
      for (const d of FORUM_DAYS) {
        const dayAnswers = pAnswers.filter(a => {
          const q = a.questionId != null ? qById.get(a.questionId) : undefined;
          return q?.dayNumber === d;
        });
        const hasCheckin = dayAnswers.some(a => {
          const q = qById.get(a.questionId!);
          return q && touchpointTypeForQuestion(q) === 'checkin';
        });
        const state = pStates.find(s => s.dayNumber === d);
        const eveningFromAnswers = dayAnswers.some(a => {
          const q = a.questionId != null ? qById.get(a.questionId) : undefined;
          return q ? isEveningSummaryQuestion(q) : false;
        });
        const evening = state?.eveningRatings || eveningFromAnswers ? 1 : 0;
        const daySubs = pSubs.filter(r => r.t?.dayNumber === d);
        answersTotal += dayAnswers.length;
        if (hasCheckin) checkinDays += 1;
        if (evening) eveningDays += 1;
        perDay[`checkin_d${d}`] = hasCheckin ? 1 : 0;
        perDay[`evening_d${d}`] = evening;
        perDay[`answers_d${d}`] = dayAnswers.length;
        perDay[`tasks_d${d}`] = daySubs.length;
        perDay[`role_d${d}`] = roleLabel(state?.activeRoleKey || state?.tomorrowRoleKey);

        for (const a of dayAnswers) {
          const q = qById.get(a.questionId!);
          if (!q) continue;
          longRows.push([
            p.id,
            p.fullName,
            d,
            touchpointTypeForQuestion(q),
            q.text || q.title,
            clipText(answerText(a.answerData), 4000),
            formatTs(a.createdAt),
          ]);
        }
      }
      const approved = pSubs.filter(r => r.s.status === 'approved');
      const tasksPoints = pSubs.reduce((s, r) => s + (r.s.pointsAwarded ?? 0), 0);
      rows.push({
        id: p.id,
        full_name: p.fullName,
        vk_id: p.vkId,
        direction: p.direction ?? '',
        group_name: p.groupName ?? '',
        registered_at: p.registeredAt,
        start_role: p.startRole ?? '',
        strong_role: p.strongRole ?? '',
        path_points: p.pathPoints,
        experience_points: p.experiencePoints,
        bonus_points: p.bonusPoints,
        total_rating: p.totalRating,
        answers_total: answersTotal,
        checkin_days: checkinDays,
        evening_days: eveningDays,
        tasks_submitted_total: pSubs.length,
        tasks_approved_total: approved.length,
        tasks_points_total: tasksPoints,
        piggybank_entries_count: piggyEntries,
        ideas_count: p.ideasCount,
        ...perDay,
      });
    }
  }

  const readme = [
    mode === 'day'
      ? `Полная выгрузка участников × активности за день форума D${day}.`
      : 'Полная выгрузка участников × активности за всю смену (агрегаты + флаги по дням D1–D8).',
    'Зернистость: одна строка = один участник.',
    'Пустая ячейка = нет данных; 0 = явно ноль (не сдал / нет баллов).',
    'checkin_done / evening_done / *_done: 1 = есть активность, 0 = нет.',
    'Длинные тексты ответов — на листе «Ответы long» (обрезка 4000 символов).',
    `Черновики вопросов не включены. Шкалы итогов дня: ${EVENING_SCALE_KEYS.join(', ')}.`,
    params.direction ? `Фильтр направления: ${params.direction}` : 'Фильтр направления: все',
    params.group ? `Фильтр группы: ${params.group}` : 'Фильтр группы: все',
    `Участников в файле: ${people.length}.`,
  ];

  return { mode, day, columns, rows, longRows, readme };
}

export async function writeParticipantActivityWideWorkbook(
  res: Response,
  params: WideParams = {},
): Promise<void> {
  const data = await buildParticipantActivityWide(params);
  const wb = await createWorkbook();
  addReadmeSheet(wb, data.readme);

  const ws = wb.addWorksheet('Участники×активности');
  ws.addRow(data.columns.map(c => c.label));
  for (const row of data.rows) {
    ws.addRow(data.columns.map(c => row[c.key] ?? ''));
  }

  const long = wb.addWorksheet('Ответы long');
  long.addRow(['participant_id', 'full_name', 'day', 'touchpoint', 'question', 'answer', 'answered_at']);
  for (const r of data.longRows) long.addRow(r);

  const name = data.mode === 'day'
    ? `participant_activity_d${data.day}.xlsx`
    : 'participant_activity_shift.xlsx';
  await sendWorkbook(res, wb, name);
}

export async function writeParticipantActivityWideToFile(
  filePath: string,
  params: WideParams,
  columnKeys?: string[],
): Promise<{ byteSize: number; fileNameHint: string }> {
  const data = await buildParticipantActivityWide(params);
  const cols = columnKeys?.length
    ? data.columns.filter(c => columnKeys.includes(c.key))
    : data.columns;
  const effectiveCols = cols.length ? cols : data.columns;

  const wb = await createWorkbook();
  addReadmeSheet(wb, data.readme);
  const ws = wb.addWorksheet('Участники×активности');
  ws.addRow(effectiveCols.map(c => c.label));
  for (const row of data.rows) {
    ws.addRow(effectiveCols.map(c => row[c.key] ?? ''));
  }
  const long = wb.addWorksheet('Ответы long');
  long.addRow(['participant_id', 'full_name', 'day', 'touchpoint', 'question', 'answer', 'answered_at']);
  for (const r of data.longRows) long.addRow(r);

  await wb.xlsx.writeFile(filePath);
  const fs = await import('fs/promises');
  const stat = await fs.stat(filePath);
  return {
    byteSize: stat.size,
    fileNameHint: data.mode === 'day'
      ? `participant_activity_d${data.day}.xlsx`
      : 'participant_activity_shift.xlsx',
  };
}

/** Pure helper for unit tests: pick day-mode flags from answer touchpoint counts. */
export function deriveDayActivityFlags(counts: {
  checkin: number;
  direction: number;
  lesson_important: number;
  lesson_open: number;
  hasEvening: boolean;
}): Record<string, number> {
  return {
    checkin_done: counts.checkin > 0 ? 1 : 0,
    checkin_count: counts.checkin,
    direction_done: counts.direction > 0 ? 1 : 0,
    direction_answers_count: counts.direction,
    lesson_important_done: counts.lesson_important > 0 ? 1 : 0,
    lesson_important_count: counts.lesson_important,
    lesson_open_done: counts.lesson_open > 0 ? 1 : 0,
    lesson_open_count: counts.lesson_open,
    evening_done: counts.hasEvening ? 1 : 0,
  };
}
