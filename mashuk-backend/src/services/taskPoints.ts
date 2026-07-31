import { eq, and, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { tasks } from '../db/schema.js';
import { levelsConfig } from '../db/schema.js';
import { taskCategoryActionType } from './levelsActionCatalog.js';
import { resolveActiveShiftId } from './shiftService.js';

async function loadLevelConfig(actionType: string) {
  const shiftId = await resolveActiveShiftId();
  const [row] = await db.select().from(levelsConfig).where(and(
    eq(levelsConfig.actionType, actionType),
    or(isNull(levelsConfig.shiftId), eq(levelsConfig.shiftId, shiftId)),
  )).limit(1);
  return row;
}

export function effectiveTaskPoints(task: Pick<typeof tasks.$inferSelect, 'points' | 'medalTask'>): number {
  const base = task.points ?? 0;
  if (task.medalTask) return base * 2;
  return base;
}

/** Task card points, or category / global default from levels_config when points not set. */
export async function resolveTaskAwardPoints(
  task: Pick<typeof tasks.$inferSelect, 'points' | 'medalTask' | 'category'>,
): Promise<number> {
  const fromTask = effectiveTaskPoints(task);
  if (fromTask > 0) return fromTask;

  const category = task.category?.trim();
  if (category) {
    const catType = taskCategoryActionType(category);
    const catCfg = await loadLevelConfig(catType);
    if (catCfg?.pointsPerUnit && catCfg.pointsPerUnit > 0) {
      return task.medalTask ? catCfg.pointsPerUnit * 2 : catCfg.pointsPerUnit;
    }
  }

  const defCfg = await loadLevelConfig('task_complete');
  const base = defCfg?.pointsPerUnit ?? 0;
  if (base <= 0) return 0;
  return task.medalTask ? base * 2 : base;
}
