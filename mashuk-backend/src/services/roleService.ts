import { NAV_DIAG_OPTION_TO_ROLE, NAV_DIAG_QUESTIONS } from './navDiagnosticsDefaults.js';

export const ROLE_KEYS = [
  'meaning_researcher',
  'practice_realizer',
  'communication_guide',
  'content_packer',
  'process_navigator',
  'environment_keeper',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const MIN_DIAG_QUESTIONS = 1;
export const MAX_DIAG_QUESTIONS = 12;
export const MIN_DIAG_OPTIONS = 2;
export const MAX_DIAG_OPTIONS = 8;

/** Option index maps to role keys for each diagnostic question (defaults: 8×6). */
export const DEFAULT_OPTION_TO_ROLE: RoleKey[][] = NAV_DIAG_OPTION_TO_ROLE.map(row => [...row] as RoleKey[]);

/** @deprecated use DEFAULT_OPTION_TO_ROLE */
const OPTION_TO_ROLE = DEFAULT_OPTION_TO_ROLE;

export type RoleDiagnosticsConfig = {
  optionToRole: RoleKey[][];
  questions?: Array<{ text: string; options: string[] }>;
};

export type OnboardingConfig = {
  goalQuestions: string[];
  interestGroups: Array<{ title: string; tags: string[] }>;
  /** How many interest tags the participant must pick (inclusive). */
  interestMin: number;
  interestMax: number;
  questions: Array<{ text: string; options: string[] }>;
  optionToRole: RoleKey[][];
};

export const DEFAULT_INTEREST_MIN = 5;
export const DEFAULT_INTEREST_MAX = 8;
export const MIN_GOAL_QUESTIONS = 1;
export const MAX_GOAL_QUESTIONS = 12;

export function normalizeOptionToRole(
  raw: unknown,
  questions: Array<{ text: string; options: string[] }>,
): RoleKey[][] {
  const defaults = DEFAULT_OPTION_TO_ROLE.map(row => [...row]);
  const qCount = questions.length;
  const out: RoleKey[][] = [];

  for (let i = 0; i < qCount; i++) {
    const optCount = questions[i].options.length;
    const rawRow = Array.isArray(raw) ? raw[i] : null;
    const defRow = defaults[i] ?? defaults[0] ?? ROLE_KEYS.map(k => k);
    const row: RoleKey[] = [];
    for (let oi = 0; oi < optCount; oi++) {
      const fromRaw = Array.isArray(rawRow) ? String(rawRow[oi] ?? '') : '';
      const key = (ROLE_KEYS as readonly string[]).includes(fromRaw)
        ? (fromRaw as RoleKey)
        : (defRow[oi % defRow.length] as RoleKey);
      row.push(key);
    }
    out.push(row);
  }
  return out.length ? out : defaults;
}

export function getDefaultDiagnosticsConfig(): RoleDiagnosticsConfig {
  return {
    optionToRole: DEFAULT_OPTION_TO_ROLE.map(r => [...r]),
    questions: DIAGNOSTIC_QUESTIONS.map(q => ({ text: q.text, options: [...q.options] })),
  };
}

export const ROLE_PRIORITY: RoleKey[] = [
  'practice_realizer',
  'meaning_researcher',
  'communication_guide',
  'content_packer',
  'process_navigator',
  'environment_keeper',
];

/** Default display icon per pedagogical role (editable in admin). */
export const DEFAULT_ROLE_ICON: Record<RoleKey, string> = {
  meaning_researcher: '🔍',
  practice_realizer: '⚡',
  communication_guide: '🤝',
  content_packer: '📋',
  process_navigator: '🧭',
  environment_keeper: '🌿',
};

export const ROLE_MATRIX: Record<'leader' | 'org', Record<'thinking' | 'actions' | 'people', RoleKey>> = {
  leader: {
    thinking: 'meaning_researcher',
    actions: 'practice_realizer',
    people: 'communication_guide',
  },
  org: {
    thinking: 'content_packer',
    actions: 'process_navigator',
    people: 'environment_keeper',
  },
};

export const ROLE_CATALOG: Array<{
  roleKey: RoleKey;
  name: string;
  quadrant: string;
  essence: string;
  inClass: string;
  keywords: string;
  iconKey: string;
  sortOrder: number;
}> = [
  {
    roleKey: 'practice_realizer',
    name: 'Реализатор практики',
    quadrant: 'Лидерский · Действия',
    essence: 'Человек действия. Быстро превращает идею в работающий процесс. Смыслы держит в голове, но говорит через практику: «А давайте попробуем так».',
    inClass: 'Ты первый пробуешь новые форматы. Не ждёшь методичек — собираешь урок из того, что уже работает у других, и адаптируешь под своих детей.',
    keywords: 'пробовать · собирать · сделать · запустить · применить',
    iconKey: DEFAULT_ROLE_ICON.practice_realizer,
    sortOrder: 1,
  },
  {
    roleKey: 'meaning_researcher',
    name: 'Исследователь смыслов',
    quadrant: 'Лидерский · Мышление',
    essence: 'Ищет «зачем» раньше «как». Задаёт неудобные вопросы, держит глубину и помогает другим не сваливаться в суету.',
    inClass: 'Ты возвращаешь класс к смыслу задания. Помогаешь ученикам понять, зачем им это, а не только как выполнить.',
    keywords: 'зачем · смысл · вопрос · понять · разобраться',
    iconKey: DEFAULT_ROLE_ICON.meaning_researcher,
    sortOrder: 2,
  },
  {
    roleKey: 'communication_guide',
    name: 'Проводник коммуникации',
    quadrant: 'Лидерский · Люди',
    essence: 'Связывает людей и разговоры. Видит, кого надо услышать, и создаёт пространство для диалога.',
    inClass: 'Ты умеешь включить тихих и охладить конфликт. Класс работает как команда, а не как набор одиночек.',
    keywords: 'связать · услышать · договориться · диалог · включить',
    iconKey: DEFAULT_ROLE_ICON.communication_guide,
    sortOrder: 3,
  },
  {
    roleKey: 'content_packer',
    name: 'Упаковщик содержания',
    quadrant: 'Организационный · Мышление',
    essence: 'Делает сложное понятным. Структурирует материал, пишет инструкции, собирает «упаковку», которой можно пользоваться.',
    inClass: 'У тебя появляются схемы, чек-листы и памятки. Ученики знают, куда смотреть и как двигаться дальше.',
    keywords: 'структура · схема · инструкция · ясность · упаковать',
    iconKey: DEFAULT_ROLE_ICON.content_packer,
    sortOrder: 4,
  },
  {
    roleKey: 'process_navigator',
    name: 'Навигатор процесса',
    quadrant: 'Организационный · Действия',
    essence: 'Держит ритм и этапы. Видит маршрут от старта до финиша и не даёт команде потеряться.',
    inClass: 'Урок и проекты идут по понятным этапам. Ты заранее продумываешь переходы и дедлайны.',
    keywords: 'план · этап · ритм · маршрут · довести',
    iconKey: DEFAULT_ROLE_ICON.process_navigator,
    sortOrder: 5,
  },
  {
    roleKey: 'environment_keeper',
    name: 'Хранитель среды',
    quadrant: 'Организационный · Люди',
    essence: 'Заботится об атмосфере и устойчивости. Замечает выгорание, поддерживает правила и психологическую безопасность.',
    inClass: 'В твоём классе безопасно ошибаться. Ты следишь за тоном, ритуалами и тем, чтобы никто не выпадал.',
    keywords: 'атмосфера · забота · устойчивость · правила · поддержка',
    iconKey: DEFAULT_ROLE_ICON.environment_keeper,
    sortOrder: 6,
  },
];

export const DIAGNOSTIC_QUESTIONS: Array<{ text: string; options: string[] }> = NAV_DIAG_QUESTIONS.map(q => ({
  text: q.text,
  options: [...q.options],
}));

export const GOAL_QUESTIONS = [
  'С какой целью ты приехал на Машук?',
  'Что ты хочешь получить от программы?',
  'Какой запрос ты хочешь принести своему направлению?',
  'Что для тебя было бы главным результатом этих 8 дней?',
  'Что ты ожидаешь от других участников?',
] as const;

export const INTEREST_GROUPS: Array<{ title: string; tags: string[] }> = [
  {
    title: 'Как я работаю',
    tags: [
      'проектная работа',
      'исследовательская деятельность',
      'игропрактики',
      'воспитательная работа',
      'классное руководство',
      'детская редакция',
    ],
  },
  {
    title: 'С кем и как',
    tags: [
      'подростки',
      'младшая школа',
      'старшие классы',
      'работа с родителями',
      'командная работа учителей',
      'наставничество',
    ],
  },
  {
    title: 'Про что говорить',
    tags: [
      'оценки и мотивация',
      'осмысленность обучения',
      'выгорание учителя',
      'образование будущего',
      'школа и семья',
      'цифровая среда',
    ],
  },
  {
    title: 'Форматы, которые нравятся',
    tags: [
      'открытые уроки',
      'лекции и большие форматы',
      'клубы обсуждений',
      'мастер-классы',
      'полевые выезды',
    ],
  },
];

export function normalizeGoalQuestions(raw: unknown): string[] {
  const defaults = GOAL_QUESTIONS.map(q => q);
  if (!Array.isArray(raw) || raw.length < MIN_GOAL_QUESTIONS) return defaults;
  const sliced = raw.slice(0, MAX_GOAL_QUESTIONS);
  const out = sliced.map((q) => String(q ?? '').trim().slice(0, 2000));
  // Keep empty placeholders (admin fills texts later); need at least one slot
  return out.length >= MIN_GOAL_QUESTIONS ? out : defaults;
}

export function normalizeInterestPickLimits(raw: unknown): { interestMin: number; interestMax: number } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let min = Number(obj.interestMin);
  let max = Number(obj.interestMax);
  if (!Number.isFinite(min)) min = DEFAULT_INTEREST_MIN;
  if (!Number.isFinite(max)) max = DEFAULT_INTEREST_MAX;
  min = Math.max(1, Math.min(20, Math.floor(min)));
  max = Math.max(1, Math.min(30, Math.floor(max)));
  if (min > max) [min, max] = [max, min];
  return { interestMin: min, interestMax: max };
}

export function normalizeInterestGroups(raw: unknown): Array<{ title: string; tags: string[] }> {
  const defaults = INTEREST_GROUPS.map(g => ({ title: g.title, tags: [...g.tags] }));
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  const out: Array<{ title: string; tags: string[] }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String((item as { title?: unknown }).title ?? '').trim().slice(0, 255);
    const tagsRaw = (item as { tags?: unknown }).tags;
    if (!title || !Array.isArray(tagsRaw)) continue;
    const tags = tagsRaw
      .map(t => String(t ?? '').trim().slice(0, 100))
      .filter(t => t.length > 0);
    if (tags.length === 0) continue;
    out.push({ title, tags });
  }
  return out.length > 0 ? out : defaults;
}

/** Old factory quiz was hardcoded 6 questions × 4 options; replace with NAV 8×6. */
export function isLegacyDiag6x4(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length !== 6) return false;
  return raw.every(item => {
    if (!item || typeof item !== 'object') return false;
    const opts = (item as { options?: unknown }).options;
    return Array.isArray(opts) && opts.length === 4;
  });
}

export function normalizeDiagnosticQuestions(raw: unknown): Array<{ text: string; options: string[] }> {
  const defaults = DIAGNOSTIC_QUESTIONS.map(q => ({ text: q.text, options: [...q.options] }));
  if (isLegacyDiag6x4(raw)) return defaults;
  if (!Array.isArray(raw) || raw.length < MIN_DIAG_QUESTIONS) return defaults;
  const out: Array<{ text: string; options: string[] }> = [];
  for (const item of raw.slice(0, MAX_DIAG_QUESTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim().slice(0, 2000);
    const optsRaw = (item as { options?: unknown }).options;
    if (!Array.isArray(optsRaw)) continue;
    const options = optsRaw
      .map(o => String(o ?? '').trim().slice(0, 500))
      .slice(0, MAX_DIAG_OPTIONS);
    if (options.length < MIN_DIAG_OPTIONS) continue;
    out.push({ text: text || `Вопрос ${out.length + 1}`, options });
  }
  return out.length >= MIN_DIAG_QUESTIONS ? out : defaults;
}

export function normalizeOnboardingConfig(raw: unknown): OnboardingConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const limits = normalizeInterestPickLimits(obj);
  const legacyDiag = isLegacyDiag6x4(obj.questions);
  const questions = normalizeDiagnosticQuestions(obj.questions);
  return {
    goalQuestions: normalizeGoalQuestions(obj.goalQuestions),
    interestGroups: normalizeInterestGroups(obj.interestGroups),
    interestMin: limits.interestMin,
    interestMax: limits.interestMax,
    questions,
    optionToRole: normalizeOptionToRole(legacyDiag ? null : obj.optionToRole, questions),
  };
}

export function interestTagsFromConfig(config: OnboardingConfig): Set<string> {
  return new Set(config.interestGroups.flatMap(g => g.tags));
}

export function getDefaultOnboardingConfig(): OnboardingConfig {
  return normalizeOnboardingConfig({});
}

export function scorePedagogicalRole(
  roleAnswers: number[],
  optionToRole: RoleKey[][] = DEFAULT_OPTION_TO_ROLE,
): RoleKey {
  const matrix = optionToRole.length
    ? optionToRole
    : DEFAULT_OPTION_TO_ROLE.map(r => [...r]);
  if (!Array.isArray(roleAnswers) || roleAnswers.length !== matrix.length) {
    throw new Error(`roleAnswers must contain ${matrix.length} option indices`);
  }

  const scores: Record<RoleKey, number> = {
    meaning_researcher: 0,
    practice_realizer: 0,
    communication_guide: 0,
    content_packer: 0,
    process_navigator: 0,
    environment_keeper: 0,
  };

  roleAnswers.forEach((optionIndex, qIndex) => {
    const map = matrix[qIndex];
    if (!map || optionIndex < 0 || optionIndex >= map.length) {
      throw new Error(`Invalid role answer at question ${qIndex + 1}`);
    }
    scores[map[optionIndex]] += 1;
  });

  let best = ROLE_PRIORITY[0];
  let bestScore = -1;
  for (const key of ROLE_PRIORITY) {
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      best = key;
    }
  }
  return best;
}

export function getRoleMeta(roleKey: string) {
  return ROLE_CATALOG.find(r => r.roleKey === roleKey) ?? null;
}
