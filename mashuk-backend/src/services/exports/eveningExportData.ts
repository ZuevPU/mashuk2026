import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
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
import { roleLabel } from './exportLabels.js';

export type EveningExportFilters = {
  day?: number | null;
  direction?: string;
  group?: string;
  ageCategory?: string;
  activityQ?: string;
  shiftId?: number | null;
  participantId?: number | null;
  /** Include participants with null shift_id (legacy). Default true. */
  includeNullShift?: boolean;
};

export type EveningExportRow = {
  participantId: number;
  dayNumber: number;
  ratings: Record<string, unknown>;
  tomorrowRoleKey: string | null;
  filledAt: Date | null;
  p: typeof participants.$inferSelect;
  directionName: string | null;
};

export async function loadSettingsForEveningExport(shiftId?: number | null) {
  if (shiftId != null && !Number.isNaN(shiftId)) {
    const shift = await getShiftById(shiftId);
    if (shift) return shiftOpsToForumShape(shift);
  }
  return getForumSettings();
}

export function asEveningRatings(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return Object.keys(obj).length ? obj : null;
}

export function isEveningSummaryQuestion(q: {
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

/** Поля анкеты из конфига админки + шкалы + ключи из реальных ответов. */
export function resolveEveningQuestionFields(
  settings: Awaited<ReturnType<typeof loadSettingsForEveningExport>>,
  days: number[],
  ratingKeys: string[] = [],
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
  for (const key of ratingKeys) {
    if (!key || map.has(key) || key === 'tomorrowRoleKey') continue;
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

export function formatEveningFieldValue(
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

/**
 * Собирает сданные итоговые анкеты: evening_ratings + fallback answers «Итоги дня».
 */
export async function collectEveningExportRows(
  filters: EveningExportFilters = {},
): Promise<{
  rows: EveningExportRow[];
  fields: EveningField[];
  settings: Awaited<ReturnType<typeof loadSettingsForEveningExport>>;
  emptyReason: string | null;
}> {
  const settings = await loadSettingsForEveningExport(filters.shiftId);
  const shiftId = filters.shiftId != null && !Number.isNaN(filters.shiftId)
    ? filters.shiftId
    : null;
  const includeNullShift = filters.includeNullShift !== false;

  const participantConds = [
    isNull(participants.selfDeletedAt),
    ne(sql`LOWER(COALESCE(${participants.direction}, ''))`, 'организатор форума'),
  ];
  if (shiftId != null) {
    participantConds.push(
      includeNullShift
        ? or(eq(participants.shiftId, shiftId), isNull(participants.shiftId))!
        : eq(participants.shiftId, shiftId),
    );
  }
  if (filters.participantId != null && !Number.isNaN(filters.participantId)) {
    participantConds.push(eq(participants.id, filters.participantId));
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

  const byKey = new Map<string, EveningExportRow>();

  for (const r of stateRows) {
    const ratings = asEveningRatings(r.s.eveningRatings);
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

  const questionConds = [
    or(
      eq(questions.questionKind, 'day_summary'),
      sql`LOWER(COALESCE(${questions.block}, '')) LIKE '%итог%'`,
      sql`LOWER(COALESCE(${questions.title}, '')) LIKE '%итоговая анкета%'`,
    )!,
  ];
  if (shiftId != null) {
    questionConds.push(
      includeNullShift
        ? or(eq(questions.shiftId, shiftId), isNull(questions.shiftId))!
        : eq(questions.shiftId, shiftId),
    );
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
    .where(and(...participantConds, ...questionConds));

  for (const r of answerRows) {
    if (!isEveningSummaryQuestion(r.q)) continue;
    const ratings = asEveningRatings(r.a.answerData);
    if (!ratings) continue;
    const dayNumber = r.q.dayNumber ?? 0;
    if (!dayNumber || dayNumber < 1) continue;
    if (filters.day != null && filters.day > 0 && dayNumber !== filters.day) continue;
    const key = `${r.p.id}:${dayNumber}`;
    if (byKey.has(key)) continue;
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
    const an = [a.p.lastName, a.p.firstName].filter(Boolean).join(' ');
    const bn = [b.p.lastName, b.p.firstName].filter(Boolean).join(' ');
    return an.localeCompare(bn, 'ru');
  });

  const daysInData = [...new Set(filtered.map(r => r.dayNumber))].sort((a, b) => a - b);
  const daysForFields = filters.day != null && filters.day > 0
    ? [filters.day]
    : (daysInData.length ? daysInData : [1, 2, 3, 4, 5, 6, 7]);
  const ratingKeys = [...new Set(filtered.flatMap(r => Object.keys(r.ratings)))];
  const fields = resolveEveningQuestionFields(settings, daysForFields, ratingKeys);

  let emptyReason: string | null = null;
  if (filtered.length === 0) {
    const parts = [
      'Нет сданных итоговых анкет по текущим фильтрам.',
      shiftId != null ? `Смена #${shiftId}.` : '',
      filters.day != null && filters.day > 0 ? `День ${filters.day}.` : 'Все дни.',
      filters.direction ? `Направление: ${filters.direction}.` : '',
      filters.group ? `Группа: ${filters.group}.` : '',
      filters.ageCategory ? `Возраст: ${filters.ageCategory}.` : '',
      filters.activityQ ? `Деятельность: ${filters.activityQ}.` : '',
      'Снимите фильтры Insights или выберите «Вся смена»; данные берутся из evening_ratings и вопросов «Итоги дня».',
    ];
    emptyReason = parts.filter(Boolean).join(' ');
  }

  return { rows: filtered, fields, settings, emptyReason };
}
