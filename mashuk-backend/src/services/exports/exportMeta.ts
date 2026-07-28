import { ANSWER_ROW_HEADERS } from './exportCommon.js';
import {
  PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS,
  PARTICIPANT_ACTIVITY_WIDE_SHIFT_COLUMNS,
} from './participantActivityWide.js';

export type ExportSourceId =
  | 'answers'
  | 'reflections'
  | 'participants'
  | 'tasks'
  | 'rating_day'
  | 'piggybank'
  | 'participant_activity_wide';

export type ExportColumnDef = { key: string; label: string };

const ANSWER_COLUMNS: ExportColumnDef[] = [
  { key: 'participant_id', label: 'ID участника' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'day', label: 'День' },
  { key: 'filled_at', label: 'Время заполнения' },
  { key: 'answered_at', label: 'Время ответа' },
  { key: 'question_type', label: 'Тип данных' },
  { key: 'question_text', label: 'Вопрос' },
  { key: 'answer', label: 'Ответ' },
  { key: 'points', label: 'Баллы' },
  { key: 'source', label: 'Источник' },
];

const PARTICIPANT_COLUMNS: ExportColumnDef[] = [
  { key: 'id', label: 'ID' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'path_points', label: 'Путь' },
  { key: 'experience_points', label: 'Опыт' },
  { key: 'total_rating', label: 'Рейтинг' },
  { key: 'start_role', label: 'Роль на входе' },
  { key: 'strong_role', label: 'Сильная роль' },
];

const TASK_COLUMNS: ExportColumnDef[] = [
  { key: 'participant_id', label: 'ID участника' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'task_title', label: 'Задание' },
  { key: 'status', label: 'Статус' },
  { key: 'points', label: 'Баллы' },
  { key: 'submitted_at', label: 'Подано' },
];

const RATING_COLUMNS: ExportColumnDef[] = [
  { key: 'rank', label: 'Место' },
  { key: 'participant_id', label: 'ID' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'direction', label: 'Направление' },
  { key: 'group_name', label: 'Группа' },
  { key: 'day_points', label: 'Баллы за день' },
];

const PIGGYBANK_COLUMNS: ExportColumnDef[] = [
  { key: 'participant_id', label: 'ID участника' },
  { key: 'full_name', label: 'ФИО' },
  { key: 'direction', label: 'Направление' },
  { key: 'tag', label: 'Тег' },
  { key: 'text', label: 'Запись' },
  { key: 'source', label: 'Источник' },
  { key: 'created_at', label: 'Создано' },
];

/** Day-scoped defaults; shift-wide columns are also exposed for custom picker. */
const WIDE_COLUMNS: ExportColumnDef[] = (() => {
  const seen = new Set<string>();
  const out: ExportColumnDef[] = [];
  for (const c of [...PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS, ...PARTICIPANT_ACTIVITY_WIDE_SHIFT_COLUMNS]) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
})();

const WIDE_DEFAULT_COLUMNS = PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS.map(c => c.key);

export const EXPORT_SOURCES: {
  id: ExportSourceId;
  label: string;
  defaultColumns: string[];
  columns: ExportColumnDef[];
}[] = [
  {
    id: 'answers',
    label: 'Ответы (фильтруемые)',
    defaultColumns: [...ANSWER_ROW_HEADERS],
    columns: ANSWER_COLUMNS,
  },
  {
    id: 'reflections',
    label: 'Рефлексии (все текстовые)',
    defaultColumns: [...ANSWER_ROW_HEADERS],
    columns: ANSWER_COLUMNS,
  },
  {
    id: 'participants',
    label: 'Участники',
    defaultColumns: PARTICIPANT_COLUMNS.map(c => c.key),
    columns: PARTICIPANT_COLUMNS,
  },
  {
    id: 'participant_activity_wide',
    label: 'Участники × активности (wide)',
    defaultColumns: WIDE_DEFAULT_COLUMNS,
    columns: WIDE_COLUMNS,
  },
  {
    id: 'tasks',
    label: 'Заявки по заданиям',
    defaultColumns: TASK_COLUMNS.map(c => c.key),
    columns: TASK_COLUMNS,
  },
  {
    id: 'rating_day',
    label: 'Рейтинг за день',
    defaultColumns: RATING_COLUMNS.map(c => c.key),
    columns: RATING_COLUMNS,
  },
  {
    id: 'piggybank',
    label: 'Копилка',
    defaultColumns: PIGGYBANK_COLUMNS.map(c => c.key),
    columns: PIGGYBANK_COLUMNS,
  },
];

export function getExportMetaPayload() {
  return {
    crossFields: ANSWER_COLUMNS.filter(c =>
      ['full_name', 'direction', 'group_name', 'day', 'filled_at', 'question_type', 'question_text', 'answer', 'points', 'source'].includes(c.key),
    ),
    sources: EXPORT_SOURCES.map(s => ({
      id: s.id,
      label: s.label,
      defaultColumns: s.defaultColumns,
      columns: s.columns,
    })),
  };
}

export function resolveColumnLabels(source: ExportSourceId, keys: string[]): ExportColumnDef[] {
  const def = EXPORT_SOURCES.find(s => s.id === source);
  const map = new Map((def?.columns ?? []).map(c => [c.key, c.label]));
  return keys.map(key => ({ key, label: map.get(key) ?? key }));
}
