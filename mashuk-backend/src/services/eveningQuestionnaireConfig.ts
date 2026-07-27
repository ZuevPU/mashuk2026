import type { forumSettings } from '../db/schema.js';
import { EVENING_SCALE_KEYS } from './touchpointTemplates.js';

export type EveningFieldType =
  | 'scale_1_5'
  | 'yes_no'
  | 'text'
  | 'scale_1_10'
  | 'role_select'
  | 'experiment_text'
  | 'point_b_cta';

export type EveningField = {
  key: string;
  type: EveningFieldType;
  label: string;
  required?: boolean;
  visibleWhen?: { field: string; equals: boolean | string | number };
};

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

export type EveningQuestionnaireConfig = {
  steps: EveningStep[];
};

const SCALE_LABELS: Record<string, string> = {
  direction: 'Работа в рамках тематического направления',
  lessonsImportant: 'Уроки о важном',
  openLessons: 'Открытые уроки, «уроки наоборот» и презентации практик',
  morningHealth: 'Утренняя программа здоровья',
  workshops: 'Мастер-классы и альтернативная программа',
  eveningAtmosphere: 'Вечерняя атмосферная программа',
  food: 'Организация питания',
  housing: 'Организация проживания и быта',
  curator: 'Работа куратора группы',
};

export const DEFAULT_EVENING_QUESTIONNAIRE_CONFIG: EveningQuestionnaireConfig = {
  steps: [
    {
      id: 'scales',
      title: 'Оценки дня',
      fields: EVENING_SCALE_KEYS.map(key => ({
        key,
        type: 'scale_1_5' as const,
        label: SCALE_LABELS[key] || key,
        required: false,
      })),
    },
    {
      id: 'conditional',
      title: 'Участие в программе',
      fields: [
        { key: 'tripYes', type: 'yes_no', label: 'Выезжал ли ты на полезную программу?', required: false },
        { key: 'tripScore', type: 'scale_1_5', label: 'Оцени выездную полезную программу', required: false, visibleWhen: { field: 'tripYes', equals: true } },
        { key: 'practiceYes', type: 'yes_no', label: 'Был ли ты на презентации педагогической практики?', required: false },
        { key: 'practiceName', type: 'text', label: 'Напиши, на какой', required: false, visibleWhen: { field: 'practiceYes', equals: true } },
        { key: 'recommendYes', type: 'yes_no', label: 'Готов ли рекомендовать эту практику коллегам?', required: false, visibleWhen: { field: 'practiceYes', equals: true } },
        { key: 'recommendScore', type: 'scale_1_10', label: 'Оцени практику', required: false, visibleWhen: { field: 'recommendYes', equals: true } },
      ],
    },
    {
      id: 'open',
      title: 'Выводы дня',
      fields: [
        { key: 'mainThesis', type: 'text', label: 'Главный тезис (ключевая мысль) дня', required: false },
        { key: 'understandingChange', type: 'text', label: 'Как изменилось понимание темы или деятельности?', required: false },
        { key: 'likedMost', type: 'text', label: 'Что понравилось больше всего?', required: false },
        { key: 'improveTomorrow', type: 'text', label: 'Что сделать, чтобы завтра оценки стали выше?', required: false },
        { key: 'freeNote', type: 'text', label: 'Свободное поле', required: false },
        { key: 'experimentResult', type: 'experiment_text', label: 'Эксперимент с ролью: что получилось / не получилось?', required: false },
      ],
    },
    {
      id: 'role',
      title: 'Роль на завтра',
      fields: [
        { key: 'tomorrowRoleKey', type: 'role_select', label: 'Завтра сфокусироваться на развитии какой роли?', required: false },
        { key: 'pointB_cta', type: 'point_b_cta', label: 'Точка Б (финал смены)', required: false },
      ],
    },
  ],
};

export function resolveEveningConfigForDay(
  settings: typeof forumSettings.$inferSelect | null,
  dayNumber: number,
): EveningQuestionnaireConfig {
  const byDay = settings?.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null;
  if (byDay?.[String(dayNumber)]?.steps?.length) {
    return byDay[String(dayNumber)];
  }
  const global = settings?.eveningQuestionnaireConfig as EveningQuestionnaireConfig | null;
  if (global?.steps?.length) return global;
  return DEFAULT_EVENING_QUESTIONNAIRE_CONFIG;
}

export function isFieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  return v === field.visibleWhen.equals;
}
