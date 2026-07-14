import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  medals, userMedals, taskSubmissions, piggybank, answers, participants,
} from '../db/schema.js';
import { sendPushNotification } from './pushService.js';
import { isNotNull } from 'drizzle-orm';

/**
 * Simple rule evaluator: tasks_completed>=N, piggybank_count>=N, answers_count>=N, path_points>=N
 */
function parseRule(rule: string | null | undefined): { metric: string; op: '>='; value: number } | null {
  if (!rule?.trim()) return null;
  const m = rule.trim().match(/^(\w+)\s*(>=)\s*(\d+)$/);
  if (!m) return null;
  return { metric: m[1], op: '>=', value: Number(m[3]) };
}

async function getMetric(participantId: number, metric: string): Promise<number> {
  switch (metric) {
    case 'tasks_completed': {
      const [r] = await db.select({ c: count() }).from(taskSubmissions)
        .where(and(eq(taskSubmissions.participantId, participantId), eq(taskSubmissions.status, 'approved')));
      return Number(r?.c ?? 0);
    }
    case 'piggybank_count': {
      const [r] = await db.select({ c: count() }).from(piggybank)
        .where(eq(piggybank.participantId, participantId));
      return Number(r?.c ?? 0);
    }
    case 'answers_count': {
      const [r] = await db.select({ c: count() }).from(answers)
        .where(eq(answers.participantId, participantId));
      return Number(r?.c ?? 0);
    }
    case 'path_points': {
      const [p] = await db.select({ pathPoints: participants.pathPoints })
        .from(participants).where(eq(participants.id, participantId)).limit(1);
      return p?.pathPoints ?? 0;
    }
    case 'experience_points': {
      const [p] = await db.select({ experiencePoints: participants.experiencePoints })
        .from(participants).where(eq(participants.id, participantId)).limit(1);
      return p?.experiencePoints ?? 0;
    }
    default:
      return 0;
  }
}

export async function evaluateMedalsForParticipant(participantId: number): Promise<number> {
  const active = await db.select().from(medals).where(eq(medals.isActive, true));
  const owned = await db.select().from(userMedals).where(eq(userMedals.participantId, participantId));
  const ownedIds = new Set(owned.map(u => u.medalId));
  let awarded = 0;

  for (const medal of active) {
    if (ownedIds.has(medal.id)) continue;
    if (medal.awardType === 'manual') continue;
    const parsed = parseRule(medal.conditionRule);
    if (!parsed) continue;
    const value = await getMetric(participantId, parsed.metric);
    if (value >= parsed.value) {
      await db.insert(userMedals).values({
        participantId,
        medalId: medal.id,
        way: 'auto',
      });
      awarded += 1;
      await sendPushNotification(
        [participantId],
        `Новая медаль: «${medal.name}»`,
        'medal_auto',
      ).catch(() => undefined);
    }
  }
  return awarded;
}

export async function evaluateAllMedals(): Promise<{ participants: number; awarded: number }> {
  const list = await db.select({ id: participants.id }).from(participants)
    .where(isNotNull(participants.onboardingCompletedAt));
  let awarded = 0;
  for (const p of list) {
    awarded += await evaluateMedalsForParticipant(p.id);
  }
  return { participants: list.length, awarded };
}
