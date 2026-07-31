import { eventVisibilityLabel, parseTimeSlot, type ProgramEvent } from './types';

export const CAL_START_HOUR = 7;
export const CAL_END_HOUR = 22;
export const CAL_SLOT_MINUTES = 30;

export function timeToMinutes(hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return CAL_START_HOUR * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = CAL_START_HOUR * 60; m < CAL_END_HOUR * 60; m += CAL_SLOT_MINUTES) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export function slotKeyForEvent(e: ProgramEvent): string {
  const { start } = parseTimeSlot(e.timeSlot);
  const mins = timeToMinutes(start);
  const snapped = Math.floor(mins / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES;
  return minutesToTime(Math.max(CAL_START_HOUR * 60, Math.min(snapped, CAL_END_HOUR * 60 - CAL_SLOT_MINUTES)));
}

function eventIntervalMinutes(e: ProgramEvent): { start: number; end: number } {
  const { start, end } = parseTimeSlot(e.timeSlot);
  const s = timeToMinutes(start);
  const en = end ? timeToMinutes(end) : s + 90;
  return { start: s, end: Math.max(en, s + CAL_SLOT_MINUTES) };
}

/** Parallel blocks: overlapping intervals → one cluster, shown in row of earliest start. */
export function clusterParallelEvents(dayEvents: ProgramEvent[]): Map<string, ProgramEvent[]> {
  const sorted = [...dayEvents].sort((a, b) => {
    const ia = eventIntervalMinutes(a);
    const ib = eventIntervalMinutes(b);
    return ia.start - ib.start || ia.end - ib.end;
  });

  const clusters: ProgramEvent[][] = [];
  for (const ev of sorted) {
    const iv = eventIntervalMinutes(ev);
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([ev]);
      continue;
    }
    const lastEnd = Math.max(...last.map(e => eventIntervalMinutes(e).end));
    if (iv.start < lastEnd) {
      last.push(ev);
    } else {
      clusters.push([ev]);
    }
  }

  const map = new Map<string, ProgramEvent[]>();
  for (const cluster of clusters) {
    const slot = slotKeyForEvent(cluster[0]);
    const prev = map.get(slot);
    map.set(slot, prev ? [...prev, ...cluster] : cluster);
  }
  return map;
}

export function parallelEventsForCell(
  dayEvents: ProgramEvent[],
  day: number,
  time: string,
): ProgramEvent[] {
  const byDay = dayEvents.filter(e => e.dayNumber === day);
  const clusters = clusterParallelEvents(byDay);
  return clusters.get(time) ?? [];
}

export type CalendarCell = {
  day: number;
  time: string;
  events: ProgramEvent[];
};

export function buildCalendarMatrix(
  events: ProgramEvent[],
  totalDays: number,
  timeSlots: string[] = buildTimeSlots(),
): CalendarCell[] {
  const rootEvents = events;
  const cells: CalendarCell[] = [];

  for (let day = 1; day <= totalDays; day += 1) {
    for (const time of timeSlots) {
      const dayEvents = rootEvents.filter(e => e.dayNumber === day && slotKeyForEvent(e) === time);
      cells.push({ day, time, events: dayEvents });
    }
  }
  return cells;
}

export function countShiftStats(events: ProgramEvent[]) {
  let total = 0;
  let visible = 0;
  let draft = 0;
  for (const e of events) {
    total += 1;
    if (eventVisibilityLabel(e) === 'visible') visible += 1;
    else draft += 1;
  }
  return { total, visible, draft };
}
