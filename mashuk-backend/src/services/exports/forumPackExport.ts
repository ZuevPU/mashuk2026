import { and, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import {
  answers,
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
import { collectExchangeExportRows } from './ancillaryExports.js';
import { computeDayExportStats } from './dayStats.js';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  programEventAvgScore,
  programEventPickCount,
} from './eveningExportData.js';
import { addReadmeSheet, formatTsMsk, fullName } from './exportCommon.js';
import { parseProgramEventPicks } from './nestedPickParse.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

type Workbook = Awaited<ReturnType<typeof createWorkbook>>;

function packFilters(base: AnalyticsFilters): AnalyticsFilters {
  // Respect client mode/day from Штаб (D3 · 10 авг.). Only expand to whole shift when asked.
  if (base.mode === 'shift' || base.day == null || base.day < 1) {
    return {
      ...base,
      mode: 'shift',
      day: null,
      compareDays: [],
    };
  }
  return {
    ...base,
    mode: 'day',
    day: base.day,
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
  filters: {
    shiftId: number | null;
    day?: number | null;
    direction?: string | null;
    group?: string | null;
  },
): Promise<{ answers: number; picks: number }> {
  const { rows, fields } = await collectEveningExportRows({
    shiftId: filters.shiftId,
    day: filters.day != null && filters.day > 0 ? filters.day : null,
    direction: filters.direction?.trim() || undefined,
    group: filters.group?.trim() || undefined,
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
      formatTsMsk(r.filledAt),
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
    'ID подтемы', 'Подтема', 'Путь', 'Оценка (1–10)', 'Время (МСК)', 'Статус',
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
          formatTsMsk(r.filledAt),
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
  const rows = await collectExchangeExportRows({ shiftId });
  const ws = wb.addWorksheet('Обмен опытом');
  ws.addRow([
    'Тип', 'ID', 'ID участника', 'ФИО', 'Направление', 'Категория',
    'Текст', 'Статус', 'Время',
  ]);
  for (const row of rows) ws.addRow(row);
  return rows.length;
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
 * Полный пакет Штаб · Форум.
 * По умолчанию (mode=day&day=N) — только выбранный день фильтра штаба.
 * mode=shift — вся смена.
 */
export async function writeForumPackExport(req: AdminRequest, res: Response): Promise<void> {
  const filters = packFilters(await resolveAnalyticsFilters(req));
  const shiftId = filters.shiftId ?? await resolveAdminShiftId(req);
  filters.shiftId = shiftId;
  const dayScoped = filters.mode === 'day' && filters.day != null && filters.day > 0;
  const day = dayScoped ? filters.day! : null;
  const statsDays = dayScoped ? [day!] : [1, 2, 3, 4, 5, 6, 7, 8];

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    dayScoped
      ? `Полная выгрузка Штаб · Форум за день форума D${day} (как в фильтре штаба).`
      : 'Полная выгрузка Штаб · Форум по всей смене (все дни).',
    `Смена админки: ${shiftId ?? '—'}.`,
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
    'Листы: Состояние · Итоги дня · Открытые уроки · После блоков · Копилка · Активность · Обмен опытом · Статистика дней.',
    'Активность и обмен опытом — справочно по смене (у них нет жёсткого дневного среза).',
  ].filter(Boolean));

  const notes: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      notes.push(`${label}: ошибка — ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const stateN = await safe('Состояние', () => addKindSheet(wb, 'Состояние', 'state_check', filters, req), 0);
  const evening = await safe(
    'Итоги дня',
    () => addEveningSheets(wb, {
      shiftId,
      day,
      direction: filters.direction,
      group: filters.group,
    }),
    { answers: 0, picks: 0 },
  );
  const afterN = await safe('После блоков', () => addKindSheet(wb, 'После блоков', 'after_blocks', filters, req), 0);
  const pigN = await safe('Копилка', () => addPiggybankSheet(wb, req), 0);
  const actN = await safe('Активность', () => addActivitySheet(wb, shiftId), 0);
  const exN = await safe('Обмен опытом', () => addExchangeSheet(wb, shiftId), 0);
  await safe('Статистика дней', async () => {
    await addDayStatsSheet(wb, statsDays);
    return 0;
  }, 0);

  const readme = wb.getWorksheet('Описание') || wb.worksheets[0];
  if (readme) {
    readme.addRow([`Срез: ${dayScoped ? `день форума D${day}` : 'вся смена'}`]);
    readme.addRow([`Состояние (строк): ${stateN}`]);
    readme.addRow([`Итоговые анкеты (участник×день): ${evening.answers}`]);
    readme.addRow([`Открытые уроки (выборы): ${evening.picks}`]);
    readme.addRow([`После блоков (строк): ${afterN}`]);
    readme.addRow([`Копилка: ${pigN}`]);
    readme.addRow([`Активность (участников): ${actN}`]);
    readme.addRow([`Обмен опытом (строк): ${exN}`]);
    readme.addRow([`Статистика дней: ${statsDays.join(', ')}`]);
    for (const n of notes) readme.addRow([n]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = dayScoped
    ? `forum_pack_d${day}_${stamp}.xlsx`
    : `forum_pack_shift_${stamp}.xlsx`;
  await sendWorkbook(res, wb, filename);
}
