import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  answers, directions, participantDayState, participants, questions,
} from '../../db/schema.js';
import { matchesAgeCategory, matchesActivity } from '../analytics/cohortFilters.js';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  isEveningOpenForConfig,
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
  /** Include unfinished drafts when no final submit. Default true. */
  includeDrafts?: boolean;
};

export type EveningExportRow = {
  participantId: number;
  dayNumber: number;
  ratings: Record<string, unknown>;
  tomorrowRoleKey: string | null;
  filledAt: Date | null;
  p: typeof participants.$inferSelect;
  directionName: string | null;
  source: 'evening_ratings' | 'answers' | 'draft';
  status: 'сдано' | 'черновик';
};

export type EveningExportDiagnostics = {
  totalDayStates: number;
  withRatings: number;
  withDraftOnly: number;
  answerRowsMatched: number;
  afterShiftFilter: number;
  afterDayFilter: number;
  afterCohortFilter: number;
  shiftId: number | null;
  day: number | null;
  shiftFilterRelaxed: boolean;
  eveningOpenNow: boolean | null;
  eveningForceUnpublished: boolean | null;
  notes: string[];
};

export async function loadSettingsForEveningExport(shiftId?: number | null) {
  if (shiftId != null && !Number.isNaN(shiftId)) {
    const shift = await getShiftById(shiftId);
    if (shift) return shiftOpsToForumShape(shift);
  }
  return getForumSettings();
}

export function asEveningRatings(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  // иногда payload обёрнут { ratings: {...} }
  if (obj.ratings && typeof obj.ratings === 'object' && !Array.isArray(obj.ratings)) {
    return asEveningRatings(obj.ratings);
  }
  // одиночный текстовый ответ вопроса «Итоги дня»
  if (typeof obj.text === 'string' && obj.text.trim() && Object.keys(obj).length <= 3) {
    return { freeNote: obj.text.trim(), mainThesis: obj.text.trim() };
  }
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
  if (field.type === 'program_event' && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { eventTitle?: string; parentEventTitle?: string; eventId?: number };
    const title = String(o.eventTitle || '').trim();
    const parent = String(o.parentEventTitle || '').trim();
    if (title && parent && parent !== title) return `${parent} → ${title}`;
    if (title) return title;
    if (o.eventId) return `#${o.eventId}`;
    return '';
  }
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

type RawCandidate = EveningExportRow & { shiftId: number | null };

/**
 * Собирает итоговые анкеты текущей смены: evening_ratings, answers «Итоги дня», черновики.
 * Организаторы тоже включаются. Чужие смены не подмешиваются.
 */
export async function collectEveningExportRows(
  filters: EveningExportFilters = {},
): Promise<{
  rows: EveningExportRow[];
  fields: EveningField[];
  settings: Awaited<ReturnType<typeof loadSettingsForEveningExport>>;
  emptyReason: string | null;
  diagnostics: EveningExportDiagnostics;
}> {
  const settings = await loadSettingsForEveningExport(filters.shiftId);
  const requestedShiftId = filters.shiftId != null && !Number.isNaN(filters.shiftId)
    ? filters.shiftId
    : null;
  const includeDrafts = filters.includeDrafts !== false;

  const dayForStatus = filters.day != null && filters.day > 0
    ? filters.day
    : (settings.currentDay ?? 1);
  const eveningCfg = resolveEveningConfigForDay(settings as never, dayForStatus);
  const eveningForceUnpublished = !!eveningCfg.forceUnpublished;
  const eveningOpenNow = isEveningOpenForConfig(eveningCfg);

  const notes: string[] = [];
  const diagnostics: EveningExportDiagnostics = {
    totalDayStates: 0,
    withRatings: 0,
    withDraftOnly: 0,
    answerRowsMatched: 0,
    afterShiftFilter: 0,
    afterDayFilter: 0,
    afterCohortFilter: 0,
    shiftId: requestedShiftId,
    day: filters.day ?? null,
    shiftFilterRelaxed: false,
    eveningOpenNow,
    eveningForceUnpublished,
    notes,
  };

  if (eveningForceUnpublished) {
    notes.push(
      `Итоговая анкета на день ${dayForStatus} снята с публикации (forceUnpublished) — участники не могут отправить новые ответы.`,
    );
  } else if (!eveningOpenNow) {
    notes.push(
      `Итоговая анкета на день ${dayForStatus} сейчас закрыта по расписанию (откроется с ${eveningCfg.opensAtMsk || '21:00'} МСК, либо опубликуйте вручную).`,
    );
  }

  const baseConds = [isNull(participants.selfDeletedAt)];
  if (filters.participantId != null && !Number.isNaN(filters.participantId)) {
    baseConds.push(eq(participants.id, filters.participantId));
  }
  // Жёсткий фильтр смены с самого начала — не тащим чужие тестовые анкеты
  if (requestedShiftId != null) {
    baseConds.push(eq(participants.shiftId, requestedShiftId));
  }

  const stateConds = [...baseConds];
  if (filters.day != null && filters.day > 0) {
    stateConds.push(eq(participantDayState.dayNumber, filters.day));
  }

  const stateRows = await db.select({
    s: participantDayState,
    p: participants,
    dirName: directions.name,
  })
    .from(participantDayState)
    .innerJoin(participants, eq(participantDayState.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .where(and(...stateConds));

  diagnostics.totalDayStates = stateRows.length;

  const byKey = new Map<string, RawCandidate>();

  for (const r of stateRows) {
    const ratings = asEveningRatings(r.s.eveningRatings);
    if (ratings) {
      diagnostics.withRatings += 1;
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
        source: 'evening_ratings',
        status: 'сдано',
        shiftId: r.p.shiftId ?? null,
      });
      continue;
    }

    if (!includeDrafts || !r.s.eveningDraft) continue;
    const draft = r.s.eveningDraft as {
      form?: unknown;
      tomorrowRoleKey?: string;
      updatedAt?: string;
    };
    const draftRatings = asEveningRatings(draft.form);
    if (!draftRatings) continue;
    diagnostics.withDraftOnly += 1;
    const key = `${r.p.id}:${r.s.dayNumber}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      participantId: r.p.id,
      dayNumber: r.s.dayNumber,
      ratings: draftRatings,
      tomorrowRoleKey: draft.tomorrowRoleKey
        ?? r.s.tomorrowRoleKey
        ?? (typeof draftRatings.tomorrowRoleKey === 'string' ? draftRatings.tomorrowRoleKey : null),
      filledAt: draft.updatedAt ? new Date(draft.updatedAt) : (r.s.updatedAt ?? null),
      p: r.p,
      directionName: r.dirName ?? r.p.direction ?? null,
      source: 'draft',
      status: 'черновик',
      shiftId: r.p.shiftId ?? null,
    });
  }

  // Fallback / дополнение: answers на вопросы «Итоги дня»
  const questionConds = [
    or(
      eq(questions.questionKind, 'day_summary'),
      sql`LOWER(COALESCE(${questions.block}, '')) LIKE '%итог%'`,
      sql`LOWER(COALESCE(${questions.title}, '')) LIKE '%итоговая анкета%'`,
    )!,
  ];
  if (filters.day != null && filters.day > 0) {
    questionConds.push(eq(questions.dayNumber, filters.day));
  }
  if (requestedShiftId != null) {
    questionConds.push(eq(questions.shiftId, requestedShiftId));
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
    .where(and(...baseConds, ...questionConds));

  for (const r of answerRows) {
    if (!isEveningSummaryQuestion(r.q)) continue;
    let ratings = asEveningRatings(r.a.answerData);
    if (!ratings && typeof r.a.answerData === 'string' && r.a.answerData.trim()) {
      ratings = { freeNote: r.a.answerData.trim(), mainThesis: r.a.answerData.trim() };
    }
    if (!ratings) continue;
    const dayNumber = r.q.dayNumber ?? 0;
    if (!dayNumber || dayNumber < 1) continue;
    diagnostics.answerRowsMatched += 1;
    const key = `${r.p.id}:${dayNumber}`;
    if (byKey.has(key) && byKey.get(key)!.source === 'evening_ratings') continue;
    if (byKey.has(key) && byKey.get(key)!.source === 'answers') continue;
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
      source: 'answers',
      status: 'сдано',
      shiftId: r.p.shiftId ?? null,
    });
  }

  let candidates = [...byKey.values()];
  diagnostics.afterShiftFilter = candidates.length;

  if (filters.day != null && filters.day > 0) {
    // Strict forum-day filter: never fall back to other days when the slice is empty.
    candidates = candidates.filter(r => r.dayNumber === filters.day);
    diagnostics.afterDayFilter = candidates.length;
    if (candidates.length === 0) {
      notes.push(
        `За день ${filters.day} заполненных итоговых анкет нет (фильтр по дню форума, не по часам сдачи).`,
      );
    }
  } else {
    diagnostics.afterDayFilter = candidates.length;
  }

  if (filters.direction?.trim()) {
    const d = filters.direction.trim().toLowerCase();
    candidates = candidates.filter(r =>
      (r.directionName || '').toLowerCase() === d
      || (r.p.direction || '').toLowerCase() === d,
    );
  }
  if (filters.group?.trim()) {
    const g = filters.group.trim().toLowerCase();
    candidates = candidates.filter(r => (r.p.groupName || '').toLowerCase() === g);
  }
  if (filters.ageCategory) {
    candidates = candidates.filter(r => matchesAgeCategory(r.p.age, filters.ageCategory!));
  }
  if (filters.activityQ) {
    candidates = candidates.filter(r => matchesActivity(r.p.position, filters.activityQ!));
  }
  diagnostics.afterCohortFilter = candidates.length;

  candidates.sort((a, b) => {
    const dayCmp = a.dayNumber - b.dayNumber;
    if (dayCmp !== 0) return dayCmp;
    const an = [a.p.lastName, a.p.firstName].filter(Boolean).join(' ');
    const bn = [b.p.lastName, b.p.firstName].filter(Boolean).join(' ');
    return an.localeCompare(bn, 'ru');
  });

  const rows: EveningExportRow[] = candidates.map(({ shiftId: _s, ...rest }) => rest);

  const daysInData = [...new Set(rows.map(r => r.dayNumber))].sort((a, b) => a - b);
  const daysForFields = daysInData.length
    ? daysInData
    : (filters.day != null && filters.day > 0 ? [filters.day] : [dayForStatus]);
  const ratingKeys = [...new Set(rows.flatMap(r => Object.keys(r.ratings)))];
  const fields = resolveEveningQuestionFields(settings, daysForFields, ratingKeys);

  let emptyReason: string | null = null;
  if (rows.length === 0) {
    emptyReason = [
      'Нет заполненных итоговых анкет на выбранной смене.',
      `Day state: ${diagnostics.totalDayStates}, сдано (evening_ratings): ${diagnostics.withRatings}, черновики: ${diagnostics.withDraftOnly}, answers «Итоги дня»: ${diagnostics.answerRowsMatched}.`,
      requestedShiftId != null ? `Смена #${requestedShiftId}.` : '',
      eveningForceUnpublished
        ? 'Анкета снята с публикации — сначала опубликуйте её в настройках «Итоговая анкета», затем участники смогут заполнить.'
        : 'Проверьте, что участники нажали «Отправить» в итоговой анкете на главной (не путать с вечерней проверкой состояния).',
    ].filter(Boolean).join(' ');
  }

  return { rows, fields, settings, emptyReason, diagnostics };
}
