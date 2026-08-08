import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { participantDayState, participants } from '../../db/schema.js';
import { matchesAgeCategory, matchesActivity } from '../analytics/cohortFilters.js';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  type EveningField,
} from '../eveningQuestionnaireConfig.js';
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

/** Плоский список полей вечерней анкеты (вопросы итогов дня). */
function eveningQuestionFields(): EveningField[] {
  const fromConfig = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.flatMap(s => s.fields);
  const seen = new Set(fromConfig.map(f => f.key));
  // На случай расхождения конфига и шкал — гарантируем все scale keys.
  for (const key of EVENING_SCALE_KEYS) {
    if (seen.has(key)) continue;
    fromConfig.push({
      key,
      type: 'scale_1_5',
      label: EVENING_SCALE_LABELS[key] || key,
    });
    seen.add(key);
  }
  return fromConfig;
}

function formatYesNo(value: unknown): string {
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') return 'Да';
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') return 'Нет';
  if (value == null || value === '') return '';
  return String(value);
}

function formatFieldValue(field: EveningField, ratings: Record<string, unknown>, tomorrowRoleKey: string | null): string | number {
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
  return String(raw);
}

/**
 * Аналитическая выгрузка «Итоги дня»: 1 строка = участник × день.
 * Колонки: время, ФИО, данные участника, создание, направление, группа и все вопросы анкеты.
 */
export async function writeEveningSummaryExport(
  res: Response,
  filters: EveningSummaryExportFilters = {},
): Promise<void> {
  const conditions = [isNull(participants.selfDeletedAt)];
  conditions.push(ne(sql`LOWER(${participants.direction})`, 'организатор форума'));
  if (filters.shiftId != null && !Number.isNaN(filters.shiftId)) {
    conditions.push(eq(participants.shiftId, filters.shiftId));
  }

  const rows = await db.select({ s: participantDayState, p: participants })
    .from(participantDayState)
    .innerJoin(participants, eq(participantDayState.participantId, participants.id))
    .where(and(...conditions));

  let filtered = rows.filter(r => r.s.eveningRatings != null);
  if (filters.day != null && filters.day > 0) {
    filtered = filtered.filter(r => r.s.dayNumber === filters.day);
  }
  if (filters.direction?.trim()) {
    const d = filters.direction.trim();
    filtered = filtered.filter(r => r.p.direction === d);
  }
  if (filters.group?.trim()) {
    const g = filters.group.trim();
    filtered = filtered.filter(r => r.p.groupName === g);
  }
  if (filters.ageCategory) {
    filtered = filtered.filter(r => matchesAgeCategory(r.p.age, filters.ageCategory!));
  }
  if (filters.activityQ) {
    filtered = filtered.filter(r => matchesActivity(r.p.position, filters.activityQ!));
  }

  filtered.sort((a, b) => {
    const dayCmp = (a.s.dayNumber ?? 0) - (b.s.dayNumber ?? 0);
    if (dayCmp !== 0) return dayCmp;
    return fullName(a.p).localeCompare(fullName(b.p), 'ru');
  });

  const questionFields = eveningQuestionFields();
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
    'Выгрузка «Итоги дня» (вечерняя итоговая анкета).',
    'Одна строка = один участник × один день форума (только сдавшие анкету).',
    'Колонки вопросов соответствуют шагам анкеты: оценки, участие в программе, выводы, эксперимент, роль на завтра.',
    filters.day ? `Фильтр: день ${filters.day}.` : 'Фильтр: все дни смены.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
  ].filter(Boolean));

  const ws = wb.addWorksheet('Итоги дня');
  ws.addRow([...metaHeaders, ...questionHeaders]);

  for (const r of filtered) {
    const ratings = (r.s.eveningRatings ?? {}) as Record<string, unknown>;
    const registeredAt = r.p.onboardingCompletedAt ?? r.p.createdAt;
    ws.addRow([
      r.p.id,
      fullName(r.p),
      r.p.vkId ?? '',
      formatTs(r.p.createdAt),
      formatTs(registeredAt),
      r.p.direction ?? '',
      r.p.groupName ?? '',
      roleLabel(r.p.pedagogicalRole),
      r.s.dayNumber,
      formatTs(r.s.updatedAt),
      ...questionFields.map(f => formatFieldValue(f, ratings, r.s.tomorrowRoleKey)),
    ]);
  }

  // Доп. лист «длинный» формат: удобно для сводных таблиц по отдельным вопросам
  const long = wb.addWorksheet('Вопросы (длинный)');
  long.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Время заполнения',
    'Ключ вопроса', 'Вопрос', 'Ответ',
  ]);
  for (const r of filtered) {
    const ratings = (r.s.eveningRatings ?? {}) as Record<string, unknown>;
    for (const field of questionFields) {
      const answer = formatFieldValue(field, ratings, r.s.tomorrowRoleKey);
      if (answer === '' || answer == null) continue;
      long.addRow([
        r.p.id,
        fullName(r.p),
        r.p.direction ?? '',
        r.p.groupName ?? '',
        r.s.dayNumber,
        formatTs(r.s.updatedAt),
        field.key,
        field.label || field.key,
        answer,
      ]);
    }
  }

  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';
  await sendWorkbook(res, wb, `evening_summary_${dayPart}.xlsx`);
}
