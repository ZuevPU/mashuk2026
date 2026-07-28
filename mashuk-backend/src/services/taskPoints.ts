import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { tasks } from '../db/schema.js';
import { levelsConfig } from '../db/schema.js';
import { taskCategoryActionType } from './levelsActionCatalog.js';

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
    const [catCfg] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, catType)).limit(1);
    if (catCfg?.pointsPerUnit && catCfg.pointsPerUnit > 0) {
      return task.medalTask ? catCfg.pointsPerUnit * 2 : catCfg.pointsPerUnit;
    }
  }

  const [defCfg] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, 'task_complete')).limit(1);
  const base = defCfg?.pointsPerUnit ?? 0;
  if (base <= 0) return 0;
  return task.medalTask ? base * 2 : base;
}
