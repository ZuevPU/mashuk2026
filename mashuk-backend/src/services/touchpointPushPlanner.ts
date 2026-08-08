import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, participants, pushLog, questions } from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import { getQuestionAccess } from './questionEligibility.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';
import { getMoscowParts } from './timePhase.js';
import { loadPublishedTouchpointQuestions } from './touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { resolveActiveShiftId } from './shiftService.js';

const RETRY_MS = 30 * 60 * 1000;
const OPEN_WINDOW_MS = 3 * 60 * 1000;

function startOfMoscowDay(now: Date): Date {
  const { dateKey } = getMoscowParts(now);
  return new Date(`${dateKey}T00:00:00+03:00`);
}

async function sentTriggerSince(triggerType: string, participantId: number, since: Date): Promise<boolean> {
  const [row] = await db.select({ id: pushLog.id }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      eq(pushLog.participantId, participantId),
      gte(pushLog.sentAt, since),
    )).limit(1);
  return !!row;
}

async function sentTriggerGlobalSince(triggerType: string, since: Date): Promise<boolean> {
  const [row] = await db.select({ id: pushLog.id }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      gte(pushLog.sentAt, since),
    )).limit(1);
  return !!row;
}

function questionWindowStart(q: typeof questions.$inferSelect): Date | null {
  if (q.publishTime) return q.publishTime;
  return null;
}

function isInOpenWindow(q: typeof questions.$inferSelect, now: Date): boolean {
  const start = questionWindowStart(q);
  if (!start) return false;
  const t = now.getTime();
  return t >= start.getTime() && t < start.getTime() + OPEN_WINDOW_MS;
}

function isRetryWindow(q: typeof questions.$inferSelect, now: Date): boolean {
  const start = questionWindowStart(q);
  if (!start) return false;
  const retryAt = start.getTime() + RETRY_MS;
  const t = now.getTime();
  return t >= retryAt && t < retryAt + OPEN_WINDOW_MS;
}

function isQuestionOpenForParticipant(
  q: typeof questions.$inferSelect,
  currentDay: number,
  now: Date,
  answered: boolean,
): boolean {
  if (answered) return false;
  const access = getQuestionAccess(q, currentDay, now);
  return access === 'open' || access === 'overdue';
}

/**
 * Динамические push при открытии окна точки (publishTime) и retry +30 мин.
 */
export async function runTouchpointPushPlanner(now = new Date()): Promise<string[]> {
  const settings = await getForumSettings();
  const currentDay = resolveEffectiveCurrentDay(settings, now);
  if (currentDay < 1 || currentDay > 7) return [];

  const dayStart = startOfMoscowDay(now);
  const shiftId = await resolveActiveShiftId();
  const touchQs = await loadPublishedTouchpointQuestions(currentDay, shiftId);
  const dayTouch = touchQs.filter(q => q.dayNumber === currentDay);
  if (dayTouch.length === 0) return [];

  const allP = await db.select({ id: participants.id }).from(participants)
    .where(and(isNotNull(participants.onboardingCompletedAt), isNull(participants.selfDeletedAt)));

  const fired: string[] = [];

  for (const q of dayTouch) {
    const slot = TOUCHPOINT_SLOTS.find(s => s.title === q.title);
    const label = slot?.title || q.title;
    const openTrigger = `touchpoint_open_${q.id}`;
    const retryTrigger = `touchpoint_retry_${q.id}`;

    const inOpen = isInOpenWindow(q, now);
    const inRetry = isRetryWindow(q, now);
    if (!inOpen && !inRetry) continue;

    for (const p of allP) {
      const [ans] = await db.select({ id: answers.id }).from(answers)
        .where(and(eq(answers.participantId, p.id), eq(answers.questionId, q.id))).limit(1);
      const answered = !!ans;
      if (!isQuestionOpenForParticipant(q, currentDay, now, answered)) continue;

      if (inOpen) {
        if (await sentTriggerSince(openTrigger, p.id, dayStart)) continue;
        await sendPushNotification(
          [p.id],
          pushCopy.touchpointOpen(label),
          openTrigger,
        );
        fired.push(`${openTrigger}:${p.id}`);
      } else if (inRetry) {
        if (await sentTriggerSince(openTrigger, p.id, dayStart)) {
          // only retry if we notified open OR window was missed — allow retry without open if publish was in past
        }
        if (await sentTriggerSince(retryTrigger, p.id, dayStart)) continue;
        await sendPushNotification(
          [p.id],
          pushCopy.touchpointReminder(label),
          retryTrigger,
        );
        fired.push(`${retryTrigger}:${p.id}`);
      }
    }
  }

  return fired;
}

export { sentTriggerGlobalSince, startOfMoscowDay };
