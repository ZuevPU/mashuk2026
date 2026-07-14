import { and, eq, gte, isNotNull, lte, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, events, forumSettings, participants, pushLog, pushQueue, pushTemplates, questions,
} from '../db/schema.js';
import { getMoscowParts } from './timePhase.js';
import { notifyAllParticipants, sendPushNotification } from './pushService.js';

/** Слоты авто-push по ТЗ (минуты от полуночи МСК) */
export const PUSH_SLOTS: { minutes: number; key: string; text: string; retryText: string }[] = [
  { minutes: 8 * 60, key: 'slot_0800', text: 'Доброе утро! 1 минута на проверку состояния', retryText: 'Напоминание: утренняя проверка состояния ещё открыта' },
  { minutes: 13 * 60, key: 'slot_1300', text: 'Две задачи дня: осмысление направления и проверка состояния', retryText: 'Напоминание: дневные точки осмысления ещё можно заполнить' },
  { minutes: 16 * 60, key: 'slot_1600', text: 'На каком уроке был? Коротко зафиксируй', retryText: 'Напоминание: рефлексия после урока ещё открыта' },
  { minutes: 18 * 60 + 30, key: 'slot_1830', text: 'Вечерняя проверка состояния и осмысление', retryText: 'Напоминание: вечерние точки ещё можно заполнить' },
  { minutes: 22 * 60, key: 'slot_2200', text: 'Финал дня — оцени и поделись', retryText: 'Напоминание: итоговая анкета дня ещё открыта до полуночи' },
  { minutes: 23 * 60, key: 'slot_2300', text: 'Спокойной ночи! Если остались мысли — запиши в копилку', retryText: '' },
];

export function matchPushSlot(totalMinutes: number): typeof PUSH_SLOTS[0] | null {
  return PUSH_SLOTS.find(s => s.minutes === totalMinutes) ?? null;
}

export function matchRetrySlot(totalMinutes: number): typeof PUSH_SLOTS[0] | null {
  return PUSH_SLOTS.find(s => s.retryText && s.minutes + 30 === totalMinutes) ?? null;
}

async function alreadySentToday(triggerType: string, since: Date): Promise<boolean> {
  const rows = await db.select({ id: pushLog.id }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      gte(pushLog.sentAt, since),
    ))
    .limit(1);
  return rows.length > 0;
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

export async function runPushSchedulerTick(now = new Date()): Promise<{ slots: string[]; events: number; queue: number }> {
  const { totalMinutes } = getMoscowParts(now);
  const dayStart = startOfMoscowDay(now);
  const fired: string[] = [];

  const queue = await processPushQueue(now);

  const slot = matchPushSlot(totalMinutes);
  if (slot) {
    const trigger = `auto_${slot.key}`;
    if (!(await alreadySentToday(trigger, dayStart))) {
      const text = await resolveSlotText(slot.key, slot.text);
      await notifyAllParticipants(text, trigger);
      fired.push(trigger);
    }
  }

  const retry = matchRetrySlot(totalMinutes);
  if (retry) {
    const trigger = `auto_retry_${retry.key}`;
    if (!(await alreadySentToday(trigger, dayStart))) {
      const [settings] = await db.select().from(forumSettings).limit(1);
      const currentDay = settings?.currentDay ?? 1;
      const dayQs = await db.select().from(questions)
        .where(and(eq(questions.status, 'published'), eq(questions.dayNumber, currentDay)));
      if (dayQs.length > 0) {
        const allP = await db.select({ id: participants.id }).from(participants)
          .where(isNotNull(participants.onboardingCompletedAt));
        const needRemind: number[] = [];
        for (const p of allP) {
          const ansQ = await db.select({ questionId: answers.questionId }).from(answers)
            .where(eq(answers.participantId, p.id));
          const qAnswered = new Set(ansQ.map(a => a.questionId));
          if (dayQs.some(q => !qAnswered.has(q.id))) needRemind.push(p.id);
        }
        if (needRemind.length > 0 && retry.retryText) {
          const text = await resolveSlotText(`${retry.key}_retry`, retry.retryText);
          await sendPushNotification(needRemind, text, trigger);
          fired.push(trigger);
        }
      }
    }
  }

  const in10 = new Date(now.getTime() + 10 * 60 * 1000);
  const in15 = new Date(now.getTime() + 15 * 60 * 1000);
  const upcoming = await db.select().from(events)
    .where(and(
      eq(events.isPublished, true),
      eq(events.pushReminder, true),
      isNotNull(events.startTime),
      gte(events.startTime, in10),
      lte(events.startTime, in15),
    ));

  let eventCount = 0;
  for (const ev of upcoming) {
    const trigger = `event_reminder_${ev.id}_${getMoscowParts(now).dateKey}`;
    if (await alreadySentToday(trigger, dayStart)) continue;
    await notifyAllParticipants(
      `Скоро: «${ev.title}»${ev.place ? ` · ${ev.place}` : ''} · через ~15 мин`,
      trigger,
    );
    eventCount += 1;
    fired.push(trigger);
  }

  return { slots: fired, events: eventCount, queue };
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
