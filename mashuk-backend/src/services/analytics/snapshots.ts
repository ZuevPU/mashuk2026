import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { analyticsSnapshots } from '../../db/schema.js';

export async function saveSnapshot(
  key: string,
  payload: unknown,
  meta?: { dayNumber?: number; direction?: string; groupName?: string; roleKey?: string },
): Promise<void> {
  await db.insert(analyticsSnapshots).values({
    snapshotKey: key,
    dayNumber: meta?.dayNumber ?? null,
    direction: meta?.direction ?? null,
    groupName: meta?.groupName ?? null,
    roleKey: meta?.roleKey ?? null,
    payload,
  });
}

export async function loadLatestSnapshot(key: string) {
  const rows = await db.select().from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.snapshotKey, key))
    .orderBy(desc(analyticsSnapshots.id))
    .limit(1);
  return rows[0]?.payload ?? null;
}
