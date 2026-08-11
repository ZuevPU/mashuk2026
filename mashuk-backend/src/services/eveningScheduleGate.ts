import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduleDays } from '../db/schema.js';
import { resolveActiveShiftId } from './shiftService.js';

/**
 * Whether the schedule/program day is live for participants.
 * Missing row → null (no gate; keep legacy behaviour).
 * Explicit isPublished=false → hide evening survey with that day.
 */
export async function getScheduleDayPublished(
  dayNumber: number,
  shiftId?: number,
): Promise<boolean | null> {
  const sid = shiftId ?? await resolveActiveShiftId();
  const [row] = await db.select({
    isPublished: scheduleDays.isPublished,
  })
    .from(scheduleDays)
    .where(and(
      eq(scheduleDays.shiftId, sid),
      eq(scheduleDays.dayNumber, dayNumber),
    ))
    .limit(1);
  if (!row) return null;
  return !!row.isPublished;
}
