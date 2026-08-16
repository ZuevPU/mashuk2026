import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pedagogicalRoles } from '../db/schema.js';
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

export const GOAL_ANSWER_TYPES = ['open', 'choice', 'multi'] as const;
export type GoalAnswerType = (typeof GOAL_ANSWER_TYPES)[number];

/** Separator for multi-select goal answers stored as a single string. */
export const GOAL_MULTI_SEP = ' · ';

/** Sentinel in showWhen.options — trigger when participant picked «Свой вариант». */
export const GOAL_OTHER_VALUE = '__other__';

export type GoalShowWhen = {
  questionId: string;
  /** Option labels to match, or GOAL_OTHER_VALUE for custom text. */
  options: string[];
};

export type GoalQuestion = {
  id: string;
  text: string;
  type: GoalAnswerType;
  options: string[];
  /** Show «Свой вариант» + free-text input for choice/multi. */
  allowOther?: boolean;
  otherLabel?: string;
  /** Show this question only when a previous question matches. */
  showWhen?: GoalShowWhen | null;
};

export function newGoalQuestionId(): string {
  return `gq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type OnboardingConfig = {
  goalQuestions: GoalQuestion[];
  interestGroups: Array<{ title: string; tags: string[] }>;
  /** How many interest tags the participant must pick (inclusive). */
  interestMin: number;
  interestMax: number;
  questions: Array<{ text: string; options: string[] }>;
  optionToRole: RoleKey[][];
};

export const DEFAULT_INTEREST_MIN = 1;
export const DEFAULT_INTEREST_MAX = 8;
export const MIN_GOAL_QUESTIONS = 1;
export const MAX_GOAL_QUESTIONS = 24;
export const MIN_GOAL_OPTIONS = 2;
export const MAX_GOAL_OPTIONS = 12;

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

export const GOAL_QUESTIONS: GoalQuestion[] = [
  'С какой целью ты приехал на Машук?',
  'Что ты хочешь получить от программы?',
  'Какой запрос ты хочешь принести своему направлению?',
  'Что для тебя было бы главным результатом этих 8 дней?',
  'Что ты ожидаешь от других участников?',
].map((text, i) => ({ id: `gq_default_${i + 1}`, text, type: 'open' as const, options: [] }));

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

export function goalQuestionTexts(questions: GoalQuestion[] | string[] | null | undefined): string[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q, i) => {
    if (typeof q === 'string') return q.trim() || `Вопрос ${i + 1}`;
    return String(q?.text ?? '').trim() || `Вопрос ${i + 1}`;
  });
}

function normalizeGoalAnswerType(raw: unknown): GoalAnswerType {
  const t = String(raw ?? '').trim();
  return (GOAL_ANSWER_TYPES as readonly string[]).includes(t) ? (t as GoalAnswerType) : 'open';
}

function normalizeShowWhen(raw: unknown, knownIds: Set<string>): GoalShowWhen | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { questionId?: unknown; options?: unknown };
  const questionId = String(obj.questionId ?? '').trim();
  if (!questionId || !knownIds.has(questionId)) return null;
  const options = Array.isArray(obj.options)
    ? obj.options.map(o => String(o ?? '').trim()).filter(Boolean).slice(0, MAX_GOAL_OPTIONS + 1)
    : [];
  if (!options.length) return null;
  return { questionId, options };
}

export function normalizeGoalQuestions(raw: unknown): GoalQuestion[] {
  const defaults = GOAL_QUESTIONS.map(q => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: [...q.options],
    allowOther: false,
    showWhen: null as GoalShowWhen | null,
  }));
  if (!Array.isArray(raw) || raw.length < MIN_GOAL_QUESTIONS) return defaults;
  const usedIds = new Set<string>();
  const draft: Array<Omit<GoalQuestion, 'showWhen'> & { showWhenRaw?: unknown }> = [];
  for (const item of raw.slice(0, MAX_GOAL_QUESTIONS)) {
    if (typeof item === 'string') {
      let id = newGoalQuestionId();
      while (usedIds.has(id)) id = newGoalQuestionId();
      usedIds.add(id);
      draft.push({ id, text: item.trim().slice(0, 2000), type: 'open', options: [], allowOther: false });
      continue;
    }
    if (!item || typeof item !== 'object') {
      let id = newGoalQuestionId();
      while (usedIds.has(id)) id = newGoalQuestionId();
      usedIds.add(id);
      draft.push({ id, text: '', type: 'open', options: [], allowOther: false });
      continue;
    }
    const obj = item as {
      id?: unknown;
      text?: unknown;
      type?: unknown;
      options?: unknown;
      allowOther?: unknown;
      otherLabel?: unknown;
      showWhen?: unknown;
    };
    let id = String(obj.id ?? '').trim();
    if (!id || usedIds.has(id)) id = newGoalQuestionId();
    usedIds.add(id);
    const text = String(obj.text ?? '').trim().slice(0, 2000);
    const type = normalizeGoalAnswerType(obj.type);
    let options: string[] = [];
    if (Array.isArray(obj.options)) {
      options = obj.options
        .map(o => String(o ?? '').trim().slice(0, 500))
        .filter(o => o.length > 0)
        .slice(0, MAX_GOAL_OPTIONS);
    }
    const allowOther = type !== 'open' && obj.allowOther === true;
    const otherLabel = allowOther
      ? (String(obj.otherLabel ?? '').trim().slice(0, 120) || 'Свой вариант')
      : undefined;
    draft.push({
      id,
      text,
      type,
      options: type === 'open' ? [] : options,
      allowOther,
      otherLabel,
      showWhenRaw: obj.showWhen,
    });
  }
  const knownIds = new Set(draft.map(q => q.id));
  const out: GoalQuestion[] = draft.map((q, index) => {
    const showWhen = normalizeShowWhen(q.showWhenRaw, knownIds);
    // Only allow conditions on earlier questions (no cycles / forward refs).
    let safeShowWhen: GoalShowWhen | null = null;
    if (showWhen) {
      const parentIdx = draft.findIndex(d => d.id === showWhen.questionId);
      if (parentIdx >= 0 && parentIdx < index) safeShowWhen = showWhen;
    }
    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      allowOther: q.allowOther || undefined,
      otherLabel: q.otherLabel,
      showWhen: safeShowWhen,
    };
  });
  return out.length >= MIN_GOAL_QUESTIONS ? out : defaults;
}

export function parseGoalAnswerParts(answer: string): string[] {
  return String(answer ?? '').split(GOAL_MULTI_SEP).map(s => s.trim()).filter(Boolean);
}

export function goalAnswerMatchesTriggers(
  parent: GoalQuestion,
  parentAnswer: string,
  triggers: string[],
): boolean {
  const parts = parent.type === 'multi'
    ? parseGoalAnswerParts(parentAnswer)
    : [String(parentAnswer ?? '').trim()].filter(Boolean);
  if (!parts.length || !triggers.length) return false;
  for (const trigger of triggers) {
    if (trigger === GOAL_OTHER_VALUE) {
      if (parts.some(p => !parent.options.includes(p))) return true;
    } else if (parts.includes(trigger)) {
      return true;
    }
  }
  return false;
}

/** Whether question at index should be shown given current answers. */
export function isGoalQuestionVisible(
  questions: GoalQuestion[],
  answers: string[],
  index: number,
): boolean {
  const q = questions[index];
  if (!q) return false;
  if (!q.showWhen?.questionId || !q.showWhen.options?.length) return true;
  const parentIdx = questions.findIndex(x => x.id === q.showWhen!.questionId);
  if (parentIdx < 0 || parentIdx >= index) return false;
  if (!isGoalQuestionVisible(questions, answers, parentIdx)) return false;
  return goalAnswerMatchesTriggers(questions[parentIdx], answers[parentIdx] ?? '', q.showWhen.options);
}

/** Clear answers for questions that are currently hidden (chain-safe). */
export function pruneHiddenGoalAnswers(questions: GoalQuestion[], answers: string[]): string[] {
  const next = questions.map((_, i) => String(answers[i] ?? ''));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < questions.length; i++) {
      if (!isGoalQuestionVisible(questions, next, i) && next[i]) {
        next[i] = '';
        changed = true;
      }
    }
  }
  return next;
}

/** Returns error message or null if answers match the configured questions. */
export function validateGoalAnswers(
  questions: GoalQuestion[],
  answers: string[],
): string | null {
  if (answers.length !== questions.length) {
    return `Нужно ответить на вопросы целеполагания`;
  }
  const pruned = pruneHiddenGoalAnswers(questions, answers);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const visible = isGoalQuestionVisible(questions, pruned, i);
    const answer = String(pruned[i] ?? '').trim();
    if (!visible) continue;
    if (!answer) {
      return `Ответьте на вопрос ${i + 1}`;
    }
    if (answer.length > 2000) {
      return `Ответ на вопрос ${i + 1} слишком длинный`;
    }
    const effectiveType: GoalAnswerType = (
      q.type !== 'open' && q.options.length >= MIN_GOAL_OPTIONS ? q.type : 'open'
    );
    if (effectiveType === 'choice') {
      if (!q.options.includes(answer) && !q.allowOther) {
        return `Выберите один из вариантов для вопроса ${i + 1}`;
      }
    } else if (effectiveType === 'multi') {
      const parts = parseGoalAnswerParts(answer);
      if (parts.length === 0) {
        return `Выберите хотя бы один вариант для вопроса ${i + 1}`;
      }
      if (new Set(parts).size !== parts.length) {
        return `Некорректный выбор вариантов для вопроса ${i + 1}`;
      }
      const allowed = new Set(q.options);
      const unknown = parts.filter(p => !allowed.has(p));
      if (unknown.length > 1 || (unknown.length === 1 && !q.allowOther)) {
        return `Некорректный выбор вариантов для вопроса ${i + 1}`;
      }
    }
  }
  return null;
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

/** Участник выбирает от 1 до максимума из админки «Регистрация → Интересы». */
export function resolveParticipantInterestLimits(
  raw: unknown,
  tagCount = 0,
): { interestMin: number; interestMax: number } {
  const { interestMax } = normalizeInterestPickLimits(raw);
  let max = interestMax;
  if (tagCount > 0) max = Math.min(max, tagCount);
  return { interestMin: 1, interestMax: Math.max(1, max) };
}

export function interestPickCountError(
  count: number,
  limits: { interestMin: number; interestMax: number },
): string | null {
  if (count >= limits.interestMin && count <= limits.interestMax) return null;
  if (limits.interestMin === limits.interestMax) {
    return `Выберите ${limits.interestMin} интерес(ов)`;
  }
  return `Выберите от ${limits.interestMin} до ${limits.interestMax} интересов`;
}

export function normalizeInterestGroups(raw: unknown): Array<{ title: string; tags: string[] }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Array<{ title: string; tags: string[] }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String((item as { title?: unknown }).title ?? '').trim().slice(0, 255);
    const tagsRaw = (item as { tags?: unknown }).tags;
    if (!title || !Array.isArray(tagsRaw)) continue;
    const tags = tagsRaw
      .map(t => String(t ?? '').trim().slice(0, 100))
      .filter(t => t.length > 0);
    out.push({ title, tags });
  }
  return out;
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

/** Опции выбора роли: источник — pedagogical_roles (как в админке / регистрации). */
export type PedagogicalRoleOption = {
  roleKey: string;
  name: string;
  quadrant: string;
  essence: string;
  inClass: string;
  keywords: string;
  iconKey: string;
  sortOrder: number;
};

function catalogFallbackOptions(): PedagogicalRoleOption[] {
  return ROLE_CATALOG.map(r => ({
    roleKey: r.roleKey,
    name: r.name,
    quadrant: r.quadrant || '',
    essence: r.essence || '',
    inClass: r.inClass || '',
    keywords: r.keywords || '',
    iconKey: r.iconKey || '',
    sortOrder: r.sortOrder ?? 0,
  }));
}

function rowToOption(row: typeof pedagogicalRoles.$inferSelect): PedagogicalRoleOption {
  return {
    roleKey: row.roleKey,
    name: row.name,
    quadrant: row.quadrant || '',
    essence: row.essence || '',
    inClass: row.inClass || '',
    keywords: row.keywords || '',
    iconKey: row.iconKey || '',
    sortOrder: row.sortOrder ?? 0,
  };
}

/** Список ролей для селектов (вечерняя анкета, онбординг). Пустая БД → ROLE_CATALOG. */
export async function listPedagogicalRoleOptions(): Promise<PedagogicalRoleOption[]> {
  const rows = await db.select().from(pedagogicalRoles)
    .orderBy(asc(pedagogicalRoles.sortOrder), asc(pedagogicalRoles.id));
  if (!rows.length) return catalogFallbackOptions();
  return rows.map(rowToOption);
}

/** Мета роли: сначала БД, иначе каталог в коде. */
export async function findPedagogicalRole(roleKey: string | null | undefined): Promise<PedagogicalRoleOption | null> {
  if (!roleKey) return null;
  const [row] = await db.select().from(pedagogicalRoles)
    .where(eq(pedagogicalRoles.roleKey, roleKey)).limit(1);
  if (row) return rowToOption(row);
  const catalog = getRoleMeta(roleKey);
  if (!catalog) return null;
  return {
    roleKey: catalog.roleKey,
    name: catalog.name,
    quadrant: catalog.quadrant || '',
    essence: catalog.essence || '',
    inClass: catalog.inClass || '',
    keywords: catalog.keywords || '',
    iconKey: catalog.iconKey || '',
    sortOrder: catalog.sortOrder ?? 0,
  };
}
