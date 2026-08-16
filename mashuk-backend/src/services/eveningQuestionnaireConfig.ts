import type { forumSettings } from '../db/schema.js';
import { forumDayClockMsk, getCalendarForumDay, getMoscowParts } from './timePhase.js';
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
  | 'point_b_cta'
  | 'info_text';

export type EveningField = {
  key: string;
  type: EveningFieldType;
  label: string;
  required?: boolean;
  /** Formatted HTML for type=info_text (participant sees it as a divider). */
  html?: string;
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
   * Question belongs to the final forum questionnaire and feeds «Итоги форума».
   */
  forumFinal?: boolean;
  /** Точка Б — финальный вопрос смены. */
  pointB?: boolean;
  /** Точка Ж — промежуточный вопрос смены. */
  pointZh?: boolean;
  /**
   * Show field when another field matches.
   * `equals` may be one value or an array (OR): show if the parent matches any.
   * Special equals:
   * - `__other__` — choice «свой вариант»
   * - `__set__` — parent has a non-empty value (e.g. event picked + rated)
   */
  visibleWhen?: { field: string; equals: EveningVisibleEquals | EveningVisibleEquals[] };
};

export type EveningVisibleEquals = boolean | string | number;

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
  /** HH:MM Europe/Moscow — auto-close after this time (default 02:00). */
  closesAtMsk?: string;
  /** Forum day when the window starts (default = questionnaire day). */
  opensOnDay?: number;
  /** Forum day when the window ends. 02:00 after 22:00 is usually the next day. */
  closesOnDay?: number;
  /** Admin forced the questionnaire open — stays until «Снять с публикации». */
  forcePublished?: boolean;
  /** ISO timestamp when forcePublished was set (audit only, does not expire). */
  forcePublishedAt?: string;
  /** Admin hid the questionnaire — overrides schedule and forcePublished. */
  forceUnpublished?: boolean;
};

export const DEFAULT_EVENING_OPENS_AT_MSK = '22:00';
export const DEFAULT_EVENING_CLOSES_AT_MSK = '02:00';
export const EVENING_SCHEDULE_MAX_DAY = 8;

export function eveningPublishMeta(
  config: EveningQuestionnaireConfig,
): Pick<
  EveningQuestionnaireConfig,
  | 'opensAtMsk'
  | 'closesAtMsk'
  | 'opensOnDay'
  | 'closesOnDay'
  | 'forcePublished'
  | 'forcePublishedAt'
  | 'forceUnpublished'
> {
  const meta: Pick<
    EveningQuestionnaireConfig,
    | 'opensAtMsk'
    | 'closesAtMsk'
    | 'opensOnDay'
    | 'closesOnDay'
    | 'forcePublished'
    | 'forcePublishedAt'
    | 'forceUnpublished'
  > = {};
  if (config.opensAtMsk?.trim()) meta.opensAtMsk = config.opensAtMsk.trim();
  if (config.closesAtMsk?.trim()) meta.closesAtMsk = config.closesAtMsk.trim();
  if (config.opensOnDay != null) meta.opensOnDay = config.opensOnDay;
  if (config.closesOnDay != null) meta.closesOnDay = config.closesOnDay;
  if (config.forcePublished) meta.forcePublished = true;
  if (config.forcePublishedAt?.trim()) meta.forcePublishedAt = config.forcePublishedAt.trim();
  if (config.forceUnpublished) meta.forceUnpublished = true;
  return meta;
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

export function normalizeForumDay(raw: unknown, max = EVENING_SCHEDULE_MAX_DAY): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Kept for older callers; manual publish no longer expires by clock. */
export function forcePublishedExpiresAt(
  forcedAt: Date,
  closesAtMsk = DEFAULT_EVENING_CLOSES_AT_MSK,
): Date {
  const closeMinutes = clockToMinutes(normalizeOpensAtMsk(closesAtMsk) || DEFAULT_EVENING_CLOSES_AT_MSK);
  const parts = getMoscowParts(forcedAt);
  const mskWall = new Date(forcedAt.getTime() + MSK_OFFSET_MS);
  if (parts.totalMinutes >= closeMinutes) {
    mskWall.setUTCDate(mskWall.getUTCDate() + 1);
  }
  mskWall.setUTCHours(Math.floor(closeMinutes / 60), closeMinutes % 60, 0, 0);
  return new Date(mskWall.getTime() - MSK_OFFSET_MS);
}

/** «Опубликовать сейчас» — флаг в конфиге, без привязки к окну времени. */
export function isForcePublishedActive(
  config: EveningQuestionnaireConfig | null | undefined,
  _now = new Date(),
): boolean {
  return !!config?.forcePublished && !config?.forceUnpublished;
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

export function getEveningClosesAtMsk(config: EveningQuestionnaireConfig | null | undefined): string {
  return normalizeOpensAtMsk(config?.closesAtMsk) || DEFAULT_EVENING_CLOSES_AT_MSK;
}

export function getEveningOpensOnDay(
  config: EveningQuestionnaireConfig | null | undefined,
  questionnaireDay: number,
): number {
  return normalizeForumDay(config?.opensOnDay) ?? normalizeForumDay(questionnaireDay) ?? 1;
}

export function getEveningClosesOnDay(
  config: EveningQuestionnaireConfig | null | undefined,
  questionnaireDay: number,
): number {
  const explicit = normalizeForumDay(config?.closesOnDay);
  if (explicit != null) return explicit;
  const openDay = getEveningOpensOnDay(config, questionnaireDay);
  const openMinutes = clockToMinutes(getEveningOpensAtMsk(config));
  const closeMinutes = clockToMinutes(getEveningClosesAtMsk(config));
  if (closeMinutes <= openMinutes) {
    return Math.min(EVENING_SCHEDULE_MAX_DAY, openDay + 1);
  }
  return openDay;
}

export type EveningScheduleWindow = {
  opensAtMsk: string;
  closesAtMsk: string;
  opensOnDay: number;
  closesOnDay: number;
  start: Date | null;
  end: Date | null;
};

export function resolveEveningScheduleWindow(
  config: EveningQuestionnaireConfig | null | undefined,
  questionnaireDay: number,
  settings?: EveningDaySettings | null,
): EveningScheduleWindow {
  const opensAtMsk = getEveningOpensAtMsk(config);
  const closesAtMsk = getEveningClosesAtMsk(config);
  const opensOnDay = getEveningOpensOnDay(config, questionnaireDay);
  const closesOnDay = getEveningClosesOnDay(config, questionnaireDay);
  const startDate = settings?.startDate ?? null;
  const start = startDate ? forumDayClockMsk(startDate, opensOnDay, opensAtMsk) : null;
  const end = startDate ? forumDayClockMsk(startDate, closesOnDay, closesAtMsk) : null;
  return { opensAtMsk, closesAtMsk, opensOnDay, closesOnDay, start, end };
}

export function eveningScheduleApiFields(
  config: EveningQuestionnaireConfig | null | undefined,
  questionnaireDay: number,
) {
  return {
    opensAtMsk: getEveningOpensAtMsk(config),
    closesAtMsk: getEveningClosesAtMsk(config),
    opensOnDay: getEveningOpensOnDay(config, questionnaireDay),
    closesOnDay: getEveningClosesOnDay(config, questionnaireDay),
    scheduleHint: formatEveningScheduleHint(config, questionnaireDay),
  };
}

function applyClockField(
  next: EveningQuestionnaireConfig,
  raw: unknown,
  key: 'opensAtMsk' | 'closesAtMsk',
  existing?: string,
): { config: EveningQuestionnaireConfig; error?: string } {
  if (raw === undefined) {
    if (existing) return { config: { ...next, [key]: existing } };
    return { config: next };
  }
  const normalized = normalizeOpensAtMsk(raw === null || raw === '' ? null : String(raw));
  if (raw && !normalized) return { config: next, error: `${key} must be HH:MM` };
  if (normalized) return { config: { ...next, [key]: normalized } };
  const { [key]: _drop, ...rest } = next;
  return { config: rest };
}

function applyDayField(
  next: EveningQuestionnaireConfig,
  raw: unknown,
  key: 'opensOnDay' | 'closesOnDay',
  existing?: number,
): { config: EveningQuestionnaireConfig; error?: string } {
  if (raw === undefined) {
    if (existing != null) return { config: { ...next, [key]: existing } };
    return { config: next };
  }
  if (raw === null || raw === '') {
    const { [key]: _drop, ...rest } = next;
    return { config: rest };
  }
  const day = normalizeForumDay(raw);
  if (day == null) return { config: next, error: `${key} must be a forum day 1–${EVENING_SCHEDULE_MAX_DAY}` };
  return { config: { ...next, [key]: day } };
}

/** Apply schedule fields from an admin PATCH (top-level or nested in config). */
export function mergeEveningScheduleFromRequest(
  next: EveningQuestionnaireConfig,
  body: {
    opensAtMsk?: unknown;
    closesAtMsk?: unknown;
    opensOnDay?: unknown;
    closesOnDay?: unknown;
    config?: Partial<EveningQuestionnaireConfig> | null;
  },
  existing: EveningQuestionnaireConfig,
): { config: EveningQuestionnaireConfig; error?: string } {
  const cfg = body.config ?? {};
  let current = next;
  const clocks: Array<['opensAtMsk' | 'closesAtMsk', unknown, string | undefined]> = [
    ['opensAtMsk', body.opensAtMsk !== undefined ? body.opensAtMsk : cfg.opensAtMsk, existing.opensAtMsk],
    ['closesAtMsk', body.closesAtMsk !== undefined ? body.closesAtMsk : cfg.closesAtMsk, existing.closesAtMsk],
  ];
  for (const [key, raw, prev] of clocks) {
    const applied = applyClockField(current, raw, key, prev);
    if (applied.error) return applied;
    current = applied.config;
  }
  const days: Array<['opensOnDay' | 'closesOnDay', unknown, number | undefined]> = [
    ['opensOnDay', body.opensOnDay !== undefined ? body.opensOnDay : cfg.opensOnDay, existing.opensOnDay],
    ['closesOnDay', body.closesOnDay !== undefined ? body.closesOnDay : cfg.closesOnDay, existing.closesOnDay],
  ];
  for (const [key, raw, prev] of days) {
    const applied = applyDayField(current, raw, key, prev);
    if (applied.error) return applied;
    current = applied.config;
  }
  return { config: current };
}

export function formatEveningScheduleHint(
  config: EveningQuestionnaireConfig | null | undefined,
  questionnaireDay: number,
): string {
  const opensAt = getEveningOpensAtMsk(config);
  const closesAt = getEveningClosesAtMsk(config);
  const opensOnDay = getEveningOpensOnDay(config, questionnaireDay);
  const closesOnDay = getEveningClosesOnDay(config, questionnaireDay);
  if (opensOnDay === closesOnDay) {
    return `с ${opensAt} до ${closesAt} МСК дня ${opensOnDay}`;
  }
  return `с ${opensAt} дня ${opensOnDay} до ${closesAt} дня ${closesOnDay} МСК`;
}

type EveningDaySettings = {
  startDate?: Date | null;
  currentDay?: number | null;
  totalDays?: number | null;
};

/**
 * 00:00–02:00 MSK wrap belongs only to the operational forum day
 * (calendar day still yesterday until 02:00). Other days must not look «open».
 */
export function eveningOvernightAppliesToDay(
  questionnaireDay: number,
  settings: EveningDaySettings | null | undefined,
  now = new Date(),
): boolean {
  const cal = getCalendarForumDay(settings?.startDate ?? null, now, settings?.totalDays ?? 8);
  const operational = cal ?? settings?.currentDay ?? questionnaireDay;
  return questionnaireDay === operational;
}

function isWithinClockWindow(
  config: EveningQuestionnaireConfig | null | undefined,
  now: Date,
  allowOvernight: boolean,
): boolean {
  const { totalMinutes } = getMoscowParts(now);
  const openMinutes = clockToMinutes(getEveningOpensAtMsk(config));
  const closeMinutes = clockToMinutes(getEveningClosesAtMsk(config));
  if (closeMinutes > openMinutes) {
    return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
  }
  if (totalMinutes >= openMinutes) return true;
  return allowOvernight && totalMinutes < closeMinutes;
}

/**
 * Evening questionnaire window: from opensAtMsk until closesAtMsk (default 22:00→02:00).
 * Overnight wrap is opt-in (`allowOvernight`) so yesterday's form does not reopen
 * every night, and admin days 2–7 do not all show «open».
 * «Опубликовать по времени» — окно opensAt..closesAt.
 * «Опубликовать сейчас» — forcePublished, пока админ не снимет.
 * forceUnpublished always wins.
 */
export function isEveningOpenForConfig(
  config: EveningQuestionnaireConfig | null | undefined,
  now = new Date(),
  opts?: { scheduleDayPublished?: boolean | null; allowOvernight?: boolean },
): boolean {
  if (config?.forceUnpublished) return false;
  if (isForcePublishedActive(config, now)) return true;
  if (opts?.scheduleDayPublished === false) return false;
  return isWithinClockWindow(config, now, opts?.allowOvernight === true);
}

/** Open-window check for a specific forum day (overnight wrap only for that operational day). */
export function isEveningOpenForDay(
  config: EveningQuestionnaireConfig | null | undefined,
  dayNumber: number,
  now: Date,
  opts?: {
    settings?: EveningDaySettings | null;
    scheduleDayPublished?: boolean | null;
  },
): boolean {
  if (config?.forceUnpublished) return false;
  if (isForcePublishedActive(config, now)) return true;
  if (opts?.scheduleDayPublished === false) return false;
  const window = resolveEveningScheduleWindow(config, dayNumber, opts?.settings);
  if (window.start && window.end && window.end.getTime() > window.start.getTime()) {
    const t = now.getTime();
    return t >= window.start.getTime() && t < window.end.getTime();
  }
  return isEveningOpenForConfig(config, now, {
    scheduleDayPublished: opts?.scheduleDayPublished,
    allowOvernight: eveningOvernightAppliesToDay(dayNumber, opts?.settings, now),
  });
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

export function isForumFinalEveningField(field: EveningField): boolean {
  return field.forumFinal === true && field.type !== 'info_text';
}

export function isPointBEveningField(field: EveningField): boolean {
  return field.pointB === true && field.type !== 'info_text';
}

export function isPointZhEveningField(field: EveningField): boolean {
  return field.pointZh === true && field.type !== 'info_text';
}

/** Точка Б (финал) / Точка Ж (промежуточная) / без метки. */
export function eveningFieldPointKind(field: EveningField): 'b' | 'zh' | null {
  if (field.type === 'info_text') return null;
  if (field.pointB) return 'b';
  if (field.pointZh) return 'zh';
  return null;
}

export type ForumFinalQuestion = {
  /** Уникальный id среза (совпадает с key, если вопрос один на все дни). */
  id: string;
  /** Дни, где стоит галочка «Итоговый вопрос форума». */
  days: number[];
  field: EveningField;
};

function forumFinalSignature(field: EveningField): string {
  return field.type;
}

function slugForumFinalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'q';
}

function collectEveningFieldsByMark(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[],
  match: (field: EveningField) => boolean,
): { fields: EveningField[]; daysByKey: Map<string, number[]>; questions: ForumFinalQuestion[] } {
  const hits: Array<{ day: number; field: EveningField }> = [];
  for (const day of days) {
    const cfg = resolveEveningConfigForDay(settings, day);
    for (const field of (cfg.steps || []).flatMap(s => s.fields)) {
      if (!match(field)) continue;
      hits.push({ day, field });
    }
  }

  const byKey = new Map<string, Array<{ day: number; field: EveningField }>>();
  for (const hit of hits) {
    const list = byKey.get(hit.field.key) ?? [];
    list.push(hit);
    byKey.set(hit.field.key, list);
  }

  const questions: ForumFinalQuestion[] = [];
  for (const [key, group] of byKey) {
    const bySig = new Map<string, Array<{ day: number; field: EveningField }>>();
    for (const hit of group) {
      const sig = forumFinalSignature(hit.field);
      const list = bySig.get(sig) ?? [];
      list.push(hit);
      bySig.set(sig, list);
    }
    const split = bySig.size > 1;
    for (const list of bySig.values()) {
      const daysFor = [...new Set(list.map(h => h.day))].sort((a, b) => a - b);
      const field = list[list.length - 1].field;
      const id = split
        ? `${key}__${field.type}__${slugForumFinalPart(field.label)}__d${daysFor.join('-')}`
        : key;
      questions.push({ id, days: daysFor, field });
    }
  }

  const daysByKey = new Map<string, number[]>();
  for (const q of questions) {
    daysByKey.set(q.id, q.days);
    if (q.id === q.field.key) daysByKey.set(q.field.key, q.days);
  }
  return { fields: questions.map(q => q.field), daysByKey, questions };
}

/** Поля вечерней анкеты, отмеченные как итоговые вопросы форума (по всем дням смены). */
export function collectForumFinalEveningFields(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): EveningField[] {
  return collectForumFinalEveningFieldDays(settings, days).questions.map(q => q.field);
}

/** Те же поля + дни, на которых стоит галочка «Итоговый вопрос форума». */
export function collectForumFinalEveningFieldDays(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): { fields: EveningField[]; daysByKey: Map<string, number[]>; questions: ForumFinalQuestion[] } {
  return collectEveningFieldsByMark(settings, days, isForumFinalEveningField);
}

/** Поля вечерней анкеты, отмеченные как Точка Б. */
export function collectPointBEveningFields(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): EveningField[] {
  return collectPointBEveningFieldDays(settings, days).questions.map(q => q.field);
}

/** Те же поля + дни, на которых стоит галочка «Точка Б». */
export function collectPointBEveningFieldDays(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): { fields: EveningField[]; daysByKey: Map<string, number[]>; questions: ForumFinalQuestion[] } {
  return collectEveningFieldsByMark(settings, days, isPointBEveningField);
}

/** Поля вечерней анкеты, отмеченные как Точка Ж (промежуточные). */
export function collectPointZhEveningFields(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): EveningField[] {
  return collectPointZhEveningFieldDays(settings, days).questions.map(q => q.field);
}

/** Те же поля + дни, на которых стоит галочка «Точка Ж». */
export function collectPointZhEveningFieldDays(
  settings: typeof forumSettings.$inferSelect | null,
  days: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
): { fields: EveningField[]; daysByKey: Map<string, number[]>; questions: ForumFinalQuestion[] } {
  return collectEveningFieldsByMark(settings, days, isPointZhEveningField);
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

export function isEveningDisplayField(field: { type?: string | null }): boolean {
  return field.type === 'info_text';
}

export function isFieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
  allFields: EveningField[] = [],
  visiting: Set<string> = new Set(),
): boolean {
  if (!field.visibleWhen) return true;
  if (visiting.has(field.key)) return false;
  visiting.add(field.key);
  const parent = allFields.find(f => f.key === field.visibleWhen!.field);
  if (parent && !isFieldVisible(parent, form, allFields, visiting)) return false;
  const v = form[field.visibleWhen.field];
  const expectedList = Array.isArray(field.visibleWhen.equals)
    ? field.visibleWhen.equals
    : [field.visibleWhen.equals];
  if (expectedList.length === 0) return false;
  return expectedList.some(expected => matchEveningVisibleEquals(v, expected, parent));
}

/** Drop answers for fields that are currently hidden (or info blocks). */
export function stripHiddenEveningFieldValues(
  form: Record<string, unknown>,
  allFields: EveningField[],
): Record<string, unknown> {
  const next = { ...form };
  for (const field of allFields) {
    if (field.type === 'info_text' || !isFieldVisible(field, form, allFields)) {
      delete next[field.key];
    }
  }
  return next;
}

function matchEveningVisibleEquals(
  v: unknown,
  expected: EveningVisibleEquals,
  parent: EveningField | undefined,
): boolean {
  if (expected === '__set__') {
    return isEveningFieldValueSet(v);
  }
  if (expected === '__other__') {
    const opts = (parent?.options ?? []).map(o => String(o).trim());
    return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v.trim());
  }
  const left = typeof v === 'string' ? v.trim() : v;
  const right = typeof expected === 'string' ? expected.trim() : expected;
  if (left === right) return true;
  if (typeof right === 'boolean') {
    if (right) return left === 'true' || left === 'yes' || left === 1 || left === '1';
    return left === 'false' || left === 'no' || left === 0 || left === '0';
  }
  if (typeof right === 'number') {
    return left === String(right) || Number(left) === right;
  }
  if (typeof right === 'string' && typeof left === 'number') {
    return String(left) === right;
  }
  return false;
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

/** Clone for another shift: keep questions/schedule, but start unpublished. Only admin can publish. */
export function unpublishClonedQuestionnaire(config: unknown): unknown {
  if (Array.isArray(config)) return config.map(item => unpublishClonedQuestionnaire(item));
  if (!config || typeof config !== 'object') return config;
  const src = config as Record<string, unknown>;
  const looksLikeQuestionnaire = Array.isArray(src.steps)
    || 'forcePublished' in src
    || 'forceUnpublished' in src
    || 'opensAtMsk' in src;
  if (!looksLikeQuestionnaire) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      out[key] = unpublishClonedQuestionnaire(value);
    }
    return out;
  }
  const {
    forcePublished: _fp,
    forcePublishedAt: _fpa,
    forceUnpublished: _fu,
    ...rest
  } = src;
  return { ...rest, forceUnpublished: true };
}

/**
 * Копия анкеты на другой день: шаги/поля и время открытия.
 * Ссылки на события дня сбрасываются (id принадлежат fromDay).
 * Флаги «опубликовать сейчас / снять» целевого дня сохраняются — иначе копия
 * снимала бы уже открытую анкету или наоборот открывала закрытую.
 */
export function copyEveningQuestionnaireContent(
  src: EveningQuestionnaireConfig,
  opts?: { preservePublishFrom?: EveningQuestionnaireConfig | null },
): EveningQuestionnaireConfig {
  const publish = eveningPublishMeta(opts?.preservePublishFrom ?? { steps: [] });
  const {
    opensAtMsk: _oa,
    closesAtMsk: _ca,
    opensOnDay: _od,
    closesOnDay: _cd,
    ...publishFlags
  } = publish;
  const opensAt = src.opensAtMsk?.trim() || publish.opensAtMsk;
  const closesAt = src.closesAtMsk?.trim() || publish.closesAtMsk;
  return {
    ...publishFlags,
    ...(opensAt ? { opensAtMsk: opensAt } : {}),
    ...(closesAt ? { closesAtMsk: closesAt } : {}),
    steps: (src.steps || []).map(step => ({
      ...step,
      fields: (step.fields || []).map(field => (
        field.type === 'program_event'
          ? { ...field, linkedEventIds: [] }
          : { ...field }
      )),
    })),
  };
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
