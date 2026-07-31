import { DEFAULT_EVENT_DURATION_MS } from './eventSchedule.js';

export type TimedItem<T> = {
  item: T;
  start: Date;
  end: Date | null;
};

function endMs(r: TimedItem<unknown>): number {
  return (r.end ?? new Date(r.start.getTime() + DEFAULT_EVENT_DURATION_MS)).getTime();
}

/** Cluster events whose time ranges overlap (parallel blocks with different timeSlot strings). */
export function clusterOverlappingTimedItems<T>(rows: TimedItem<T>[]): TimedItem<T>[][] {
  const sorted = [...rows].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || endMs(a) - endMs(b),
  );

  const clusters: TimedItem<T>[][] = [];
  for (const row of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([row]);
      continue;
    }
    const clusterEnd = Math.max(...last.map(endMs));
    if (row.start.getTime() < clusterEnd) {
      last.push(row);
    } else {
      clusters.push([row]);
    }
  }
  return clusters;
}

export function formatSlotLabel(start: Date | null, end: Date | null, fallback: string): string {
  if (!start) return fallback;
  const hhmm = (d: Date) =>
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const s = hhmm(start);
  if (!end) return s;
  const e = hhmm(end);
  return e && e !== s ? `${s}–${e}` : s;
}
