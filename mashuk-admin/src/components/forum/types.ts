export type EveningFieldType =
  | 'scale_1_5'
  | 'yes_no'
  | 'text'
  | 'scale_1_10'
  | 'choice'
  | 'program_event'
  | 'role_select'
  | 'experiment_text'
  | 'point_b_cta'
  | 'info_text';

export type EveningField = {
  key: string;
  type: EveningFieldType;
  label: string;
  required?: boolean;
  /** Formatted HTML for type=info_text. */
  html?: string;
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  /** Root program event ids for type=program_event (empty = all day blocks). */
  linkedEventIds?: number[];
  /** Empty / missing = all directions. Non-empty = only these direction ids. */
  audienceDirectionIds?: number[];
  /** Вопрос относится к итоговой анкете форума (дашборд «Итоги форума»). */
  forumFinal?: boolean;
  /** Точка Б — финальный вопрос смены. */
  pointB?: boolean;
  /** Точка Ж — промежуточный вопрос смены. */
  pointZh?: boolean;
  /**
   * Show when parent matches. `equals` is one value or several (OR):
   * `{ field: 'pick', equals: ['1', '2', '3'] }` → show if answer is 1 or 2 or 3.
   * Special: `__set__` parent filled; `__other__` choice «свой вариант».
   */
  visibleWhen?: { field: string; equals: EveningVisibleEquals | EveningVisibleEquals[] };
};

export type EveningVisibleEquals = boolean | string | number;

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

export type EveningQuestionnaireConfig = {
  steps: EveningStep[];
  /** HH:MM МСК — автооткрытие после этого времени */
  opensAtMsk?: string;
  /** HH:MM МСК — автозакрытие после этого времени (по умолчанию 02:00) */
  closesAtMsk?: string;
  /** День форума, с которого анкета видна */
  opensOnDay?: number;
  /** День форума, до которого анкета активна (02:00 обычно следующий день) */
  closesOnDay?: number;
  /** Организатор открыл анкету вручную раньше времени */
  forcePublished?: boolean;
  forcePublishedAt?: string;
  /** Организатор снял анкету с публикации (скрыта даже после opensAtMsk) */
  forceUnpublished?: boolean;
  /** Пустое «активна до» — не закрывать по часам */
  noScheduledClose?: boolean;
};

export type ProfileProgressWeights = {
  touchpoints: number;
  reflection: number;
  tasks: number;
  piggybankInWork: number;
};

export type RecommendationRule = {
  id: string;
  minDay?: number;
  maxDay?: number;
  kind: 'daily' | 'finale';
  when: 'low_answers' | 'low_piggybank' | 'missed_touchpoints' | 'default' | 'finale';
  text: string;
};

export const SECTIONS = ['home', 'program', 'tasks', 'questions', 'profile'] as const;

export const EVENING_FIELD_TYPE_OPTIONS: { value: EveningFieldType; label: string }[] = [
  { value: 'scale_1_5', label: 'Шкала 1–5' },
  { value: 'yes_no', label: 'Да / нет' },
  { value: 'choice', label: 'Один ответ из списка' },
  { value: 'program_event', label: 'События программы + оценка 1–10' },
  { value: 'info_text', label: 'Текстовый блок' },
  { value: 'text', label: 'Текстовый ответ' },
  { value: 'scale_1_10', label: 'Шкала 1–10' },
  { value: 'role_select', label: 'Выбор роли на завтра' },
  { value: 'experiment_text', label: 'Эксперимент с ролью' },
  { value: 'point_b_cta', label: 'Точка Б (финал)' },
];

export const RECOMMEND_WHEN_OPTIONS: { value: RecommendationRule['when']; label: string }[] = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'low_answers', label: 'Мало ответов на вопросы' },
  { value: 'low_piggybank', label: 'Мало записей в копилке' },
  { value: 'missed_touchpoints', label: 'Пропущены точки осмысления' },
  { value: 'finale', label: 'Финал смены (дни 7–8)' },
];

export function slugKey(label: string, existing: Set<string>): string {
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/[а-яё]/gi, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  if (!base) base = `f_${Date.now().toString(36).slice(-6)}`;
  let key = base;
  let n = 1;
  while (existing.has(key)) {
    key = `${base}_${n++}`;
  }
  existing.add(key);
  return key;
}

export function collectFieldKeys(config: EveningQuestionnaireConfig): Set<string> {
  const keys = new Set<string>();
  for (const step of config.steps) {
    for (const f of step.fields) keys.add(f.key);
  }
  return keys;
}

/** Sequential numbers for answerable questions (info blocks skipped). */
export function eveningQuestionNumbers(
  steps: EveningStep[],
  include?: (field: EveningField) => boolean,
): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const step of steps) {
    for (const field of step.fields) {
      if (field.type === 'info_text') continue;
      if (include && !include(field)) continue;
      n += 1;
      map.set(field.key, n);
    }
  }
  return map;
}

export function withEveningQuestionNumber(
  field: EveningField,
  numbers: Map<string, number>,
): EveningField {
  if (field.type === 'info_text') return field;
  const n = numbers.get(field.key);
  if (n == null) return field;
  return { ...field, label: `${n}. ${field.label}` };
}

export function eveningVisibleEqualsList(
  equals: EveningVisibleEquals | EveningVisibleEquals[] | undefined,
): EveningVisibleEquals[] {
  if (equals == null) return [];
  return Array.isArray(equals) ? equals : [equals];
}

export function packEveningVisibleEquals(
  list: EveningVisibleEquals[],
): EveningVisibleEquals | EveningVisibleEquals[] {
  return list.length <= 1 ? (list[0] ?? '') : list;
}

export function eveningEqualsMatch(a: EveningVisibleEquals, b: EveningVisibleEquals): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  if (typeof a === 'number' && typeof b === 'string' && b.trim() === String(a)) return true;
  if (typeof b === 'number' && typeof a === 'string' && a.trim() === String(b)) return true;
  return false;
}

export function eveningVisibleEqualsIncludes(
  equals: EveningVisibleEquals | EveningVisibleEquals[] | undefined,
  value: EveningVisibleEquals,
): boolean {
  return eveningVisibleEqualsList(equals).some(e => eveningEqualsMatch(e, value));
}

export function defaultVisibleEquals(parent: EveningField): EveningVisibleEquals {
  if (parent.type === 'yes_no') return true;
  if (parent.type === 'program_event') return '__set__';
  return (parent.options || []).map(o => String(o).trim()).find(Boolean) || '';
}

export function formatEveningVisibleEquals(
  equals: EveningVisibleEquals,
  parent?: EveningField,
): string {
  if (equals === true) return 'Да';
  if (equals === false) return 'Нет';
  if (equals === '__set__') return 'событие выбрано';
  if (equals === '__other__') return parent?.otherLabel || 'Свой вариант';
  return String(equals);
}
