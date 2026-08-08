import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import {
  events, materials, participantDayState, participants, questions, tasks, taskSubmissions,
} from '../../db/schema.js';
import { inferReflectionDepth } from '../reflectionDepth.js';
import { isPublishedStatus } from '../publishStatus.js';
import { EVENING_SCALE_KEYS } from '../touchpointTemplates.js';
import {
  ANSWER_ROW_HEADERS_RU, addReadmeSheet, answerText, buildAnswerRow, filterAnswersByTouchpoint, fullName,
} from './exportCommon.js';
import { queryAnswerJoinRows } from './answerJoinQuery.js';
import { experimentStatusLabel, roleLabel, submissionStatusLabel } from './exportLabels.js';
import { normalizeExportTouchpointFilter } from './touchpointFilter.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export async function loadDayAnswerRows(day: number) {
  const dayQuestions = await db.select().from(questions)
    .where(eq(questions.dayNumber, day));
  const publishedQ = dayQuestions.filter(q => isPublishedStatus(q.status));
  const qIds = publishedQ.map(q => q.id);
  return queryAnswerJoinRows({
    day,
    questionIds: qIds,
    publishedOnly: false, // already filtered to published ids
  });
}

export async function writeDayWorkbook(res: Response, day: number, typeRaw: string | undefined): Promise<void> {
  const type = normalizeExportTouchpointFilter(typeRaw);
  let dayAns = await loadDayAnswerRows(day);
  dayAns = filterAnswersByTouchpoint(dayAns, type);

  const dayEvents = await db.select().from(events).where(eq(events.dayNumber, day));
  const dayTasks = await db.select().from(tasks).where(eq(tasks.dayNumber, day))
    .then(rows => rows.filter(t => isPublishedStatus(t.status)));
  const dayMats = (await db.select().from(materials).where(eq(materials.dayNumber, day)))
    .filter(m => isPublishedStatus(m.status));
  const subs = await db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  const daySubs = subs.filter(r => r.t && (r.t.dayNumber === day || dayTasks.some(t => t.id === r.t!.id)));

  const roleRows = await db.select({ s: participantDayState, p: participants })
    .from(participantDayState)
    .leftJoin(participants, eq(participantDayState.participantId, participants.id));
  const dayRoles = roleRows.filter(r => r.s.dayNumber === day);
  const allParticipants = await db.select().from(participants);

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    `Выгрузка по дню ${day}, фильтр типа точки: ${type}.`,
    'Лист «Ответы дня» — сквозные поля ТЗ (11 колонок + depth).',
    'Черновики вопросов не включены.',
  ]);

  const sheetAns = wb.addWorksheet('Ответы дня');
  sheetAns.addRow([...ANSWER_ROW_HEADERS_RU, 'Глубина', 'ID вопроса', 'Блок']);
  for (const r of dayAns) {
    const text = answerText(r.a.answerData);
    const row = buildAnswerRow(r, { source: 'question' });
    sheetAns.addRow([...row, inferReflectionDepth(text) || '', r.q?.id ?? '', r.q?.block ?? '']);
  }

  const sheetEv = wb.addWorksheet('События');
  sheetEv.addRow(['id', 'title', 'place', 'start', 'end']);
  for (const e of dayEvents) sheetEv.addRow([e.id, e.title, e.place, e.startTime?.toISOString(), e.endTime?.toISOString()]);

  const sheetTasks = wb.addWorksheet('Задания');
  sheetTasks.addRow(['ID', 'Название', 'Баллы', 'Тип подтверждения']);
  for (const t of dayTasks) sheetTasks.addRow([t.id, t.title, t.points, t.confirmationType]);

  const sheetSubs = wb.addWorksheet('Сдачи');
  sheetSubs.addRow(['ID', 'Участник', 'Задание', 'Статус', 'Баллы']);
  for (const r of daySubs) {
    sheetSubs.addRow([r.s.id, fullName(r.p), r.t?.title, submissionStatusLabel(r.s.status), r.s.pointsAwarded]);
  }

  const sheetMat = wb.addWorksheet('Материалы');
  sheetMat.addRow(['ID', 'Название', 'Тип', 'Направление', 'URL']);
  for (const m of dayMats) sheetMat.addRow([m.id, m.title, m.type, m.direction, m.url]);

  const sheetRoles = wb.addWorksheet('Роли по дням');
  sheetRoles.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День',
    'Роль на входе', 'Активная роль', 'Роль на завтра', 'Статус эксперимента',
  ]);
  for (const r of dayRoles) {
    sheetRoles.addRow([
      r.p?.id, fullName(r.p), r.p?.direction, r.p?.groupName, r.s.dayNumber,
      roleLabel(r.p?.pedagogicalRole), roleLabel(r.s.activeRoleKey),
      roleLabel(r.s.tomorrowRoleKey), experimentStatusLabel(r.s.experimentStatus),
    ]);
  }

  const sheetEvening = wb.addWorksheet('Итоговая анкета');
  sheetEvening.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Отправлено', 'Роль на завтра',
    ...EVENING_SCALE_KEYS,
    'Поездка да/нет', 'Оценка поездки', 'Практика да/нет', 'Название практики', 'Рекомендация да/нет', 'Оценка рекомендации',
    'Главный тезис', 'Изменение понимания', 'Больше всего понравилось', 'Улучшить завтра', 'Свободная заметка', 'Результат эксперимента',
  ]);
  for (const r of dayRoles) {
    const ratings = r.s.eveningRatings as Record<string, unknown> | null;
    if (!ratings) continue;
    sheetEvening.addRow([
      r.p?.id, fullName(r.p), r.p?.direction, r.p?.groupName, r.s.dayNumber,
      r.s.updatedAt?.toISOString?.() ?? '', roleLabel(r.s.tomorrowRoleKey),
      ...EVENING_SCALE_KEYS.map(k => ratings[k] ?? ''),
      ratings.tripYes, ratings.tripScore, ratings.practiceYes, ratings.practiceName,
      ratings.recommendYes, ratings.recommendScore,
      ratings.mainThesis, ratings.understandingChange, ratings.likedMost,
      ratings.improveTomorrow, ratings.freeNote, ratings.experimentResult,
    ]);
  }

  const byParticipant = new Map<number, typeof roleRows>();
  for (const r of roleRows) {
    const id = r.p?.id;
    if (!id) continue;
    if (!byParticipant.has(id)) byParticipant.set(id, []);
    byParticipant.get(id)!.push(r);
  }
  const sheetTraj = wb.addWorksheet('Путь ролей');
  sheetTraj.addRow([
    'ID участника', 'ФИО', 'Роль на входе',
    'День 1', 'День 2', 'День 3', 'День 4', 'День 5', 'День 6', 'День 7',
    'Сильная роль', 'Роль роста',
  ]);
  for (const p of allParticipants) {
    const states = byParticipant.get(p.id) || [];
    const byDay: Record<number, string> = {};
    for (const s of states) {
      byDay[s.s.dayNumber] = roleLabel(s.s.activeRoleKey || s.s.tomorrowRoleKey);
    }
    sheetTraj.addRow([
      p.id, fullName(p), roleLabel(p.pedagogicalRole),
      byDay[1] || '', byDay[2] || '', byDay[3] || '', byDay[4] || '',
      byDay[5] || '', byDay[6] || '', byDay[7] || '',
      roleLabel(p.strongRole), roleLabel(p.growthRole),
    ]);
  }

  await sendWorkbook(res, wb, `day_${day}_${type}.xlsx`);
}
