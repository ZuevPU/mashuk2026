import type { tasks } from '../db/schema.js';
import { taskCategoryActionType } from './levelsActionCatalog.js';
import { loadLevelsConfig } from './shiftContext.js';

/** Баллы с карточки задания. Медаль — отдельная награда, не удваивает XP. */
export function effectiveTaskPoints(task: Pick<typeof tasks.$inferSelect, 'points'> & { medalTask?: boolean | null }): number {
  return task.points ?? 0;
}

/** Task card points, or category / global default from levels_config when points not set. */
export async function resolveTaskAwardPoints(
  task: Pick<typeof tasks.$inferSelect, 'points' | 'medalTask' | 'category' | 'shiftId'>,
): Promise<number> {
  const fromTask = effectiveTaskPoints(task);
  if (fromTask > 0) return fromTask;

  const category = task.category?.trim();
  if (category) {
    const catType = taskCategoryActionType(category);
    const catCfg = await loadLevelsConfig(catType, task.shiftId);
    if (catCfg?.pointsPerUnit && catCfg.pointsPerUnit > 0) {
      return catCfg.pointsPerUnit;
    }
  }

  const defCfg = await loadLevelsConfig('task_complete', task.shiftId);
  return defCfg?.pointsPerUnit && defCfg.pointsPerUnit > 0 ? defCfg.pointsPerUnit : 0;
}
