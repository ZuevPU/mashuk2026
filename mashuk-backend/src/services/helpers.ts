import { db } from '../db/index.js';
import { forumSettings } from '../db/schema.js';
import { cache } from './cache.js';
import { getShiftById, isShiftLive, resolveActiveShift, shiftOpsToForumShape } from './shiftService.js';

export async function getForumSettings(shiftId?: number | null) {
  const sid = shiftId != null && Number.isFinite(Number(shiftId)) && Number(shiftId) > 0
    ? Number(shiftId)
    : null;
  const cacheKey = sid != null ? `forumSettings:${sid}` : 'forumSettings';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (sid != null) {
    const shift = await getShiftById(sid);
    if (shift) {
      const result = shiftOpsToForumShape(shift);
      cache.set(cacheKey, result);
      return result;
    }
  }

  const active = await resolveActiveShift();
  if (active) {
    const result = shiftOpsToForumShape(active);
    cache.set('forumSettings', result);
    return result;
  }

  const [settings] = await db.select().from(forumSettings).limit(1);
  const result = settings ?? {
    currentDay: 1,
    totalDays: 8,
    recommendationThreshold: 1,
    sectionsVisibility: {},
    startDate: null,
    groupAssignMode: 'list',
    kbUnlockThreshold: 4,
    kbUnlockDisabled: false,
  };

  cache.set('forumSettings', result);
  return result;
}

export async function forumContextForParticipant(shiftId: number) {
  const shift = await getShiftById(shiftId);
  const settings = await getForumSettings(shiftId);
  return { shiftId, shift, settings, live: isShiftLive(shift) };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function formatTime(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
}

export function isPublished(publishTime: Date | null, closeTime: Date | null, now = new Date()): boolean {
  if (publishTime && publishTime > now) return false;
  if (closeTime && closeTime < now) return false;
  return true;
}

export {
  getMoscowPhase,
  getMoscowParts,
  isEveningWrapWindow,
  getTouchpointAccess,
  lateAnswerPolicyForQuestion,
  moscowAnswerDeadline,
  resolveEffectiveCurrentDay,
  resolveLiveScheduleDay,
  resolveLiveScheduleDateKey,
  resolveLiveProgramDay,
  resolveParticipantForumDay,
  toTouchpointUiStatus,
  getCalendarForumDay,
  forumDayWindowMsk,
  inferForumDayFromTimestamp,
  pointsLogCountsForForumDay,
  getPreferredStateCheckPhase,
  stateCheckTimePointOrder,
  isSameMoscowCalendarDay,
  getForumOperationalDateKey,
} from './timePhase.js';
export type { LateAnswerPolicy } from './timePhase.js';
