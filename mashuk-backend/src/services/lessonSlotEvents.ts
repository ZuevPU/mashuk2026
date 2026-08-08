import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { forumDayDateKey, mskInstant, resolveEventInterval, type EventTimeFields } from './eventSchedule.js';
import type { questions } from '../db/schema.js';

export type LessonPickEvent = EventTimeFields & {
  id: number;
  title: string;
  place?: string | null;
  blockType?: string | null;
  parentEventId?: number | null;
  hasSubSessions?: boolean | null;
  sortOrder?: number | null;
};

function lessonSlotIndex(q: { title?: string | null }): 4 | 5 | null {
  const t = (q.title || '').toLowerCase();
  if (t.includes('слот 2') || t.includes('(слот 2)')) return 5;
  if (t.includes('осмысление урока') || t.includes('слот 1')) return 4;
  return null;
}

function slotWindowMinutes(slotIndex: 4 | 5): { openMin: number; closeMin: number } {
  const slot = TOUCHPOINT_SLOTS.find(s => s.index === slotIndex);
  if (!slot) {
    return slotIndex === 4
      ? { openMin: 16 * 60, closeMin: 18 * 60 }
      : { openMin: 18 * 60 + 30, closeMin: 20 * 60 };
  }
  return { openMin: slot.openMin, closeMin: slot.closeMin };
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isBreak(e: { blockType?: string | null }): boolean {
  return (e.blockType || '').toLowerCase() === 'break';
}

function childrenOf(parentId: number, byParent: Map<number, LessonPickEvent[]>): LessonPickEvent[] {
  return (byParent.get(parentId) || []).slice().sort((a, b) => (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
  ));
}

/** Leaf themes under an event (nested sessions); the event itself if it has no children. */
export function lessonThemeLeaves(
  event: LessonPickEvent,
  byParent: Map<number, LessonPickEvent[]>,
): LessonPickEvent[] {
  const kids = childrenOf(event.id, byParent).filter(k => !isBreak(k));
  if (kids.length === 0) return isBreak(event) ? [] : [event];
  return kids.flatMap(k => lessonThemeLeaves(k, byParent));
}

function mapPick(e: LessonPickEvent, displayStart?: Date | null) {
  return {
    id: e.id,
    title: e.title,
    place: e.place ?? null,
    startTime: e.startTime ?? displayStart ?? null,
  };
}

/**
 * Events for «Осмысление урока»: concrete themes (leaf sessions), not parent program slots.
 * Window match is done on events that have a time (usually the parent block);
 * if a matching event has children, those themes are returned instead.
 */
export function filterEventsForLessonSlot(
  question: typeof questions.$inferSelect,
  dayEvents: LessonPickEvent[],
  settings: { startDate?: Date | null },
): { id: number; title: string; place?: string | null; startTime?: Date | null }[] {
  const byParent = new Map<number, LessonPickEvent[]>();
  for (const e of dayEvents) {
    if (e.parentEventId != null) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }

  const idx = lessonSlotIndex(question);
  if (!idx || !question.dayNumber) {
    // No slot window — still prefer themes over parent containers
    const roots = dayEvents.filter(e => e.parentEventId == null && !isBreak(e));
    const themes = roots.flatMap(r => lessonThemeLeaves(r, byParent));
    const seen = new Set<number>();
    return themes.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).map(e => mapPick(e));
  }

  const { openMin, closeMin } = slotWindowMinutes(idx);
  const dateKey = forumDayDateKey(settings.startDate ?? null, question.dayNumber);
  if (!dateKey) {
    const roots = dayEvents.filter(e => e.parentEventId == null && !isBreak(e));
    return roots.flatMap(r => lessonThemeLeaves(r, byParent)).map(e => mapPick(e));
  }

  const slotStart = mskInstant(dateKey, Math.floor(openMin / 60), openMin % 60).getTime();
  const slotEnd = mskInstant(dateKey, Math.floor(closeMin / 60), closeMin % 60).getTime();

  const overlapping = dayEvents.filter(e => {
    if (isBreak(e)) return false;
    const { start, end } = resolveEventInterval(e, settings);
    if (!start) return false;
    const evStart = start.getTime();
    const evEnd = (end ?? new Date(start.getTime() + 90 * 60_000)).getTime();
    return intervalsOverlap(evStart, evEnd, slotStart, slotEnd);
  });

  const out: { id: number; title: string; place?: string | null; startTime?: Date | null }[] = [];
  const seen = new Set<number>();

  for (const e of overlapping) {
    const { start } = resolveEventInterval(e, settings);
    const themes = lessonThemeLeaves(e, byParent);
    for (const theme of themes) {
      if (seen.has(theme.id)) continue;
      seen.add(theme.id);
      out.push(mapPick(theme, start));
    }
  }

  return out;
}

export function lessonSlotIndexForQuestion(q: { title?: string | null }): 4 | 5 | null {
  return lessonSlotIndex(q);
}
