import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  medals, userMedals, taskSubmissions, piggybank, answers, participants,
  eventAttendance, exchangeAnswers,
} from '../db/schema.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';
import { isNotNull } from 'drizzle-orm';
import { medalRuleLabel } from './medalRuleMetrics.js';
import { piggybankStreak, reflectionStreak } from './streakHelpers.js';

export type ParsedMedalRule = { metric: string; op: '>='; value: number };

export function parseMedalRule(rule: string | null | undefined): ParsedMedalRule | null {
  if (!rule?.trim()) return null;
  const m = rule.trim().match(/^(\w+)\s*(>=)\s*(\d+)$/);
  if (!m) return null;
  return { metric: m[1], op: '>=', value: Number(m[3]) };
}

export async function getMedalMetricValue(participantId: number, metric: string): Promise<number> {
  switch (metric) {
    case 'tasks_completed': {
      const [r] = await db.select({ c: count() }).from(taskSubmissions)
        .where(and(eq(taskSubmissions.participantId, participantId), eq(taskSubmissions.status, 'approved')));
      return Number(r?.c ?? 0);
    }
    case 'piggybank_count': {
      const [r] = await db.select({ c: count() }).from(piggybank)
        .where(and(eq(piggybank.participantId, participantId), isNull(piggybank.deletedAt)));
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
    case 'event_attendance': {
      const [r] = await db.select({ c: count() }).from(eventAttendance)
        .where(eq(eventAttendance.participantId, participantId));
      return Number(r?.c ?? 0);
    }
    case 'reflection_streak':
      return reflectionStreak(participantId);
    case 'piggybank_streak':
      return piggybankStreak(participantId);
    case 'exchange_answers': {
      const [r] = await db.select({ c: count() }).from(exchangeAnswers)
        .where(eq(exchangeAnswers.participantId, participantId));
      return Number(r?.c ?? 0);
    }
    default:
      return 0;
  }
}

export async function getMedalRuleProgress(
  participantId: number,
  parsed: ParsedMedalRule,
): Promise<{ current: number; target: number; conditionLabel: string }> {
  const current = await getMedalMetricValue(participantId, parsed.metric);
  return {
    current,
    target: parsed.value,
    conditionLabel: medalRuleLabel(parsed.metric, parsed.value),
  };
}

export async function evaluateMedalsForParticipantDetailed(
  participantId: number,
): Promise<{ id: number; name: string }[]> {
  const [owner] = await db.select({ shiftId: participants.shiftId })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  const shiftId = owner?.shiftId ?? null;
  const active = shiftId != null
    ? await db.select().from(medals).where(and(
      eq(medals.isActive, true),
      eq(medals.shiftId, shiftId),
    ))
    : [];
  const owned = await db.select().from(userMedals).where(eq(userMedals.participantId, participantId));
  const ownedIds = new Set(owned.map(u => u.medalId));
  const newlyAwarded: { id: number; name: string }[] = [];

  for (const medal of active) {
    if (ownedIds.has(medal.id)) continue;
    if (medal.awardType === 'manual') continue;
    const parsed = parseMedalRule(medal.conditionRule);
    if (!parsed) continue;
    const value = await getMedalMetricValue(participantId, parsed.metric);
    if (value >= parsed.value) {
      await db.insert(userMedals).values({
        participantId,
        medalId: medal.id,
        way: 'auto',
      });
      newlyAwarded.push({ id: medal.id, name: medal.name });
      await sendPushNotification(
        [participantId],
        pushCopy.medalAwarded(medal.name),
        'transactional_medal',
      ).catch(() => undefined);
    }
  }
  return newlyAwarded;
}

export async function evaluateMedalsForParticipant(participantId: number): Promise<number> {
  const list = await evaluateMedalsForParticipantDetailed(participantId);
  return list.length;
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
