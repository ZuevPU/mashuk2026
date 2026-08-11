/** Default action types for levels_config (admin «Система баллов»). */

export type ActionTrack = 'path' | 'experience' | 'bonus';
export type ActionGroup = 'path' | 'experience' | 'piggybank' | 'bonus' | 'levels';

export type ActionCatalogDef = {
  actionType: string;
  displayName: string;
  track: ActionTrack;
  group: ActionGroup;
  pointsPerUnit: number;
  maxAccruals?: number | null;
};

export const LEVEL_THRESHOLD_ACTION_TYPES = new Set(['path_level', 'exp_level']);

export const ACTION_CATALOG: ActionCatalogDef[] = [
  // Cap > 8: retries / mis-attributed forumDay must not silently stop XP mid-shift.
  { actionType: 'state_check_morning', displayName: 'Утренняя проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24 },
  { actionType: 'state_check_day', displayName: 'Дневная проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24 },
  { actionType: 'state_check_evening', displayName: 'Вечерняя проверка состояния', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 24 },
  // High cap: each open touchpoint + depth bonus both use this action (~2 rows/answer).
  { actionType: 'question_answer', displayName: 'Точка осмысления (ответ)', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 10000 },
  { actionType: 'evening_complete', displayName: 'Итоги дня', track: 'path', group: 'path', pointsPerUnit: 15, maxAccruals: 16 },
  { actionType: 'point_a_complete', displayName: 'Точка А (вход)', track: 'path', group: 'path', pointsPerUnit: 20, maxAccruals: 1 },
  { actionType: 'point_b_complete', displayName: 'Точка Б (выход)', track: 'path', group: 'path', pointsPerUnit: 30, maxAccruals: 1 },
  { actionType: 'exchange_question', displayName: 'Вопрос в «Общении»', track: 'path', group: 'path', pointsPerUnit: 3, maxAccruals: 30 },
  { actionType: 'exchange_answer', displayName: 'Ответ участнику в «Общении»', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 50 },
  { actionType: 'attendance', displayName: 'Посещение события программы', track: 'path', group: 'path', pointsPerUnit: 5, maxAccruals: 40 },
  { actionType: 'day_complete_bonus', displayName: 'Бонус за полный день (все точки)', track: 'path', group: 'path', pointsPerUnit: 20, maxAccruals: 8 },
  { actionType: 'reflection_streak_7', displayName: 'Бонус за регулярность 7 дней', track: 'path', group: 'path', pointsPerUnit: 50, maxAccruals: 1 },

  { actionType: 'task_complete', displayName: 'Выполнение задания (дефолт)', track: 'experience', group: 'experience', pointsPerUnit: 20, maxAccruals: 100 },

  { actionType: 'piggybank_idea', displayName: 'Копилка: идея', track: 'path', group: 'piggybank', pointsPerUnit: 5, maxAccruals: 50 },
  { actionType: 'piggybank_thought', displayName: 'Копилка: мысль', track: 'path', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 50 },
  { actionType: 'piggybank_question', displayName: 'Копилка: вопрос', track: 'path', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 50 },
  { actionType: 'piggybank_entry', displayName: 'Копилка: запись (прочее)', track: 'experience', group: 'piggybank', pointsPerUnit: 3, maxAccruals: 100 },

  { actionType: 'bonus_regularity', displayName: 'Бонус регулярности (6+ дней)', track: 'bonus', group: 'bonus', pointsPerUnit: 25, maxAccruals: 1 },
  { actionType: 'bonus_diversity', displayName: 'Бонус разнообразия заданий', track: 'bonus', group: 'bonus', pointsPerUnit: 25, maxAccruals: 1 },

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
