import { and, eq, gte, isNotNull, lte, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, events, pushLog, pushQueue, pushTemplates, questions,
} from '../db/schema.js';
import { getMoscowParts } from './timePhase.js';
import { pushCopy } from './pushCopy.js';
import { notifyAllParticipants, sendPushNotification } from './pushService.js';
import { runTouchpointPushPlanner } from './touchpointPushPlanner.js';
import {
  filterUnsentParticipantIds,
  resolveBroadcastParticipantIds,
} from './pushAudienceResolve.js';
import { listLiveShifts } from './shiftService.js';
import { getForumSettings } from './helpers.js';

/** Слоты авто-push по ТЗ (минуты от полуночи МСК) */
export const PUSH_SLOTS: { minutes: number; key: string; text: string; retryText: string }[] = [
  { minutes: 8 * 60, key: 'slot_0800', ...pushCopy.slots.slot_0800 },
  { minutes: 13 * 60, key: 'slot_1300', ...pushCopy.slots.slot_1300 },
  { minutes: 16 * 60, key: 'slot_1600', ...pushCopy.slots.slot_1600 },
  { minutes: 18 * 60 + 30, key: 'slot_1830', ...pushCopy.slots.slot_1830 },
  { minutes: 22 * 60, key: 'slot_2200', ...pushCopy.slots.slot_2200 },
  { minutes: 23 * 60, key: 'slot_2300', ...pushCopy.slots.slot_2300 },
];

export function matchPushSlot(totalMinutes: number): typeof PUSH_SLOTS[0] | null {
  return PUSH_SLOTS.find(s => s.minutes === totalMinutes) ?? null;
}

export function matchRetrySlot(totalMinutes: number): typeof PUSH_SLOTS[0] | null {
  return PUSH_SLOTS.find(s => s.retryText && s.minutes + 30 === totalMinutes) ?? null;
}

/** Участники, уже получившие trigger сегодня (для per-participant idempotency). */
export async function participantIdsSentTriggerToday(
  triggerType: string,
  since: Date,
): Promise<Set<number>> {
  const rows = await db.select({ participantId: pushLog.participantId }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      gte(pushLog.sentAt, since),
      isNotNull(pushLog.participantId),
    ));
  return new Set(rows.map(r => r.participantId!).filter((id): id is number => id != null));
}

function startOfMoscowDay(now: Date): Date {
  const { dateKey } = getMoscowParts(now);
  return new Date(`${dateKey}T00:00:00+03:00`);
}

async function resolveSlotText(slotKey: string, fallback: string): Promise<string> {
  try {
    const [tpl] = await db.select().from(pushTemplates)
      .where(and(eq(pushTemplates.slotKey, slotKey), eq(pushTemplates.isActive, true)))
      .limit(1);
    if (tpl?.body) return tpl.body;
  } catch {
    // table may not exist yet
  }
  return fallback;
}

async function processPushQueue(now: Date): Promise<number> {
  try {
    const pending = await db.select().from(pushQueue)
      .where(and(eq(pushQueue.status, 'pending'), lte(pushQueue.scheduledAt, now)))
      .orderBy(asc(pushQueue.scheduledAt))
      .limit(20);
    let n = 0;
    for (const item of pending) {
      if (item.target === 'ids' && Array.isArray(item.participantIds)) {
        await sendPushNotification(item.participantIds as number[], item.text, `queue_${item.id}`);
      } else {
        await notifyAllParticipants(item.text, `queue_${item.id}`);
      }
      await db.update(pushQueue)
        .set({ status: 'sent', sentAt: now })
        .where(eq(pushQueue.id, item.id));
      n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

async function sendSlotToUnsent(
  trigger: string,
  text: string,
  dayStart: Date,
  audienceIds?: number[],
): Promise<boolean> {
  const allIds = audienceIds ?? await resolveBroadcastParticipantIds();
  const already = await participantIdsSentTriggerToday(trigger, dayStart);
  const need = filterUnsentParticipantIds(allIds, already);
  if (need.length === 0) return false;
  await sendPushNotification(need, text, trigger);
  return true;
}

export async function runPushSchedulerTick(now = new Date()): Promise<{ slots: string[]; events: number; queue: number; delayed: number }> {
  const { totalMinutes } = getMoscowParts(now);
  const dayStart = startOfMoscowDay(now);
  const fired: string[] = [];

  const queue = await processPushQueue(now);

  let adminScheduled = 0;
  try {
    const { processScheduledAdminPush } = await import('./pushCampaignExecutor.js');
    adminScheduled = await processScheduledAdminPush(now);
  } catch {
    // migration pending
  }
  void adminScheduled;

  try {
    const { runProgramEventBeforeTriggers } = await import('./pushTriggerRunner.js');
    await runProgramEventBeforeTriggers(now);
  } catch {
    // migration pending
  }

  try {
    const { expireStaleTeamSubmissions } = await import('./teamTaskService.js');
    await expireStaleTeamSubmissions(now);
  } catch {
    // table may not exist pre-migration
  }

  const slot = matchPushSlot(totalMinutes);
  const liveShifts = await listLiveShifts();
  let eventCount = 0;

  for (const shift of liveShifts) {
    const settings = await getForumSettings(shift.id);
    const nightEnabled = settings.pushNightSlotEnabled === true;
    const audienceIds = await resolveBroadcastParticipantIds(shift.id);

    if (slot) {
      if (slot.key === 'slot_2300' && !nightEnabled) {
        // optional night slot
      } else {
        const trigger = `auto_${slot.key}`;
        const text = await resolveSlotText(slot.key, slot.text);
        if (await sendSlotToUnsent(trigger, text, dayStart, audienceIds)) {
          fired.push(`${trigger}:shift${shift.id}`);
        }
      }
    }

    const retry = matchRetrySlot(totalMinutes);
    if (retry) {
      const trigger = `auto_retry_${retry.key}`;
      const currentDay = settings.currentDay ?? 1;
      const dayQs = await db.select().from(questions)
        .where(and(
          eq(questions.status, 'published'),
          eq(questions.dayNumber, currentDay),
          eq(questions.shiftId, shift.id),
        ));
      if (dayQs.length > 0) {
        const already = await participantIdsSentTriggerToday(trigger, dayStart);
        const candidates = filterUnsentParticipantIds(audienceIds, already);
        const needRemind: number[] = [];
        for (const pid of candidates) {
          const ansQ = await db.select({ questionId: answers.questionId }).from(answers)
            .where(eq(answers.participantId, pid));
          const qAnswered = new Set(ansQ.map(a => a.questionId));
          if (dayQs.some(q => !qAnswered.has(q.id))) needRemind.push(pid);
        }
        if (needRemind.length > 0 && retry.retryText) {
          const text = await resolveSlotText(`${retry.key}_retry`, retry.retryText);
          await sendPushNotification(needRemind, text, trigger);
          fired.push(`${trigger}:shift${shift.id}`);
        }
      }
    }

    const in10 = new Date(now.getTime() + 10 * 60 * 1000);
    const in15 = new Date(now.getTime() + 15 * 60 * 1000);
    const pushBlockTypes = (settings.pushBlockTypes as Record<string, boolean> | null) ?? {};

    const upcoming = await db.select().from(events)
      .where(and(
        eq(events.isPublished, true),
        eq(events.dayPublished, true),
        eq(events.pushReminder, true),
        eq(events.shiftId, shift.id),
        isNotNull(events.startTime),
        gte(events.startTime, in10),
        lte(events.startTime, in15),
      ));

    const shouldRemindEvent = (ev: typeof upcoming[0]) => {
      if (ev.isKeyBlock || ev.blockType === 'key_block') return true;
      const t = ev.blockType || 'session';
      if (pushBlockTypes[t] === true) return true;
      if (pushBlockTypes[t] === false) return false;
      return false;
    };

    for (const ev of upcoming) {
      if (!shouldRemindEvent(ev)) continue;
      const trigger = `event_reminder_${ev.id}_${getMoscowParts(now).dateKey}`;
      const text = pushCopy.eventSoon(ev.title, ev.place);
      if (await sendSlotToUnsent(trigger, text, dayStart, audienceIds)) {
        eventCount += 1;
        fired.push(trigger);
      }
    }
  }

  try {
    const tpFired = await runTouchpointPushPlanner(now);
    fired.push(...tpFired.slice(0, 5));
  } catch (err) {
    console.error('touchpointPushPlanner:', err);
  }

  let delayed = 0;
  try {
    const { processDueDelayedSurveys } = await import('./exports/delayedMeasureService.js');
    delayed = await processDueDelayedSurveys(now);
  } catch {
    delayed = 0;
  }

  return { slots: fired, events: eventCount, queue, delayed };
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastMinuteKey = '';

export function startPushScheduler(): void {
  if (timer) return;
  console.log('Push scheduler started (1 min tick, MSK slots)');
  timer = setInterval(() => {
    void (async () => {
      try {
        const now = new Date();
        const { hours, minutes } = getMoscowParts(now);
        const key = `${hours}:${minutes}`;
        if (key === lastMinuteKey) return;
        lastMinuteKey = key;
        const result = await runPushSchedulerTick(now);
        if (result.slots.length > 0 || result.queue > 0) {
          console.log('Push scheduler fired:', result.slots.join(', '), `queue=${result.queue}`);
        }
      } catch (err) {
        console.error('Push scheduler error:', err);
      }
    })();
  }, 20_000);
}

export function stopPushScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
