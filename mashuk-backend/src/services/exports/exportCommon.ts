import type { answers, participants, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { getReflectionTypeLabel } from '../reflectionTypeLabel.js';
import { questionMatchesExportFilter, touchpointTypeForQuestion, type ExportTouchpointFilter } from './touchpointFilter.js';

/** Stable keys for custom export column picker (not shown as CSV titles). */
export const ANSWER_ROW_HEADERS = [
  'participant_id',
  'full_name',
  'direction',
  'group_name',
  'day',
  'filled_at',
  'answered_at',
  'question_type',
  'question_text',
  'answer',
  'points',
  'source',
] as const;

/** Russian titles for answer CSV / XLSX downloads. */
export const ANSWER_ROW_HEADERS_RU = [
  'ID участника',
  'ФИО',
  'Направление',
  'Группа',
  'День',
  'Время заполнения',
  'Время ответа',
  'Тип данных',
  'Вопрос',
  'Ответ',
  'Баллы',
  'Источник',
] as const;

export function fullName(p: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!p) return '';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
}

export function formatTs(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

export function answerText(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data ?? '');
}

export function filterPublishedQuestions<T extends { status?: string | null }>(rows: T[]): T[] {
  return rows.filter(q => isPublishedStatus(q.status));
}

export type AnswerJoinRow = {
  a: typeof answers.$inferSelect;
  p: typeof participants.$inferSelect | null;
  q: typeof questions.$inferSelect | null;
};

export function buildAnswerRow(
  r: AnswerJoinRow,
  opts?: { source?: string; depth?: string },
): (string | number | null)[] {
  const text = answerText(r.a.answerData);
  const qType = r.q
    ? touchpointTypeForQuestion(r.q)
    : '';
  const questionLabel = r.q ? (r.q.text || r.q.title) : '';
  const typeLabel = r.q ? getReflectionTypeLabel(r.q) : '';
  return [
    r.p?.id ?? null,
    fullName(r.p),
    r.p?.direction ?? '',
    r.p?.groupName ?? '',
    r.q?.dayNumber ?? '',
    formatTs(r.a.createdAt),
    formatTs(r.a.createdAt),
    typeLabel || qType,
    questionLabel,
    text,
    r.a.pointsAwarded ?? '',
    opts?.source ?? '',
  ];
}

export function filterAnswersByTouchpoint(
  rows: AnswerJoinRow[],
  filter: ExportTouchpointFilter,
): AnswerJoinRow[] {
  return rows.filter(r => r.q && questionMatchesExportFilter(r.q, filter));
}

export function addReadmeSheet(wb: { addWorksheet: (name: string) => { addRow: (cells: unknown[]) => void } }, lines: string[]) {
  const sheet = wb.addWorksheet('Описание');
  sheet.addRow(['Описание выгрузки']);
  for (const line of lines) sheet.addRow([line]);
}
