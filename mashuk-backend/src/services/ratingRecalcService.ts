import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, ratingRecalcRuns } from '../db/schema.js';
import { pointsTrackForAction } from './pointsService.js';

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

export async function recalculateAllParticipantTotals(adminId?: number): Promise<{
  runId: number;
  participantsProcessed: number;
}> {
  const [run] = await db.insert(ratingRecalcRuns).values({
    adminId: adminId ?? null,
    status: 'running',
  }).returning();

  try {
    const allParticipants = await db.select({ id: participants.id }).from(participants);
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

    return { runId: run.id, participantsProcessed: processed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(ratingRecalcRuns)
      .set({ status: 'failed', finishedAt: new Date(), error: msg })
      .where(eq(ratingRecalcRuns.id, run.id));
    throw e;
  }
}
