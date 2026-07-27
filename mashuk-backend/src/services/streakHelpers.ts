import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { piggybank, pointsLog } from '../db/schema.js';

const PATH_ACTIVITY_ACTIONS = new Set([
  'question_answer',
  'evening_complete',
  'state_check_morning',
  'state_check_day',
  'state_check_evening',
  'point_a_complete',
  'point_b_complete',
  'exchange_question',
  'exchange_answer',
  'day_complete_bonus',
]);

export function longestConsecutiveRun(days: number[]): number {
  if (days.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else if (days[i] !== days[i - 1]) {
      cur = 1;
    }
  }
  return best;
}

export async function reflectionForumDays(participantId: number): Promise<number[]> {
  const rows = await db.select({ forumDay: pointsLog.forumDay, actionType: pointsLog.actionType })
    .from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.forumDay} IS NOT NULL`,
    ));
  const days = new Set<number>();
  for (const r of rows) {
    if (r.forumDay != null && r.actionType && PATH_ACTIVITY_ACTIONS.has(r.actionType)) {
      days.add(r.forumDay);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export async function piggybankForumDays(participantId: number): Promise<number[]> {
  const rows = await db.select({ forumDay: piggybank.forumDay })
    .from(piggybank)
    .where(and(
      eq(piggybank.participantId, participantId),
      isNull(piggybank.deletedAt),
    ));
  const days = new Set<number>();
  for (const r of rows) {
    if (r.forumDay != null) days.add(r.forumDay);
  }
  return [...days].sort((a, b) => a - b);
}

export async function reflectionStreak(participantId: number): Promise<number> {
  return longestConsecutiveRun(await reflectionForumDays(participantId));
}

export async function piggybankStreak(participantId: number): Promise<number> {
  return longestConsecutiveRun(await piggybankForumDays(participantId));
}
