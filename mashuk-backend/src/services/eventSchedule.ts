import { getMoscowParts } from './timePhase.js';

export type EventLiveStatus = 'past' | 'now' | 'future';

/** Default block length when end time is missing (avoids perpetual «сейчас»). */
export const DEFAULT_EVENT_DURATION_MS = 90 * 60 * 1000;

/** Admin «Ключевой блок» — только такие подсвечиваем оранжевым «Сейчас». */
export function isKeyProgramBlock(e: {
  isKeyBlock?: boolean | null;
  blockType?: string | null;
}): boolean {
  return e.isKeyBlock === true || e.blockType === 'key_block';
}

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
  /** MSK calendar date (YYYY-MM-DD) for this forum day from schedule_days.calendar_date */
  dayCalendarDateKey?: string | null;
};

export function calendarDateKeyFromTimestamp(d: Date | null | undefined): string | null {
  if (!d) return null;
  return getMoscowParts(d).dateKey;
}

/** Resolve absolute start/end for status display and home «сейчас». */
export function resolveEventInterval(
  event: EventTimeFields,
  settings: ForumScheduleSettings,
): { start: Date | null; end: Date | null } {
  const dayNumber = event.dayNumber ?? null;
  const dateKey = dayNumber
    ? (settings.dayCalendarDateKey ?? forumDayDateKey(settings.startDate ?? null, dayNumber))
    : null;
  const clocks = parseClockPair(event.timeSlot);

  if (dateKey && clocks) {
    const start = mskInstant(dateKey, clocks.startH, clocks.startM);
    let end: Date | null = null;
    if (clocks.endH != null && clocks.endM != null) {
      end = mskInstant(dateKey, clocks.endH, clocks.endM);
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 86_400_000);
      }
    } else {
      end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
    }
    return { start, end };
  }

  const storedStart = event.startTime ?? event.eventDate ?? null;
  if (dateKey && storedStart) {
    // Legacy/copied events may keep the right MSK clock but an old calendar
    // date. Bind that clock to the configured forum day so «Сейчас» survives
    // shift date changes even when timeSlot was not populated.
    const startClock = getMoscowParts(storedStart);
    const start = mskInstant(dateKey, startClock.hours, startClock.minutes);
    let end: Date | null = null;
    if (event.endTime) {
      const endClock = getMoscowParts(event.endTime);
      end = mskInstant(dateKey, endClock.hours, endClock.minutes);
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 86_400_000);
      }
    } else {
      end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
    }
    return { start, end };
  }

  let start = event.startTime ?? null;
  let end = event.endTime ?? null;
  if (!start && event.eventDate) {
    start = event.eventDate;
  }
  if (!end && start) {
    end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
  }

  return { start, end };
}

/**
 * Live status for schedule UI (MSK wall clock on the viewed forum day).
 * `liveScheduleDay` — календарный день форума «сегодня» (resolveLiveScheduleDay), не admin currentDay.
 */
export function getEventLiveStatus(
  viewedDay: number,
  liveScheduleDay: number,
  start: Date | null,
  end: Date | null,
  now = new Date(),
): EventLiveStatus {
  if (viewedDay < liveScheduleDay) return 'past';
  if (viewedDay > liveScheduleDay) return 'future';
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

export const DEFAULT_PROGRAM_REC_EMPTY_NO_MATCH =
  'Здесь будут отображаться события программы, которые совпадают с вашими интересами. Когда такие совпадения появятся, мы покажем их в этом разделе.';

export const DEFAULT_PROGRAM_REC_EMPTY_NO_EVENTS =
  'На этот день ещё нет опубликованных событий — блок появится, когда расписание выйдет.';

export function resolveProgramRecEmptyTexts(settings: {
  programRecEmptyNoMatchText?: string | null;
  programRecEmptyNoEventsText?: string | null;
} | null | undefined): { noMatch: string; noEvents: string } {
  const noMatch = settings?.programRecEmptyNoMatchText?.trim();
  const noEvents = settings?.programRecEmptyNoEventsText?.trim();
  return {
    noMatch: noMatch || DEFAULT_PROGRAM_REC_EMPTY_NO_MATCH,
    noEvents: noEvents || DEFAULT_PROGRAM_REC_EMPTY_NO_EVENTS,
  };
}
