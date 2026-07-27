import type { tasks } from '../db/schema.js';

export function effectiveTaskPoints(task: Pick<typeof tasks.$inferSelect, 'points' | 'medalTask'>): number {
  const base = task.points ?? 0;
  if (task.medalTask) return base * 2;
  return base;
}
