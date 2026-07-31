import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduleDays } from '../db/schema.js';

/** When an event is marked published, align day_published with schedule_days if the day is already live. */
export async function resolveDayPublishedForEvent(
  dayNumber: number | null | undefined,
  isPublished: boolean | undefined,
  explicitDayPublished?: boolean | null,
  shiftId?: number | null,
): Promise<boolean | undefined> {
  if (explicitDayPublished !== undefined && explicitDayPublished !== null) {
    return explicitDayPublished;
  }
  if (isPublished !== true || dayNumber == null) return undefined;
  const conds = [eq(scheduleDays.dayNumber, dayNumber)];
  if (shiftId != null && !Number.isNaN(shiftId)) {
    conds.push(eq(scheduleDays.shiftId, shiftId));
  }
  const [sd] = await db.select().from(scheduleDays).where(and(...conds)).limit(1);
  return sd?.isPublished === true;
}
