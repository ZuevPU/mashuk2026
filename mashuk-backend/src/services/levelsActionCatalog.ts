/** Default action types for levels_config (admin «Система баллов»). */

export type ActionTrack = 'path' | 'experience' | 'bonus';
export type ActionGroup = 'path' | 'experience' | 'piggybank' | 'bonus' | 'levels';

export type ActionSourceBlock = {
  tab: 'questions' | 'forum' | 'onboarding' | 'events' | 'tasks' | 'piggybank' | 'levels';
  label: string;
  questionsKind?: 'state_check' | 'after_blocks' | 'day_summary' | 'exchange' | 'input';
  anchor?: string;
};

export type ActionCatalogDef = {
  actionType: string;
  displayName: string;
  track: ActionTrack;
  group: ActionGroup;
  pointsPerUnit: number;
  maxAccruals?: number | null;
  source?: ActionSourceBlock;
};

const SRC = {
  stateCheck: { tab: 'questions', questionsKind: 'state_check', label: 'Вопросы · Проверка состояния' },
  afterBlocks: { tab: 'questions', questionsKind: 'after_blocks', label: 'Вопросы · Точки осмысления' },
  daySummary: { tab: 'questions', questionsKind: 'day_summary', label: 'Вопросы · Итоги дня' },
  exchange: { tab: 'questions', questionsKind: 'exchange', label: 'Вопросы · Обмен опытом' },
  evening: { tab: 'forum', anchor: 'forum-cfg-evening', label: 'Форум · Итоговая анкета вечера' },
  wrap: { tab: 'forum', anchor: 'forum-cfg-evening', label: 'Форум · Итоги форума' },
  pointA: { tab: 'onboarding', questionsKind: 'input', label: 'Регистрация · Точка А' },
  events: { tab: 'events', label: 'Программа · События' },
  tasks: { tab: 'tasks', label: 'Задания' },
  piggybank: { tab: 'piggybank', label: 'Копилка' },
  bonuses: { tab: 'levels', anchor: 'levels-bonus', label: 'Система баллов · Бонусы' },
} as const satisfies Record<string, ActionSourceBlock>;

export const LEVEL_THRESHOLD_ACTION_TYPES = new Set(['path_level', 'exp_level']);

export const ACTION_CATALOG: ActionCatalogDef[] = [
  // Cap > 8: retries / mis-attributed forumDay must not silently stop XP mid-shift.
  { actionType: 'state_check_morning', displayName: 'Утренняя проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24, source: SRC.stateCheck },
  { actionType: 'state_check_day', displayName: 'Дневная проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24, source: SRC.stateCheck },
  { actionType: 'state_check_evening', displayName: 'Вечерняя проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24, source: SRC.stateCheck },
  // High cap: each open touchpoint uses this action; do not add a depth bonus.
  { actionType: 'question_answer', displayName: 'Точка осмысления (ответ)', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 10000, source: SRC.afterBlocks },
  { actionType: 'evening_complete', displayName: 'Итоги дня', track: 'path', group: 'path', pointsPerUnit: 15, maxAccruals: 16, source: SRC.evening },
  { actionType: 'forum_wrap_complete', displayName: 'Итоги форума', track: 'path', group: 'path', pointsPerUnit: 15, maxAccruals: 1, source: SRC.wrap },
  { actionType: 'point_a_complete', displayName: 'Точка А (вход)', track: 'path', group: 'path', pointsPerUnit: 20, maxAccruals: 1, source: SRC.pointA },
  { actionType: 'point_b_complete', displayName: 'Точка Б (выход)', track: 'path', group: 'path', pointsPerUnit: 30, maxAccruals: 1, source: SRC.evening },
  { actionType: 'exchange_question', displayName: 'Вопрос в «Общении»', track: 'path', group: 'path', pointsPerUnit: 3, maxAccruals: 30, source: SRC.exchange },
  { actionType: 'exchange_answer', displayName: 'Ответ участнику в «Общении»', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 50, source: SRC.exchange },
  { actionType: 'attendance', displayName: 'Посещение события программы', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 40, source: SRC.events },
  { actionType: 'day_complete_bonus', displayName: 'Бонус за полный день (все точки)', track: 'path', group: 'path', pointsPerUnit: 25, maxAccruals: 8, source: SRC.bonuses },
  { actionType: 'reflection_streak_7', displayName: 'Бонус за регулярность 7 дней', track: 'path', group: 'path', pointsPerUnit: 50, maxAccruals: 1, source: SRC.bonuses },

  { actionType: 'task_complete', displayName: 'Выполнение задания (дефолт)', track: 'experience', group: 'experience', pointsPerUnit: 20, maxAccruals: 100, source: SRC.tasks },

  { actionType: 'piggybank_idea', displayName: 'Копилка: идея', track: 'path', group: 'piggybank', pointsPerUnit: 5, maxAccruals: 50, source: SRC.piggybank },
  { actionType: 'piggybank_thought', displayName: 'Копилка: мысль', track: 'path', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 50, source: SRC.piggybank },
  { actionType: 'piggybank_question', displayName: 'Копилка: вопрос', track: 'path', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 50, source: SRC.piggybank },
  { actionType: 'piggybank_entry', displayName: 'Копилка: запись (прочее)', track: 'experience', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 100, source: SRC.piggybank },

  { actionType: 'bonus_regularity', displayName: 'Бонус регулярности (6+ полных дней)', track: 'bonus', group: 'bonus', pointsPerUnit: 60, maxAccruals: 1, source: SRC.bonuses },
  { actionType: 'bonus_diversity', displayName: 'Бонус разнообразия заданий', track: 'bonus', group: 'bonus', pointsPerUnit: 25, maxAccruals: 1, source: SRC.bonuses },

  { actionType: 'path_level', displayName: 'Пороги уровней «Пути»', track: 'path', group: 'levels', pointsPerUnit: 0, maxAccruals: null },
  { actionType: 'exp_level', displayName: 'Пороги уровней «Опыта»', track: 'experience', group: 'levels', pointsPerUnit: 0, maxAccruals: null },
];

export function slugifyCategoryName(name: string): string {
  const slug = name.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return slug || 'default';
}

export function taskCategoryActionType(categoryName: string): string {
  return `task_cat_${slugifyCategoryName(categoryName)}`;
}

export function taskCategoryCatalogDef(categoryName: string): ActionCatalogDef {
  return {
    actionType: taskCategoryActionType(categoryName),
    displayName: `Задание: ${categoryName}`,
    track: 'experience',
    group: 'experience',
    pointsPerUnit: 20,
    maxAccruals: null,
    source: SRC.tasks,
  };
}

export type MergedActionRow = ActionCatalogDef & {
  id?: number;
  levelThresholds?: unknown;
};

export function mergeCatalogWithDb(
  dbRows: {
    id: number;
    actionType: string;
    pointsPerUnit?: number | null;
    maxAccruals?: number | null;
    levelThresholds?: unknown;
    track?: string | null;
    displayName?: string | null;
  }[],
  extraCategoryNames: string[] = [],
): MergedActionRow[] {
  const byType = new Map(dbRows.map(r => [r.actionType, r]));
  const defs: ActionCatalogDef[] = [...ACTION_CATALOG];
  for (const cat of extraCategoryNames) {
    const at = taskCategoryActionType(cat);
    if (!defs.some(d => d.actionType === at) && !byType.has(at)) {
      defs.push(taskCategoryCatalogDef(cat));
    }
  }
  for (const row of dbRows) {
    if (row.actionType.startsWith('task_cat_') && !defs.some(d => d.actionType === row.actionType)) {
      const label = row.displayName || row.actionType.replace(/^task_cat_/, 'Задание: ');
      defs.push({
        actionType: row.actionType,
        displayName: label,
        track: (row.track as ActionTrack) || 'experience',
        group: 'experience',
        pointsPerUnit: row.pointsPerUnit ?? 20,
        maxAccruals: row.maxAccruals,
        source: SRC.tasks,
      });
    }
  }

  return defs
    .filter(d => !LEVEL_THRESHOLD_ACTION_TYPES.has(d.actionType))
    .map(def => {
      const row = byType.get(def.actionType);
      return {
        ...def,
        id: row?.id,
        displayName: row?.displayName?.trim() || def.displayName,
        pointsPerUnit: row?.pointsPerUnit ?? def.pointsPerUnit,
        maxAccruals: row?.maxAccruals ?? def.maxAccruals ?? null,
        track: (row?.track as ActionTrack) || def.track,
        levelThresholds: row?.levelThresholds,
      };
    });
}
