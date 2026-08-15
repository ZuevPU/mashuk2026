import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, pushLog, questions } from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import {
  autoNotifyTouchpointIfLive,
  isAutoNotifyTouchpointQuestion,
  isQuestionLiveNow,
  resolveQuestionNotifyAudience,
  startOfMoscowDay,
  touchpointOpenTrigger,
} from './questionAutoNotify.js';
import { getQuestionAccess } from './questionEligibility.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { listLiveShifts } from './shiftService.js';

const RETRY_MS = 30 * 60 * 1000;
const OPEN_CATCHUP_MS = 2 * 60 * 60 * 1000; // до 2 ч после publishTime — догоняем пропуск тика
const RETRY_WINDOW_MS = 3 * 60 * 1000;

async function sentTriggerSince(triggerType: string, participantId: number, since: Date): Promise<boolean> {
  const [row] = await db.select({ id: pushLog.id }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      eq(pushLog.participantId, participantId),
      gte(pushLog.sentAt, since),
    )).limit(1);
  return !!row;
}

function questionWindowStart(q: typeof questions.$inferSelect): Date | null {
  if (q.publishTime) return q.publishTime;
  return null;
}

/** Окно «только что открылось» или догонялка в пределах 2 часов. */
function needsOpenNotify(q: typeof questions.$inferSelect, now: Date): boolean {
  if (!isQuestionLiveNow(q, now)) return false;
  const start = questionWindowStart(q);
  if (!start) return true;
  const age = now.getTime() - start.getTime();
  return age >= 0 && age < OPEN_CATCHUP_MS;
}

function isRetryWindow(q: typeof questions.$inferSelect, now: Date): boolean {
  const start = questionWindowStart(q);
  if (!start) return false;
  const retryAt = start.getTime() + RETRY_MS;
  const t = now.getTime();
  return t >= retryAt && t < retryAt + RETRY_WINDOW_MS;
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

async function loadDayTouchpointsForNotify(currentDay: number, shiftId: number | null) {
  const list = shiftId != null
    ? await db.select().from(questions).where(and(
      eq(questions.status, 'published'),
      eq(questions.shiftId, shiftId),
    ))
    : await db.select().from(questions).where(eq(questions.status, 'published'));

  return list.filter(q =>
    isAutoNotifyTouchpointQuestion(q)
    && questionMatchesDay(q, currentDay),
  );
}

/**
 * Push при открытии окна точки (publishTime) + retry +30 мин.
 * Открытие — пакетно аудитории вопроса (мини-апп + сообщество), с догонялкой до 2 ч.
 */
async function runTouchpointPushPlannerForShift(
  shiftId: number,
  now: Date,
  dayStart: Date,
): Promise<string[]> {
  const settings = await getForumSettings(shiftId);
  const currentDay = resolveEffectiveCurrentDay(settings, now);
  if (currentDay < 1 || currentDay > 7) return [];

  const dayTouch = await loadDayTouchpointsForNotify(currentDay, shiftId);
  if (dayTouch.length === 0) return [];

  const fired: string[] = [];

  for (const q of dayTouch) {
    const slot = TOUCHPOINT_SLOTS.find(s => s.title === q.title);
    const label = slot?.title || q.title;
    const openTrigger = touchpointOpenTrigger(q.id);
    const retryTrigger = `touchpoint_retry_${q.id}`;

    if (needsOpenNotify(q, now)) {
      const result = await autoNotifyTouchpointIfLive(q, now);
      if (result.sentTo > 0) fired.push(`${openTrigger}:batch:${result.sentTo}`);
    }

    if (!isRetryWindow(q, now)) continue;

    const audienceIds = await resolveQuestionNotifyAudience(q);
    for (const participantId of audienceIds) {
      const [ans] = await db.select({ id: answers.id }).from(answers)
        .where(and(eq(answers.participantId, participantId), eq(answers.questionId, q.id))).limit(1);
      if (!isQuestionOpenForParticipant(q, currentDay, now, !!ans)) continue;
      if (await sentTriggerSince(retryTrigger, participantId, dayStart)) continue;
      await sendPushNotification(
        [participantId],
        pushCopy.touchpointReminder(label),
        retryTrigger,
        { appLinkHash: `#/questions?q=${q.id}` },
      );
      fired.push(`${retryTrigger}:${participantId}`);
    }
  }

  return fired;
}

export async function runTouchpointPushPlanner(now = new Date()): Promise<string[]> {
  const dayStart = startOfMoscowDay(now);
  const live = await listLiveShifts();
  const fired: string[] = [];
  for (const shift of live) {
    fired.push(...await runTouchpointPushPlannerForShift(shift.id, now, dayStart));
  }
  return fired;
}

export { sentTriggerGlobalSince, startOfMoscowDay } from './questionAutoNotify.js';
