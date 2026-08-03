import type { forumSettings } from '../db/schema.js';
import { getMoscowParts } from './timePhase.js';
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
  /** HH:MM Europe/Moscow — auto-open after this time (default 22:00). */
  opensAtMsk?: string;
  /** Admin forced the questionnaire open for this day (before opensAtMsk). */
  forcePublished?: boolean;
};

export const DEFAULT_EVENING_OPENS_AT_MSK = '22:00';

function eveningPublishMeta(
  config: EveningQuestionnaireConfig,
): Pick<EveningQuestionnaireConfig, 'opensAtMsk' | 'forcePublished'> {
  const meta: Pick<EveningQuestionnaireConfig, 'opensAtMsk' | 'forcePublished'> = {};
  if (config.opensAtMsk?.trim()) meta.opensAtMsk = config.opensAtMsk.trim();
  if (config.forcePublished) meta.forcePublished = true;
  return meta;
}

/** Normalize "21:00" / "9:30" → "HH:MM", or null if invalid. */
export function normalizeOpensAtMsk(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function getEveningOpensAtMsk(config: EveningQuestionnaireConfig | null | undefined): string {
  return normalizeOpensAtMsk(config?.opensAtMsk) || DEFAULT_EVENING_OPENS_AT_MSK;
}

function opensAtToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Evening questionnaire window: from opensAtMsk (or forcePublished) until 01:00 MSK.
 * Matches previous hardcoded 22:00–01:00 behaviour, with configurable start.
 */
export function isEveningOpenForConfig(
  config: EveningQuestionnaireConfig | null | undefined,
  now = new Date(),
): boolean {
  if (config?.forcePublished) return true;
  const { totalMinutes } = getMoscowParts(now);
  const openMinutes = opensAtToMinutes(getEveningOpensAtMsk(config));
  return totalMinutes >= openMinutes || totalMinutes < 60;
}

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
      ],
    },
    {
      id: 'experiment',
      title: 'Эксперимент с ролью',
      fields: [
        {
          key: 'experimentResult',
          type: 'experiment_text',
          label: 'Что получилось / не получилось в эксперименте с ролью?',
          required: false,
        },
      ],
    },
    {
      id: 'role',
      title: 'Роль на завтра',
      fields: [
        { key: 'tomorrowRoleKey', type: 'role_select', label: 'Завтра сфокусироваться на развитии какой роли?', required: false },
      ],
    },
  ],
};

/** Точка Б — отдельный вопрос в день 8, не часть вечерней анкеты дней 1–7. */
export function stripPointBFromEveningConfig(config: EveningQuestionnaireConfig): EveningQuestionnaireConfig {
  return {
    ...eveningPublishMeta(config),
    steps: config.steps
      .map(step => ({
        ...step,
        fields: step.fields.filter(f => f.type !== 'point_b_cta'),
      }))
      .filter(step => step.fields.length > 0),
  };
}

/** Вынести поля experiment_text в отдельный шаг (для старых конфигов админки). */
export function normalizeExperimentStep(config: EveningQuestionnaireConfig): EveningQuestionnaireConfig {
  const experimentFields: EveningField[] = [];
  const steps = config.steps.map(step => {
    const rest = step.fields.filter(f => {
      if (f.type === 'experiment_text') {
        experimentFields.push(f);
        return false;
      }
      return true;
    });
    return { ...step, fields: rest };
  }).filter(s => s.fields.length > 0);

  if (experimentFields.length === 0) {
    return { ...eveningPublishMeta(config), steps };
  }

  const roleIdx = steps.findIndex(s => s.id === 'role' || s.fields.some(f => f.type === 'role_select'));
  const experimentStep: EveningStep = {
    id: 'experiment',
    title: 'Эксперимент с ролью',
    fields: experimentFields,
  };
  if (roleIdx >= 0) {
    steps.splice(roleIdx, 0, experimentStep);
  } else {
    steps.push(experimentStep);
  }
  return { ...eveningPublishMeta(config), steps };
}

export function resolveEveningConfigForDay(
  settings: typeof forumSettings.$inferSelect | null,
  dayNumber: number,
): EveningQuestionnaireConfig {
  const byDay = settings?.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null;
  let config: EveningQuestionnaireConfig;
  if (byDay?.[String(dayNumber)]?.steps?.length) {
    config = byDay[String(dayNumber)];
  } else {
    const global = settings?.eveningQuestionnaireConfig as EveningQuestionnaireConfig | null;
    config = global?.steps?.length ? global : DEFAULT_EVENING_QUESTIONNAIRE_CONFIG;
  }
  if (dayNumber >= 1 && dayNumber <= 7) {
    return normalizeExperimentStep(stripPointBFromEveningConfig(config));
  }
  return normalizeExperimentStep(config);
}

export function isFieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  return v === field.visibleWhen.equals;
}
