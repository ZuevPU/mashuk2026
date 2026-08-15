import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, ratingRecalcRuns } from '../db/schema.js';
import { pointsTrackForAction } from './pointsService.js';
import { getForumSettings } from './helpers.js';
import { inferForumDayFromTimestamp } from './timePhase.js';

export function normalizeLevelThresholds(raw: unknown): number[] {
  const fallback = [0, 100, 250, 500, 1000];
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  if (typeof raw[0] === 'number') {
    return [...(raw as number[])].sort((a, b) => a - b);
  }
  return (raw as { from?: number }[])
    .map(t => Number(t.from))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export async function backfillMissingForumDays(shiftId?: number | null): Promise<number> {
  const rows = await db.select({
    id: pointsLog.id,
    createdAt: pointsLog.createdAt,
    shiftId: participants.shiftId,
  }).from(pointsLog)
    .innerJoin(participants, eq(pointsLog.participantId, participants.id))
    .where(shiftId != null
      ? and(isNull(pointsLog.forumDay), eq(participants.shiftId, shiftId))
      : isNull(pointsLog.forumDay));

  const settingsByShift = new Map<number, { startDate: Date | null; totalDays: number }>();
  let updated = 0;
  for (const row of rows) {
    const sid = row.shiftId;
    if (sid == null) continue;
    let cal = settingsByShift.get(sid);
    if (!cal) {
      const settings = await getForumSettings(sid);
      const startDate = settings.startDate ? new Date(settings.startDate) : null;
      cal = {
        startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
        totalDays: Number(settings.totalDays) || 8,
      };
      settingsByShift.set(sid, cal);
    }
    if (!cal.startDate) continue;
    const day = inferForumDayFromTimestamp(row.createdAt ?? new Date(), cal.startDate, cal.totalDays);
    if (day == null) continue;
    await db.update(pointsLog).set({ forumDay: day }).where(eq(pointsLog.id, row.id));
    updated += 1;
  }
  return updated;
}

export async function recalculateAllParticipantTotals(adminId?: number, shiftId?: number | null): Promise<{
  runId: number;
  participantsProcessed: number;
  bonuses?: {
    dayCompleteAwarded: number;
    regularityAwarded: number;
    dayCompleteAmountFixed: number;
    regularityAmountFixed: number;
  };
}> {
  const [run] = await db.insert(ratingRecalcRuns).values({
    adminId: adminId ?? null,
    status: 'running',
  }).returning();

  try {
    await backfillMissingForumDays(shiftId);
    // Сначала доначислить бонусы «полный день» / «регулярность», выровнять тарифы
    const { backfillRatingBonusesForAll } = await import('./ratingBonusesService.js');
    const bonusResult = await backfillRatingBonusesForAll(shiftId);

    const allParticipants = shiftId != null
      ? await db.select({ id: participants.id }).from(participants).where(eq(participants.shiftId, shiftId))
      : await db.select({ id: participants.id }).from(participants);
    let processed = 0;
    for (const { id } of allParticipants) {
      const rows = await db.select({
        actionType: pointsLog.actionType,
        points: pointsLog.points,
      }).from(pointsLog).where(and(
        eq(pointsLog.participantId, id),
        isNull(pointsLog.revokedAt),
      ));

      let path = 0;
      let experience = 0;
      let bonus = 0;
      for (const r of rows) {
        // Originals with revokedAt are already filtered out; skip reversal rows too.
        if ((r.actionType || '').endsWith('_revoke')) continue;
        const track = pointsTrackForAction(r.actionType || '');
        if (track === 'path') path += r.points;
        else if (track === 'bonus') bonus += r.points;
        else experience += r.points;
      }

      await db.update(participants)
        .set({
          pathPoints: Math.max(0, path),
          experiencePoints: Math.max(0, experience),
          bonusPoints: Math.max(0, bonus),
          forumPoints: Math.max(0, path + experience + bonus),
        })
        .where(eq(participants.id, id));
      processed += 1;
    }

    await db.update(ratingRecalcRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        participantsProcessed: processed,
      })
      .where(eq(ratingRecalcRuns.id, run.id));

    return {
      runId: run.id,
      participantsProcessed: processed,
      bonuses: {
        dayCompleteAwarded: bonusResult.dayCompleteAwarded,
        regularityAwarded: bonusResult.regularityAwarded,
        dayCompleteAmountFixed: bonusResult.dayCompleteAmountFixed,
        regularityAmountFixed: bonusResult.regularityAmountFixed,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(ratingRecalcRuns)
      .set({ status: 'failed', finishedAt: new Date(), error: msg })
      .where(eq(ratingRecalcRuns.id, run.id));
    throw e;
  }
}
