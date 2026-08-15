import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduleDays } from '../db/schema.js';

/**
 * Whether the schedule/program day is live for participants.
 * Missing row or missing shiftId → null (no gate; do not guess active shift).
 * Explicit isPublished=false → hide evening survey with that day.
 */
export async function getScheduleDayPublished(
  dayNumber: number,
  shiftId?: number | null,
): Promise<boolean | null> {
  if (shiftId == null || !Number.isFinite(shiftId)) return null;
  const [row] = await db.select({
    isPublished: scheduleDays.isPublished,
  })
    .from(scheduleDays)
    .where(and(
      eq(scheduleDays.shiftId, shiftId),
      eq(scheduleDays.dayNumber, dayNumber),
    ))
    .limit(1);
  if (!row) return null;
  return !!row.isPublished;
}
