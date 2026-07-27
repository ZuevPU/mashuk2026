import { getMoscowParts } from './timePhase.js';

export type EventLiveStatus = 'past' | 'now' | 'future';

/** Default block length when end time is missing (avoids perpetual «сейчас»). */
export const DEFAULT_EVENT_DURATION_MS = 90 * 60 * 1000;

const CLOCK_RE = /(\d{1,2})[:.](\d{2})/g;

export function parseClockPair(timeSlot: string | null | undefined): {
  startH: number;
  startM: number;
  endH?: number;
  endM?: number;
} | null {
  if (!timeSlot?.trim()) return null;
  const normalized = timeSlot.replace(/\u2013|\u2014/g, '-');
  const matches = [...normalized.matchAll(CLOCK_RE)];
  if (matches.length === 0) return null;
  const toHM = (m: RegExpMatchArray) => {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, min };
  };
  const start = toHM(matches[0]);
  if (!start) return null;
  const end = matches.length > 1 ? toHM(matches[1]) : null;
  return {
    startH: start.h,
    startM: start.min,
    ...(end ? { endH: end.h, endM: end.min } : {}),
  };
}

/** Calendar date (MSK) for forum day N (day 1 = startDate's MSK date). */
export function forumDayDateKey(
  startDate: Date | null | undefined,
  dayNumber: number,
): string | null {
  if (!startDate || !dayNumber) return null;
  const startParts = getMoscowParts(startDate);
  const base = Date.parse(`${startParts.dateKey}T00:00:00+03:00`);
  if (Number.isNaN(base)) return null;
  const target = new Date(base + (dayNumber - 1) * 86_400_000);
  const parts = getMoscowParts(target);
  return parts.dateKey;
}

export function mskInstant(dateKey: string, hours: number, minutes: number): Date {
  return new Date(`${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+03:00`);
}

export type EventTimeFields = {
  startTime?: Date | null;
  endTime?: Date | null;
  timeSlot?: string | null;
  dayNumber?: number | null;
  eventDate?: Date | null;
};

export type ForumScheduleSettings = {
  startDate?: Date | null;
};

/** Resolve absolute start/end for status display and home «сейчас». */
export function resolveEventInterval(
  event: EventTimeFields,
  settings: ForumScheduleSettings,
): { start: Date | null; end: Date | null } {
  let start = event.startTime ?? null;
  let end = event.endTime ?? null;

  const dayNumber = event.dayNumber ?? null;
  const dateKey = dayNumber ? forumDayDateKey(settings.startDate ?? null, dayNumber) : null;
  const clocks = parseClockPair(event.timeSlot);

  if (!start && dateKey && clocks) {
    start = mskInstant(dateKey, clocks.startH, clocks.startM);
  }
  if (!start && event.eventDate) {
    start = event.eventDate;
  }

  if (!end && dateKey && clocks?.endH != null && clocks.endM != null) {
    end = mskInstant(dateKey, clocks.endH, clocks.endM);
    if (start && end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 86_400_000);
    }
  }
  if (!end && start) {
    end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
  }

  return { start, end };
}

/**
 * Live status for schedule UI (MSK wall clock on the viewed forum day).
 * Past/future forum days force all blocks past/future regardless of clock.
 */
export function getEventLiveStatus(
  viewedDay: number,
  effectiveCurrentDay: number,
  start: Date | null,
  end: Date | null,
  now = new Date(),
): EventLiveStatus {
  if (viewedDay < effectiveCurrentDay) return 'past';
  if (viewedDay > effectiveCurrentDay) return 'future';
  if (!start) return 'future';
  const endBound = end ?? new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
  if (endBound.getTime() < now.getTime()) return 'past';
  if (start.getTime() > now.getTime()) return 'future';
  return 'now';
}

export function enrichEventTimestamps<T extends EventTimeFields>(
  payload: T,
  settings: ForumScheduleSettings,
  existing?: EventTimeFields | null,
): T & { startTime?: Date | null; endTime?: Date | null; eventDate?: Date | null } {
  const merged = { ...existing, ...payload };
  const { start, end } = resolveEventInterval(merged, settings);
  return {
    ...payload,
    ...(start ? { startTime: start, eventDate: start } : {}),
    ...(end ? { endTime: end } : {}),
  };
}

export function recommendationSubtitle(score: number, threshold: number): string {
  if (score >= threshold + 2) return 'под твой запрос';
  if (score >= threshold + 1) return 'по интересам';
  return 'для кругозора';
}
