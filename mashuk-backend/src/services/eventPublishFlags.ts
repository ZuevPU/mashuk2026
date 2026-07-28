import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduleDays } from '../db/schema.js';

/** When an event is marked published, align day_published with schedule_days if the day is already live. */
export async function resolveDayPublishedForEvent(
  dayNumber: number | null | undefined,
  isPublished: boolean | undefined,
  explicitDayPublished?: boolean | null,
): Promise<boolean | undefined> {
  if (explicitDayPublished !== undefined && explicitDayPublished !== null) {
    return explicitDayPublished;
  }
  if (isPublished !== true || dayNumber == null) return undefined;
  const [sd] = await db.select().from(scheduleDays).where(eq(scheduleDays.dayNumber, dayNumber)).limit(1);
  return sd?.isPublished === true;
}
