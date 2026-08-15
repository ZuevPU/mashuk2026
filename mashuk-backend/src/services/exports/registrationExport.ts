import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { participants } from '../../db/schema.js';
import { matchesActivity, matchesAgeCategory } from '../analytics/cohortFilters.js';
import { getForumSettings } from '../helpers.js';
import { hideOrganizerName } from '../leaderboardQuery.js';
import {
  normalizeOnboardingConfig,
  type GoalQuestion,
  type OnboardingConfig,
} from '../roleService.js';
import { addReadmeSheet, formatTsMsk, fullName } from './exportCommon.js';
import { roleLabel } from './exportLabels.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type RegistrationExportFilters = {
  shiftId?: number | null;
  direction?: string;
  group?: string;
  ageCategory?: string;
  activity?: string;
  organizers?: boolean;
};

export const REGISTRATION_PROFILE_HEADERS = [
  'ID участника',
  'ФИО',
  'VK ID',
  'Возраст',
  'Направление',
  'Место работы',
  'Должность',
  'Регион',
  'Группа',
  'Согласие на ПД',
  'Согласие на аналитику',
  'Регистрация завершена',
  'Дата регистрации',
] as const;

export function pickGoalAnswer(raw: unknown, index: number, question: GoalQuestion): string {
  if (Array.isArray(raw)) return String(raw[index] ?? '').trim();
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (question.id && obj[question.id] != null) return String(obj[question.id]).trim();
    if (obj[String(index)] != null) return String(obj[String(index)]).trim();
  }
  return '';
}

export function pickInterestGroupTags(interests: unknown, group: { tags: string[] }): string {
  const selected = Array.isArray(interests) ? interests.map(v => String(v)) : [];
  const allowed = new Set(group.tags);
  return selected.filter(tag => allowed.has(tag)).join('; ');
}

export function pickDiagAnswer(
  roleAnswers: unknown,
  question: { options: string[] },
  index: number,
): string {
  const arr = Array.isArray(roleAnswers) ? roleAnswers : [];
  const optionIndex = Number(arr[index]);
  if (!Number.isFinite(optionIndex) || optionIndex < 0) return '';
  return question.options[optionIndex] ?? '';
}

export function buildRegistrationHeaders(config: OnboardingConfig): string[] {
  return [
    ...REGISTRATION_PROFILE_HEADERS,
    ...config.goalQuestions.map((q, i) => `Точка А · ${q.text.trim() || `Вопрос ${i + 1}`}`),
    ...config.interestGroups.map(g => `Интересы · ${g.title}`),
    'Интересы · все',
    ...config.questions.map((q, i) => `Диагностика · ${q.text.trim() || `Вопрос ${i + 1}`}`),
    'Роль по диагностике',
  ];
}

export function buildRegistrationTemplateRows(config: OnboardingConfig): string[][] {
  const rows: string[][] = [];
  for (const label of REGISTRATION_PROFILE_HEADERS) {
    rows.push(['Профиль', label, 'поле регистрации']);
  }
  config.goalQuestions.forEach((q, i) => {
    const kind = q.type === 'multi' ? 'несколько вариантов' : q.type === 'choice' ? 'выбор' : 'открытый';
    rows.push(['Точка А', q.text.trim() || `Вопрос ${i + 1}`, kind]);
  });
  for (const group of config.interestGroups) {
    rows.push(['Интересы', group.title, group.tags.join('; ')]);
  }
  config.questions.forEach((q, i) => {
    rows.push(['Диагностика', q.text.trim() || `Вопрос ${i + 1}`, q.options.join(' | ')]);
  });
  rows.push(['Диагностика', 'Роль по диагностике', 'результат']);
  return rows;
}

type RegistrationParticipant = {
  id: number;
  vkId: number;
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  direction?: string | null;
  workplace?: string | null;
  position?: string | null;
  region?: string | null;
  groupName?: string | null;
  consentPd?: boolean | null;
  consentAnalytics?: boolean | null;
  onboardingCompletedAt?: Date | string | null;
  createdAt?: Date | string | null;
  goalAnswers?: unknown;
  interests?: unknown;
  roleAnswers?: unknown;
  pedagogicalRole?: string | null;
};

export function buildRegistrationRow(
  p: RegistrationParticipant,
  config: OnboardingConfig,
): (string | number)[] {
  const interests = Array.isArray(p.interests) ? p.interests.map(v => String(v)) : [];
  return [
    p.id,
    fullName(p),
    p.vkId,
    p.age ?? '',
    p.direction ?? '',
    p.workplace ?? '',
    p.position ?? '',
    p.region ?? '',
    p.groupName ?? '',
    p.consentPd ? 'да' : 'нет',
    p.consentAnalytics ? 'да' : 'нет',
    p.onboardingCompletedAt ? 'да' : 'нет',
    formatTsMsk(p.onboardingCompletedAt ?? p.createdAt),
    ...config.goalQuestions.map((q, i) => pickGoalAnswer(p.goalAnswers, i, q)),
    ...config.interestGroups.map(g => pickInterestGroupTags(interests, g)),
    interests.join('; '),
    ...config.questions.map((q, i) => pickDiagAnswer(p.roleAnswers, q, i)),
    roleLabel(p.pedagogicalRole),
  ];
}

export async function writeRegistrationExport(
  res: Response,
  filters: RegistrationExportFilters = {},
): Promise<void> {
  const settings = await getForumSettings(filters.shiftId) as { roleDiagnosticsConfig?: unknown } | null;
  const config = normalizeOnboardingConfig(settings?.roleDiagnosticsConfig);

  const conditions = [isNull(participants.selfDeletedAt)];
  if (filters.shiftId != null && !Number.isNaN(filters.shiftId)) {
    conditions.push(eq(participants.shiftId, filters.shiftId));
  }

  const list = await db.select().from(participants)
    .where(and(...conditions))
    .orderBy(desc(participants.createdAt));

  const direction = filters.direction?.trim() || '';
  const group = filters.group?.trim() || '';
  const organizers = Boolean(filters.organizers);

  const filtered = list.filter(p => {
    if (hideOrganizerName(organizers, p.direction)) return false;
    if (direction && (p.direction || '') !== direction) return false;
    if (group && (p.groupName || '') !== group) return false;
    if (!matchesAgeCategory(p.age, filters.ageCategory || null)) return false;
    if (!matchesActivity(p.position, filters.activity || null)) return false;
    return true;
  });

  const headers = buildRegistrationHeaders(config);
  const rows = filtered.map(p => buildRegistrationRow(p, config));

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка регистрации участников по текущему шаблону анкеты смены.',
    'Колонки совпадают с блоками регистрации: профиль (возраст, направление, работа, регион, группа, согласия), точка А, интересы, диагностика роли.',
    'Это анкета при входе, не вечерняя и не точка Б.',
    `Участников в файле: ${filtered.length}.`,
    `Вопросов точки А: ${config.goalQuestions.length}.`,
    `Групп интересов: ${config.interestGroups.length}.`,
    `Вопросов диагностики: ${config.questions.length}.`,
    direction ? `Фильтр направления: ${direction}` : '',
    group ? `Фильтр группы: ${group}` : '',
    filters.ageCategory ? `Фильтр возраста: ${filters.ageCategory}` : '',
  ].filter(Boolean));

  const all = wb.addWorksheet('Регистрация');
  all.addRow(headers);
  for (const row of rows) all.addRow(row);

  const template = wb.addWorksheet('Шаблон');
  template.addRow(['Блок', 'Поле / вопрос', 'Тип / варианты']);
  for (const row of buildRegistrationTemplateRows(config)) template.addRow(row);

  await sendWorkbook(res, wb, 'registraciya.xlsx');
}
