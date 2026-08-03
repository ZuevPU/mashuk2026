import { DEFAULT_EVENT_DURATION_MS } from './eventSchedule.js';

export type TimedItem<T> = {
  item: T;
  start: Date;
  end: Date | null;
};

function endMs(r: TimedItem<unknown>): number {
  return (r.end ?? new Date(r.start.getTime() + DEFAULT_EVENT_DURATION_MS)).getTime();
}

/** Floor start to the minute (MSK instants are absolute Date values). */
function startMinuteKey(d: Date): number {
  return Math.floor(d.getTime() / 60_000) * 60_000;
}

/**
 * Group program blocks into timeline cells by start time.
 * Same start minute → one cell (parallel tracks). Different starts → separate cells,
 * even if intervals overlap (avoids one long block swallowing the whole day).
 */
export function clusterOverlappingTimedItems<T>(rows: TimedItem<T>[]): TimedItem<T>[][] {
  const sorted = [...rows].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || endMs(a) - endMs(b),
  );

  const clusters: TimedItem<T>[][] = [];
  let currentKey: number | null = null;

  for (const row of sorted) {
    const key = startMinuteKey(row.start);
    if (currentKey === null || key !== currentKey) {
      clusters.push([row]);
      currentKey = key;
    } else {
      clusters[clusters.length - 1].push(row);
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
