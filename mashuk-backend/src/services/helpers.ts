import { db } from '../db/index.js';
import { forumSettings } from '../db/schema.js';
import { cache } from './cache.js';
import { resolveActiveShift, shiftOpsToForumShape } from './shiftService.js';

export async function getForumSettings() {
  const cached = cache.get('forumSettings');
  if (cached) return cached;

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
  resolveEffectiveCurrentDay,
  resolveLiveScheduleDay,
  resolveLiveScheduleDateKey,
  toTouchpointUiStatus,
  getCalendarForumDay,
  getPreferredStateCheckPhase,
  stateCheckTimePointOrder,
  isSameMoscowCalendarDay,
  getForumOperationalDateKey,
} from './timePhase.js';
