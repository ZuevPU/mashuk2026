/**
 * Авто-рассылка при «выходе в эфир» точек осмысления / проверок состояния:
 * мини-приложение + ЛС сообщества. Идемпотентно на календарный день МСК.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pushLog, questions } from '../db/schema.js';
import { pushCopy } from './pushCopy.js';
import { resolveBroadcastParticipantIds } from './pushAudienceResolve.js';
import { questionAudienceAllowsParticipant } from './questionEligibility.js';
import { sendPushNotification } from './pushService.js';
import { getMoscowParts } from './timePhase.js';

type Q = typeof questions.$inferSelect;

export function startOfMoscowDay(now = new Date()): Date {
  const { dateKey } = getMoscowParts(now);
  return new Date(`${dateKey}T00:00:00+03:00`);
}

export function touchpointOpenTrigger(questionId: number): string {
  return `touchpoint_open_${questionId}`;
}

export function isAutoNotifyTouchpointQuestion(q: {
  type?: string | null;
  block?: string | null;
  title?: string | null;
  questionKind?: string | null;
  reflectionKind?: string | null;
  isHidden?: boolean | null;
}): boolean {
  if (q.isHidden === true) return false;
  const kind = String(q.questionKind || q.reflectionKind || '').toLowerCase();
  if (
    kind === 'day_summary'
    || kind === 'evening_summary'
    || kind === 'practices_vote'
    || kind === 'diagnostic'
    || kind === 'input'
    || kind === 'extra'
  ) {
    return false;
  }
  if (kind === 'state_check' || kind === 'after_blocks' || kind === 'after_event') return true;
  if (q.type === 'checkin') return true;
  const block = (q.block || '').toLowerCase();
  if (block.includes('точки осмысления') || block.includes('проверк')) return true;
  const title = (q.title || '').toLowerCase();
  if (title.includes('осмысление') || title.includes('проверка состояния')) return true;
  return false;
}

/** Опубликован и окно уже началось (или publishTime не задан). */
export function isQuestionLiveNow(q: {
  status?: string | null;
  isHidden?: boolean | null;
  publishTime?: Date | null;
}, now = new Date()): boolean {
  if (q.status !== 'published' || q.isHidden === true) return false;
  if (q.publishTime && q.publishTime.getTime() > now.getTime()) return false;
  return true;
}

export async function sentTriggerGlobalSince(triggerType: string, since: Date): Promise<boolean> {
  const [row] = await db.select({ id: pushLog.id }).from(pushLog)
    .where(and(
      eq(pushLog.triggerType, triggerType),
      gte(pushLog.sentAt, since),
    )).limit(1);
  return !!row;
}

export async function resolveQuestionNotifyAudience(q: Q): Promise<number[]> {
  const baseIds = await resolveBroadcastParticipantIds(q.shiftId);
  if (!baseIds.length) return [];
  if ((q.audienceType || 'all') === 'all') return baseIds;

  const rows = await db.select({
    id: participants.id,
    directionId: participants.directionId,
    direction: participants.direction,
    groupId: participants.groupId,
    pedagogicalRole: participants.pedagogicalRole,
    strongRole: participants.strongRole,
  }).from(participants).where(inArray(participants.id, baseIds));

  return rows
    .filter(p => questionAudienceAllowsParticipant(q, p))
    .map(p => p.id);
}

export async function notifyQuestionAudience(
  q: Q,
  messageText: string | null | undefined,
  triggerType: string,
): Promise<{ sentTo: number; text: string }> {
  const text = (messageText || '').trim();
  if (!text) return { sentTo: 0, text: '' };
  const ids = await resolveQuestionNotifyAudience(q);
  if (ids.length) {
    await sendPushNotification(ids, text, triggerType, {
      appLinkHash: `#/questions?q=${q.id}`,
    });
  }
  return { sentTo: ids.length, text };
}

/**
 * Если точка уже «в эфире» — один раз за день МСК шлём аудитории
 * (мини-апп + сообщество). Не шлём, если publishTime ещё в будущем.
 */
export async function autoNotifyTouchpointIfLive(
  q: Q,
  now = new Date(),
): Promise<{ sentTo: number; skipped?: string }> {
  if (!isAutoNotifyTouchpointQuestion(q)) return { sentTo: 0, skipped: 'not_touchpoint' };
  if (!isQuestionLiveNow(q, now)) return { sentTo: 0, skipped: 'not_live' };

  const trigger = touchpointOpenTrigger(q.id);
  const dayStart = startOfMoscowDay(now);
  if (await sentTriggerGlobalSince(trigger, dayStart)) {
    return { sentTo: 0, skipped: 'already_sent' };
  }

  const text = (q.pushTemplate || '').trim() || pushCopy.touchpointOpen(q.title);
  const { sentTo } = await notifyQuestionAudience(q, text, trigger);
  return { sentTo };
}
