import { and, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import {
  answers,
  exchangeAnswers,
  exchangeCategories,
  exchangeQuestions,
  participants,
  participantDayState,
  questions,
} from '../../db/schema.js';
import { queryPiggybankForExport } from '../../controllers/adminPiggybankController.js';
import { resolveAnalyticsFilters, type AnalyticsFilters } from '../analytics/analyticsQuery.js';
import { collectKindAnswerRows } from '../analytics/questionKindDashboard.js';
import { loadCohortParticipants } from '../analytics/cohort.js';
import {
  emotionIdToLabel,
  emotionIdToZone,
  emotionZoneToLabel,
} from '../emotionZones.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';
import { resolveAdminShiftId } from '../shiftService.js';
import { computeDayExportStats } from './dayStats.js';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  programEventAvgScore,
  programEventPickCount,
} from './eveningExportData.js';
import { addReadmeSheet, formatTs, fullName } from './exportCommon.js';
import { parseProgramEventPicks } from './nestedPickParse.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

type Workbook = Awaited<ReturnType<typeof createWorkbook>>;

function shiftFilters(base: AnalyticsFilters): AnalyticsFilters {
  return {
    ...base,
    mode: 'shift',
    day: null,
    compareDays: [],
  };
}

async function addKindSheet(
  wb: Workbook,
  sheetName: string,
  mode: 'after_blocks' | 'state_check',
  filters: AnalyticsFilters,
  req: AdminRequest,
): Promise<number> {
  const { rows: rawRows } = await collectKindAnswerRows(mode, filters);
  const cohort = await loadCohortParticipants(filters, req);
  const cohortIds = new Set(cohort.map(p => p.id));
  const rows = rawRows.filter(r => cohortIds.has(r.participantId));
  const ws = wb.addWorksheet(sheetName.slice(0, 31));

  if (mode === 'after_blocks') {
    ws.addRow([
      'ID ответа', 'ID участника', 'ФИО', 'Направление', 'Группа', 'День',
      'ID вопроса', 'Вопрос', 'ID события', 'Событие программы',
      'ID подтемы', 'Подтема', 'Путь', 'Ответ', 'Время',
    ]);
    for (const r of rows) {
      const parent = (r.parentEventTitle || '').trim();
      const topic = (r.eventTitle || '').trim();
      const path = parent && topic && parent !== topic
        ? `${parent} → ${topic}`
        : (topic || parent);
      ws.addRow([
        r.answerId, r.participantId, r.name, r.direction, r.group, r.day,
        r.questionId, r.questionTitle,
        r.parentEventId ?? '',
        parent || (topic && !r.parentEventId ? topic : ''),
        r.eventId ?? '',
        parent && topic && parent !== topic ? topic : (parent ? '' : topic),
        path, r.answer, r.filledAt ?? '',
      ]);
    }
  } else {
    ws.addRow([
      'ID ответа', 'ID участника', 'ФИО', 'Направление', 'Группа', 'День',
      'ID вопроса', 'Вопрос', 'Фаза', 'Эмоция', 'Зона', 'Энергия', 'Причина', 'Время',
    ]);
    for (const r of rows) {
      ws.addRow([
        r.answerId, r.participantId, r.name, r.direction, r.group, r.day,
        r.questionId, r.questionTitle, r.timePoint ?? '',
        emotionIdToLabel(r.emotion) || r.emotion || '',
        emotionZoneToLabel(r.emotionZone)
          || emotionZoneToLabel(emotionIdToZone(r.emotion))
          || r.emotionZone
          || '',
        r.energy ?? '',
        r.answer,
        r.filledAt ?? '',
      ]);
    }
  }
  return rows.length;
}

async function addEveningSheets(
  wb: Workbook,
  filters: { shiftId: number | null },
): Promise<{ answers: number; picks: number }> {
  const { rows, fields } = await collectEveningExportRows({
    shiftId: filters.shiftId,
    day: null,
  });
  const programEventFields = fields.filter(f => f.type === 'program_event');

  const metaHeaders = [
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Время заполнения', 'Статус',
  ];
  const questionHeaders: string[] = [];
  for (const f of fields) {
    questionHeaders.push(f.label || f.key);
    if (f.type === 'program_event') {
      questionHeaders.push(`${f.label || f.key} · кол-во`);
      questionHeaders.push(`${f.label || f.key} · ср. оценка`);
    }
  }

  const wsAll = wb.addWorksheet('Итоги дня');
  wsAll.addRow([...metaHeaders, ...questionHeaders]);
  for (const r of rows) {
    const values: Array<string | number> = [
      r.p.id,
      fullName(r.p),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      r.dayNumber,
      formatTs(r.filledAt),
      r.status,
    ];
    for (const f of fields) {
      values.push(formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey));
      if (f.type === 'program_event') {
        const raw = r.ratings[f.key];
        values.push(programEventPickCount(raw) || '');
        values.push(programEventAvgScore(raw) ?? '');
      }
    }
    wsAll.addRow(values);
  }

  const wsPicks = wb.addWorksheet('Открытые уроки');
  wsPicks.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День',
    'Поле анкеты', 'Ключ поля', 'ID события', 'Тема / блок',
    'ID подтемы', 'Подтема', 'Путь', 'Оценка (1–10)', 'Время', 'Статус',
  ]);
  let pickRows = 0;
  for (const r of rows) {
    for (const field of programEventFields) {
      const picks = parseProgramEventPicks(r.ratings[field.key]);
      for (const pick of picks) {
        const parent = (pick.parentEventTitle || '').trim();
        const topic = (pick.eventTitle || '').trim();
        wsPicks.addRow([
          r.p.id,
          fullName(r.p),
          r.directionName ?? r.p.direction ?? '',
          r.p.groupName ?? '',
          r.dayNumber,
          field.label || field.key,
          field.key,
          pick.parentEventId ?? '',
          parent || (topic && !pick.parentEventId ? topic : ''),
          pick.eventId ?? '',
          parent && topic && parent !== topic ? topic : (parent ? '' : topic),
          parent && topic && parent !== topic ? `${parent} → ${topic}` : (topic || parent),
          pick.score ?? '',
          formatTs(r.filledAt),
          r.status,
        ]);
        pickRows += 1;
      }
    }
  }

  return { answers: rows.length, picks: pickRows };
}

async function addPiggybankSheet(wb: Workbook, req: AdminRequest): Promise<number> {
  const rows = await queryPiggybankForExport(req);
  const ws = wb.addWorksheet('Копилка');
  ws.addRow([
    'ID участника', 'Участник', 'Направление', 'Группа', 'День', 'Дата',
    'Текст', 'Теги', 'Источник', 'Скрыто', 'Нарушение',
  ]);
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
  return rows.length;
}

async function addActivitySheet(wb: Workbook, shiftId: number | null): Promise<number> {
  const pConds = [
    isNull(participants.selfDeletedAt),
    ne(sql`LOWER(${participants.direction})`, 'организатор форума'),
  ];
  if (shiftId != null) pConds.push(eq(participants.shiftId, shiftId));
  const allP = await db.select().from(participants).where(and(...pConds));
  const ids = allP.map(p => p.id);
  const now = new Date();
  const qConds = [
    eq(questions.status, 'published'),
    or(isNull(questions.publishTime), lte(questions.publishTime, now)),
  ];
  if (shiftId != null) qConds.unshift(eq(questions.shiftId, shiftId));
  const published = await db.select().from(questions).where(and(...qConds));

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

  const ws = wb.addWorksheet('Активность');
  ws.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'Последняя активность',
    'Баллы Путь', 'Баллы Опыт', 'Точки осмысления',
  ]);
  for (const p of allP) {
    const answeredIds = answersByPid.get(p.id) ?? new Set<number>();
    const eveningDays = eveningDoneByPid.get(p.id) ?? new Set<number>();
    let tp = 0;
    for (let d = 1; d <= 8; d++) {
      const dayQs = dayQsCache.get(d) ?? [];
      tp += touchpointCompletionRatio(dayQs, answeredIds, d, {
        eveningDone: eveningDays.has(d),
      }).completed;
    }
    ws.addRow([
      p.id,
      fullName(p),
      p.direction ?? '',
      p.groupName ?? '',
      p.lastActiveAt ? new Date(p.lastActiveAt).toISOString() : '',
      p.pathPoints ?? 0,
      p.experiencePoints ?? 0,
      tp,
    ]);
  }
  return allP.length;
}

async function addExchangeSheet(wb: Workbook, shiftId: number | null): Promise<number> {
  const qs = await db.select({ q: exchangeQuestions, p: participants, c: exchangeCategories })
    .from(exchangeQuestions)
    .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
    .leftJoin(exchangeCategories, eq(exchangeQuestions.categoryId, exchangeCategories.id));
  const ans = await db.select({ a: exchangeAnswers, p: participants, q: exchangeQuestions })
    .from(exchangeAnswers)
    .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
    .leftJoin(exchangeQuestions, eq(exchangeAnswers.questionId, exchangeQuestions.id));

  const filterShift = <T extends { p: { shiftId?: number | null } | null }>(rows: T[]) => (
    shiftId == null ? rows : rows.filter(r => r.p?.shiftId === shiftId)
  );
  const qRows = filterShift(qs);
  const aRows = filterShift(ans);

  const ws = wb.addWorksheet('Обмен опытом');
  ws.addRow([
    'Тип', 'ID', 'ID участника', 'ФИО', 'Направление', 'Категория',
    'Текст', 'Статус', 'Время',
  ]);
  for (const r of qRows) {
    ws.addRow([
      'вопрос', r.q.id, r.p?.id ?? '', fullName(r.p), r.p?.direction ?? '',
      r.c?.slug || '', r.q.text, r.q.moderationStatus,
      r.q.createdAt ? new Date(r.q.createdAt).toISOString() : '',
    ]);
  }
  for (const r of aRows) {
    ws.addRow([
      'ответ', r.a.id, r.p?.id ?? '', fullName(r.p), r.p?.direction ?? '',
      '', r.a.text, '',
      r.a.createdAt ? new Date(r.a.createdAt).toISOString() : '',
    ]);
  }
  return qRows.length + aRows.length;
}

async function addDayStatsSheet(wb: Workbook, days: number[]): Promise<void> {
  const ws = wb.addWorksheet('Статистика дней');
  ws.addRow([
    'День', 'Точек осмысления (слоты)', 'Опубликовано вопросов',
    'Строк ответов', 'Участников с ответами',
    'checkin Q', 'checkin A', 'direction Q', 'direction A',
    'evening Q', 'evening A', 'lesson_important Q', 'lesson_important A',
    'lesson_open Q', 'lesson_open A', 'Зоны эмоций (JSON)',
  ]);
  for (const day of days) {
    const s = await computeDayExportStats(day);
    const bt = s.byTouchpointType || {};
    ws.addRow([
      s.day,
      s.touchpointQuestions,
      s.publishedQuestions,
      s.answerRows,
      s.participantsWithAnswers,
      bt.checkin?.questions ?? 0,
      bt.checkin?.answers ?? 0,
      bt.direction?.questions ?? 0,
      bt.direction?.answers ?? 0,
      bt.evening?.questions ?? 0,
      bt.evening?.answers ?? 0,
      bt.lesson_important?.questions ?? 0,
      bt.lesson_important?.answers ?? 0,
      bt.lesson_open?.questions ?? 0,
      bt.lesson_open?.answers ?? 0,
      JSON.stringify(s.emotionZones || {}),
    ]);
  }
}

/**
 * Полный пакет Штаб · Форум: одна книга со всеми ключевыми срезами смены
 * (состояние, итоги дня, после блоков, копилка, активность, обмен, статистика дней).
 */
export async function writeForumPackExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = shiftFilters(await resolveAnalyticsFilters(req));
  const shiftId = filters.shiftId ?? await resolveAdminShiftId(req);
  filters.shiftId = shiftId;

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Полная выгрузка Штаб · Форум по всей смене (все дни).',
    `Смена админки: ${shiftId ?? '—'}.`,
    'Листы: Состояние · Итоги дня · Открытые уроки · После блоков · Копилка · Активность · Обмен опытом · Статистика дней.',
  ]);

  const stateN = await addKindSheet(wb, 'Состояние', 'state_check', filters, req);
  const evening = await addEveningSheets(wb, { shiftId });
  const afterN = await addKindSheet(wb, 'После блоков', 'after_blocks', filters, req);
  const pigN = await addPiggybankSheet(wb, req);
  const actN = await addActivitySheet(wb, shiftId);
  const exN = await addExchangeSheet(wb, shiftId);
  await addDayStatsSheet(wb, [1, 2, 3, 4, 5, 6, 7, 8]);

  const readme = wb.getWorksheet('Описание') || wb.worksheets[0];
  if (readme) {
    readme.addRow([`Состояние (строк): ${stateN}`]);
    readme.addRow([`Итоговые анкеты (участник×день): ${evening.answers}`]);
    readme.addRow([`Открытые уроки (выборы): ${evening.picks}`]);
    readme.addRow([`После блоков (строк): ${afterN}`]);
    readme.addRow([`Копилка: ${pigN}`]);
    readme.addRow([`Активность (участников): ${actN}`]);
    readme.addRow([`Обмен опытом (строк): ${exN}`]);
    readme.addRow(['Статистика дней: дни 1–8']);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  await sendWorkbook(res, wb, `forum_pack_shift_${stamp}.xlsx`);
}
