import type { forumSettings } from '../db/schema.js';
import { getMoscowParts } from './timePhase.js';
import { EVENING_SCALE_KEYS } from './touchpointTemplates.js';

export type EveningFieldType =
  | 'scale_1_5'
  | 'yes_no'
  | 'text'
  | 'scale_1_10'
  | 'choice'
  | 'program_event'
  | 'role_select'
  | 'experiment_text'
  | 'point_b_cta';

export type EveningField = {
  key: string;
  type: EveningFieldType;
  label: string;
  required?: boolean;
  /** Options for type=choice */
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  /**
   * For type=program_event: root program block ids to offer (empty = all day roots).
   * Participant picks block → one or more themes, each with score 1–10.
   */
  linkedEventIds?: number[];
  /**
   * Empty / missing = all directions. Non-empty = only these direction ids.
   */
  audienceDirectionIds?: number[];
  /**
   * Show field when another field matches.
   * Special equals:
   * - `__other__` — choice «свой вариант»
   * - `__set__` — parent has a non-empty value (e.g. event picked + rated)
   */
  visibleWhen?: { field: string; equals: boolean | string | number };
};

/** One selected theme/block with optional inline 1–10 score. */
export type EveningProgramEventItem = {
  eventId: number;
  eventTitle: string;
  parentEventId: number;
  parentEventTitle: string;
  /** 1–10; null while choosing */
  score: number | null;
};

/** Stored shape for type=program_event answers inside evening_ratings. */
export type EveningProgramEventValue = {
  items: EveningProgramEventItem[];
};

/** Legacy single-pick shape (pre multi-select). */
type LegacyProgramEventValue = {
  eventId: number;
  eventTitle: string;
  parentEventId?: number | null;
  parentEventTitle?: string | null;
  score?: number | null;
};

export function normalizeEveningProgramEventValue(raw: unknown): EveningProgramEventValue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    const items: EveningProgramEventItem[] = [];
    for (const row of o.items) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const eventId = Number(r.eventId);
      if (!Number.isFinite(eventId) || eventId <= 0) continue;
      const scoreRaw = r.score;
      const score = scoreRaw == null || scoreRaw === ''
        ? null
        : Number(scoreRaw);
      items.push({
        eventId,
        eventTitle: String(r.eventTitle || ''),
        parentEventId: Number(r.parentEventId) || eventId,
        parentEventTitle: String(r.parentEventTitle || r.eventTitle || ''),
        score: Number.isFinite(score) && score! >= 1 && score! <= 10 ? Math.floor(score!) : null,
      });
    }
    return items.length ? { items } : null;
  }
  // Legacy: single eventId
  const eventId = Number(o.eventId);
  if (!Number.isFinite(eventId) || eventId <= 0) return null;
  const legacy = o as LegacyProgramEventValue;
  const score = legacy.score == null ? null : Number(legacy.score);
  return {
    items: [{
      eventId,
      eventTitle: String(legacy.eventTitle || ''),
      parentEventId: Number(legacy.parentEventId) || eventId,
      parentEventTitle: String(legacy.parentEventTitle || legacy.eventTitle || ''),
      score: Number.isFinite(score) && score! >= 1 && score! <= 10 ? Math.floor(score!) : null,
    }],
  };
}

export function isEveningProgramEventValue(raw: unknown): boolean {
  return normalizeEveningProgramEventValue(raw) != null;
}

export function isEveningProgramEventComplete(raw: unknown): boolean {
  const v = normalizeEveningProgramEventValue(raw);
  if (!v?.items.length) return false;
  return v.items.every(i => i.score != null && i.score >= 1 && i.score <= 10);
}

export function isEveningFieldValueSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (isEveningProgramEventValue(value)) return isEveningProgramEventComplete(value);
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

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
  /** ISO timestamp when forcePublished was set — expires at next 01:00 MSK. */
  forcePublishedAt?: string;
  /** Admin hid the questionnaire — overrides schedule and forcePublished. */
  forceUnpublished?: boolean;
};

export const DEFAULT_EVENING_OPENS_AT_MSK = '22:00';

function eveningPublishMeta(
  config: EveningQuestionnaireConfig,
): Pick<EveningQuestionnaireConfig, 'opensAtMsk' | 'forcePublished' | 'forcePublishedAt' | 'forceUnpublished'> {
  const meta: Pick<
    EveningQuestionnaireConfig,
    'opensAtMsk' | 'forcePublished' | 'forcePublishedAt' | 'forceUnpublished'
  > = {};
  if (config.opensAtMsk?.trim()) meta.opensAtMsk = config.opensAtMsk.trim();
  if (config.forcePublished) meta.forcePublished = true;
  if (config.forcePublishedAt?.trim()) meta.forcePublishedAt = config.forcePublishedAt.trim();
  if (config.forceUnpublished) meta.forceUnpublished = true;
  return meta;
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** «Опубликовать сейчас» действует до 01:00 МСК после московского дня установки. */
export function forcePublishedExpiresAt(forcedAt: Date): Date {
  const parts = getMoscowParts(forcedAt);
  const mskWall = new Date(forcedAt.getTime() + MSK_OFFSET_MS);
  if (parts.totalMinutes >= 60) {
    mskWall.setUTCDate(mskWall.getUTCDate() + 1);
  }
  mskWall.setUTCHours(1, 0, 0, 0);
  return new Date(mskWall.getTime() - MSK_OFFSET_MS);
}

/** Early force-open is active only with a fresh forcePublishedAt (legacy flag alone does not hang all day). */
export function isForcePublishedActive(
  config: EveningQuestionnaireConfig | null | undefined,
  now = new Date(),
): boolean {
  if (!config?.forcePublished) return false;
  if (!config.forcePublishedAt) return false;
  const forcedAt = new Date(config.forcePublishedAt);
  if (Number.isNaN(forcedAt.getTime())) return false;
  return now.getTime() < forcePublishedExpiresAt(forcedAt).getTime();
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
 * Evening questionnaire window: from opensAtMsk until 01:00 MSK.
 * forcePublished (with forcePublishedAt) opens early until that same 01:00 cutoff.
 * forceUnpublished always wins. Optional scheduleDayPublished=false hides the survey
 * when the forum day was taken off publication («Скрыть» день).
 */
export function isEveningOpenForConfig(
  config: EveningQuestionnaireConfig | null | undefined,
  now = new Date(),
  opts?: { scheduleDayPublished?: boolean | null },
): boolean {
  if (config?.forceUnpublished) return false;
  if (opts?.scheduleDayPublished === false) return false;
  const { totalMinutes } = getMoscowParts(now);
  const openMinutes = opensAtToMinutes(getEveningOpensAtMsk(config));
  if (totalMinutes >= openMinutes || totalMinutes < 60) return true;
  return isForcePublishedActive(config, now);
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
        {
          key: 'practiceEvent',
          type: 'program_event',
          label: 'Выбери блок / тему из программы',
          required: false,
          visibleWhen: { field: 'practiceYes', equals: true },
        },
        { key: 'recommendYes', type: 'yes_no', label: 'Готов ли рекомендовать эту практику коллегам?', required: false, visibleWhen: { field: 'practiceEvent', equals: '__set__' } },
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
  const dayEntry = byDay?.[String(dayNumber)];
  let config: EveningQuestionnaireConfig;
  if (dayEntry?.steps?.length) {
    config = dayEntry;
  } else {
    const global = settings?.eveningQuestionnaireConfig as EveningQuestionnaireConfig | null;
    config = global?.steps?.length ? global : DEFAULT_EVENING_QUESTIONNAIRE_CONFIG;
    // Day stub may only carry publish flags (e.g. after «Скрыть» day).
    if (dayEntry) {
      config = { ...config, ...eveningPublishMeta(dayEntry) };
    }
  }
  if (dayNumber >= 1 && dayNumber <= 7) {
    return normalizeExperimentStep(stripPointBFromEveningConfig(config));
  }
  return normalizeExperimentStep(config);
}

export function isFieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
  allFields: EveningField[] = [],
): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  const expected = field.visibleWhen.equals;
  if (expected === '__set__') {
    return isEveningFieldValueSet(v);
  }
  if (expected === '__other__') {
    const parent = allFields.find(f => f.key === field.visibleWhen!.field);
    const opts = parent?.options ?? [];
    return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v);
  }
  return v === expected;
}

export function normalizeAudienceDirectionIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.floor(n);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Empty / missing audienceDirectionIds → field is for all directions. */
export function isFieldForDirection(
  field: EveningField,
  directionId: number | null | undefined,
): boolean {
  const ids = normalizeAudienceDirectionIds(field.audienceDirectionIds);
  if (ids.length === 0) return true;
  if (directionId == null || !Number.isFinite(directionId)) return false;
  return ids.includes(Math.floor(directionId));
}

/** Drop fields (and empty steps) not meant for this participant direction. */
export function filterEveningConfigForDirection(
  config: EveningQuestionnaireConfig,
  directionId: number | null | undefined,
): EveningQuestionnaireConfig {
  return {
    ...config,
    steps: config.steps
      .map(step => ({
        ...step,
        fields: step.fields.filter(f => isFieldForDirection(f, directionId)),
      }))
      .filter(step => step.fields.length > 0),
  };
}

/** Collect program_event fields that need a day program tree. */
export function eveningProgramEventFields(config: EveningQuestionnaireConfig | null | undefined): EveningField[] {
  if (!config?.steps?.length) return [];
  return config.steps.flatMap(s => s.fields.filter(f => f.type === 'program_event'));
}
