import { and, count, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { delayedSurvey, participants, pushQueue } from '../../db/schema.js';
import { resolveActiveShift } from '../shiftService.js';
import { fullName, formatTs } from './exportCommon.js';

const DEFAULT_WEEKS_AFTER_SHIFT = 7;

export function computeShiftEndDate(startDate: Date | null | undefined, totalDays: number | null | undefined): Date | null {
  if (!startDate) return null;
  const days = Math.max(1, totalDays ?? 8);
  const end = new Date(startDate.getTime());
  end.setUTCDate(end.getUTCDate() + (days - 1));
  return end;
}

export function computeMeasureDate(
  startDate: Date | null | undefined,
  totalDays: number | null | undefined,
  weeksAfter = DEFAULT_WEEKS_AFTER_SHIFT,
): Date {
  const end = computeShiftEndDate(startDate, totalDays);
  const base = end ?? new Date();
  const measure = new Date(base.getTime());
  measure.setUTCDate(measure.getUTCDate() + weeksAfter * 7);
  return measure;
}

export async function buildDelayedMeasureRows(weeksAfter = DEFAULT_WEEKS_AFTER_SHIFT) {
  const shift = await resolveActiveShift();
  const measureDate = computeMeasureDate(shift?.startDate ?? null, shift?.totalDays ?? 8, weeksAfter);
  const conditions = [
    isNull(participants.selfDeletedAt),
    isNotNull(participants.onboardingCompletedAt),
  ];
  if (shift?.id != null) {
    conditions.push(eq(participants.shiftId, shift.id));
  }
  const list = await db.select().from(participants).where(and(...conditions));
  return {
    measureDate,
    shiftId: shift?.id ?? null,
    rows: list.map(p => ({
      participant_id: p.id,
      full_name: fullName(p),
      measure_date: formatTs(measureDate).slice(0, 10),
      notes: '',
    })),
  };
}

export async function scheduleDelayedSurveyFromShiftEnd(opts: {
  weeksAfter?: number;
  adminId?: number | null;
} = {}) {
  const weeksAfter = opts.weeksAfter ?? DEFAULT_WEEKS_AFTER_SHIFT;
  const built = await buildDelayedMeasureRows(weeksAfter);
  const scheduledAt = built.measureDate;
  let n = 0;
  for (const row of built.rows) {
    await db.insert(delayedSurvey).values({
      participantId: row.participant_id,
      scheduledAt,
      status: 'pending',
      payload: {
        type: 'post_forum_6_8_weeks',
        shiftId: built.shiftId,
        measureDate: row.measure_date,
      },
    });
    n += 1;
  }
  return { scheduled: n, scheduledAt, shiftId: built.shiftId };
}

export async function getDelayedSurveyStatus() {
  const rows = await db.select({
    status: delayedSurvey.status,
    n: count(),
  }).from(delayedSurvey).groupBy(delayedSurvey.status);
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status ?? 'unknown'] = Number(r.n);
  }
  return { byStatus };
}

/** Due pending surveys → push_queue + mark sent. */
export async function processDueDelayedSurveys(now = new Date()): Promise<number> {
  const due = await db.select().from(delayedSurvey)
    .where(and(
      eq(delayedSurvey.status, 'pending'),
      lte(delayedSurvey.scheduledAt, now),
    ))
    .limit(50);
  let n = 0;
  for (const row of due) {
    const text = 'Прошло несколько недель после форума. Короткий опрос поможет понять, что осталось с вами — откройте мини-приложение.';
    await db.insert(pushQueue).values({
      text,
      scheduledAt: now,
      status: 'pending',
      target: 'ids',
      participantIds: [row.participantId],
      createdByAdminId: null,
    });
    await db.update(delayedSurvey).set({
      status: 'sent',
      sentAt: now,
    }).where(eq(delayedSurvey.id, row.id));
    n += 1;
  }
  return n;
}
