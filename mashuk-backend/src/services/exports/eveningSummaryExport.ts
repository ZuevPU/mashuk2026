import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import {
  answers, directions, participantDayState, participants, questions,
} from '../../db/schema.js';
import { matchesAgeCategory, matchesActivity } from '../analytics/cohortFilters.js';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  resolveEveningConfigForDay,
  type EveningField,
} from '../eveningQuestionnaireConfig.js';
import { getForumSettings } from '../helpers.js';
import { getShiftById, shiftOpsToForumShape } from '../shiftService.js';
import { EVENING_SCALE_KEYS, EVENING_SCALE_LABELS } from '../touchpointTemplates.js';
import { addReadmeSheet, formatTs, fullName } from './exportCommon.js';
import { roleLabel } from './exportLabels.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type EveningSummaryExportFilters = {
  day?: number | null;
  direction?: string;
  group?: string;
  ageCategory?: string;
  activityQ?: string;
  shiftId?: number;
};

type ExportRow = {
  participantId: number;
  dayNumber: number;
  ratings: Record<string, unknown>;
  tomorrowRoleKey: string | null;
  filledAt: Date | null;
  p: typeof participants.$inferSelect;
  directionName: string | null;
};

async function loadSettingsForExport(shiftId?: number) {
  if (shiftId != null && !Number.isNaN(shiftId)) {
    const shift = await getShiftById(shiftId);
    if (shift) return shiftOpsToForumShape(shift);
  }
  return getForumSettings();
}

/** Поля анкеты из конфига админки (Итоговая анкета вечера) + шкалы по умолчанию. */
function eveningQuestionFields(
  settings: Awaited<ReturnType<typeof loadSettingsForExport>>,
  days: number[],
  ratingKeys: string[],
): EveningField[] {
  const map = new Map<string, EveningField>();
  const dayList = days.length ? days : [1, 2, 3, 4, 5, 6, 7];
  for (const day of dayList) {
    const cfg = resolveEveningConfigForDay(settings as never, day);
    const steps = cfg.steps?.length
      ? cfg.steps
      : DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps;
    for (const field of steps.flatMap(s => s.fields)) {
      if (!map.has(field.key)) map.set(field.key, field);
    }
  }
  for (const key of EVENING_SCALE_KEYS) {
    if (map.has(key)) continue;
    map.set(key, {
      key,
      type: 'scale_1_5',
      label: EVENING_SCALE_LABELS[key] || key,
    });
  }
  // Ключи из реальных ответов, которых нет в конфиге (кастомные поля)
  for (const key of ratingKeys) {
    if (!key || map.has(key)) continue;
    if (key === 'tomorrowRoleKey') continue;
    map.set(key, { key, type: 'text', label: key });
  }
  return [...map.values()];
}

function formatYesNo(value: unknown): string {
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') return 'Да';
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') return 'Нет';
  if (value == null || value === '') return '';
  return String(value);
}

function formatFieldValue(
  field: EveningField,
  ratings: Record<string, unknown>,
  tomorrowRoleKey: string | null,
): string | number {
  if (field.key === 'tomorrowRoleKey' || field.type === 'role_select') {
    const fromRatings = ratings[field.key];
    const key = tomorrowRoleKey
      ?? (typeof fromRatings === 'string' ? fromRatings : null);
    return roleLabel(key);
  }
  const raw = ratings[field.key];
  if (raw == null || raw === '') return '';
  if (field.type === 'yes_no') return formatYesNo(raw);
  if (typeof raw === 'boolean') return formatYesNo(raw);
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

function isEveningSummaryQuestion(q: {
  block?: string | null;
  questionKind?: string | null;
  reflectionKind?: string | null;
  title?: string | null;
}): boolean {
  const block = (q.block || '').toLowerCase();
  const kind = String(q.questionKind || q.reflectionKind || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  return kind === 'day_summary'
    || kind === 'evening_summary'
    || block.includes('итог')
    || block.includes('вечер')
    || title.includes('итоговая анкета');
}

function asRatings(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return Object.keys(obj).length ? obj : null;
}

/**
 * Аналитическая выгрузка «Итоги дня»: 1 строка = участник × день.
 * Источники: participant_day_state.evening_ratings и answers по вопросам «Итоги дня».
 */
export async function writeEveningSummaryExport(
  res: Response,
  filters: EveningSummaryExportFilters = {},
): Promise<void> {
  const settings = await loadSettingsForExport(filters.shiftId);
  const shiftId = filters.shiftId != null && !Number.isNaN(filters.shiftId)
    ? filters.shiftId
    : null;

  const participantConds = [
    isNull(participants.selfDeletedAt),
    ne(sql`LOWER(COALESCE(${participants.direction}, ''))`, 'организатор форума'),
  ];
  // Участники выбранной смены + legacy без shift_id (иначе выгрузка пустая)
  if (shiftId != null) {
    participantConds.push(
      or(eq(participants.shiftId, shiftId), isNull(participants.shiftId))!,
    );
  }

  const stateRows = await db.select({
    s: participantDayState,
    p: participants,
    dirName: directions.name,
  })
    .from(participantDayState)
    .innerJoin(participants, eq(participantDayState.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...participantConds));

  const byKey = new Map<string, ExportRow>();

  for (const r of stateRows) {
    const ratings = asRatings(r.s.eveningRatings);
    if (!ratings) continue;
    if (filters.day != null && filters.day > 0 && r.s.dayNumber !== filters.day) continue;
    const key = `${r.p.id}:${r.s.dayNumber}`;
    byKey.set(key, {
      participantId: r.p.id,
      dayNumber: r.s.dayNumber,
      ratings,
      tomorrowRoleKey: r.s.tomorrowRoleKey ?? (
        typeof ratings.tomorrowRoleKey === 'string' ? ratings.tomorrowRoleKey : null
      ),
      filledAt: r.s.updatedAt ?? null,
      p: r.p,
      directionName: r.dirName ?? r.p.direction ?? null,
    });
  }

  // Fallback / дополнение: ответы на вопросы «Итоги дня» / day_summary
  const questionConds = [
    or(
      eq(questions.questionKind, 'day_summary'),
      sql`LOWER(COALESCE(${questions.block}, '')) LIKE '%итог%'`,
      sql`LOWER(COALESCE(${questions.title}, '')) LIKE '%итоговая анкета%'`,
    )!,
  ];
  if (shiftId != null) {
    questionConds.push(or(eq(questions.shiftId, shiftId), isNull(questions.shiftId))!);
  }
  if (filters.day != null && filters.day > 0) {
    questionConds.push(eq(questions.dayNumber, filters.day));
  }

  const answerRows = await db.select({
    a: answers,
    q: questions,
    p: participants,
    dirName: directions.name,
  })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(
      ...participantConds,
      ...questionConds,
    ));

  for (const r of answerRows) {
    if (!isEveningSummaryQuestion(r.q)) continue;
    const ratings = asRatings(r.a.answerData);
    if (!ratings) continue;
    const dayNumber = r.q.dayNumber ?? 0;
    if (!dayNumber || dayNumber < 1) continue;
    if (filters.day != null && filters.day > 0 && dayNumber !== filters.day) continue;
    const key = `${r.p.id}:${dayNumber}`;
    if (byKey.has(key)) continue; // evening_ratings приоритетнее
    byKey.set(key, {
      participantId: r.p.id,
      dayNumber,
      ratings,
      tomorrowRoleKey: typeof ratings.tomorrowRoleKey === 'string'
        ? ratings.tomorrowRoleKey
        : null,
      filledAt: r.a.createdAt ?? null,
      p: r.p,
      directionName: r.dirName ?? r.p.direction ?? null,
    });
  }

  let filtered = [...byKey.values()];

  if (filters.direction?.trim()) {
    const d = filters.direction.trim().toLowerCase();
    filtered = filtered.filter(r =>
      (r.directionName || '').toLowerCase() === d
      || (r.p.direction || '').toLowerCase() === d,
    );
  }
  if (filters.group?.trim()) {
    const g = filters.group.trim().toLowerCase();
    filtered = filtered.filter(r => (r.p.groupName || '').toLowerCase() === g);
  }
  if (filters.ageCategory) {
    filtered = filtered.filter(r => matchesAgeCategory(r.p.age, filters.ageCategory!));
  }
  if (filters.activityQ) {
    filtered = filtered.filter(r => matchesActivity(r.p.position, filters.activityQ!));
  }

  filtered.sort((a, b) => {
    const dayCmp = a.dayNumber - b.dayNumber;
    if (dayCmp !== 0) return dayCmp;
    return fullName(a.p).localeCompare(fullName(b.p), 'ru');
  });

  const daysInData = [...new Set(filtered.map(r => r.dayNumber))].sort((a, b) => a - b);
  const daysForFields = filters.day != null && filters.day > 0
    ? [filters.day]
    : (daysInData.length ? daysInData : [1, 2, 3, 4, 5, 6, 7]);
  const ratingKeys = [...new Set(filtered.flatMap(r => Object.keys(r.ratings)))];
  const questionFields = eveningQuestionFields(settings, daysForFields, ratingKeys);
  const questionHeaders = questionFields.map(f => f.label || f.key);

  const metaHeaders = [
    'ID участника',
    'ФИО',
    'VK ID',
    'Дата создания',
    'Дата регистрации',
    'Направление',
    'Группа',
    'Роль на входе',
    'День',
    'Время заполнения',
  ];

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка «Итоги дня» (вечерняя итоговая анкета из раздела Форум).',
    'Одна строка = один участник × один день форума (сданные анкеты).',
    'Данные: evening_ratings участника и ответы на вопросы «Итоги дня».',
    `Строк с ответами: ${filtered.length}.`,
    filters.day ? `Фильтр: день ${filters.day}.` : 'Фильтр: все дни смены.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
  ].filter(Boolean));

  const ws = wb.addWorksheet('Итоги дня');
  ws.addRow([...metaHeaders, ...questionHeaders]);

  for (const r of filtered) {
    const registeredAt = r.p.onboardingCompletedAt ?? r.p.createdAt;
    ws.addRow([
      r.p.id,
      fullName(r.p),
      r.p.vkId ?? '',
      formatTs(r.p.createdAt),
      formatTs(registeredAt),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      roleLabel(r.p.pedagogicalRole),
      r.dayNumber,
      formatTs(r.filledAt),
      ...questionFields.map(f => formatFieldValue(f, r.ratings, r.tomorrowRoleKey)),
    ]);
  }

  const long = wb.addWorksheet('Вопросы (длинный)');
  long.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Время заполнения',
    'Ключ вопроса', 'Вопрос', 'Ответ',
  ]);
  for (const r of filtered) {
    for (const field of questionFields) {
      const answer = formatFieldValue(field, r.ratings, r.tomorrowRoleKey);
      if (answer === '' || answer == null) continue;
      long.addRow([
        r.p.id,
        fullName(r.p),
        r.directionName ?? r.p.direction ?? '',
        r.p.groupName ?? '',
        r.dayNumber,
        formatTs(r.filledAt),
        field.key,
        field.label || field.key,
        answer,
      ]);
    }
  }

  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';
  await sendWorkbook(res, wb, `evening_summary_${dayPart}.xlsx`);
}
