export type EveningFieldType =
  | 'scale_1_5'
  | 'yes_no'
  | 'text'
  | 'scale_1_10'
  | 'choice'
  | 'role_select'
  | 'experiment_text'
  | 'point_b_cta';

export type EveningField = {
  key: string;
  type: EveningFieldType;
  label: string;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  visibleWhen?: { field: string; equals: boolean | string | number };
};

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

export type EveningQuestionnaireConfig = {
  steps: EveningStep[];
  /** HH:MM МСК — автооткрытие после этого времени */
  opensAtMsk?: string;
  /** Организатор открыл анкету вручную раньше времени */
  forcePublished?: boolean;
  /** Организатор снял анкету с публикации (скрыта даже после opensAtMsk) */
  forceUnpublished?: boolean;
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
