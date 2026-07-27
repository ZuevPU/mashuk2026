import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { forumDayDateKey, mskInstant, resolveEventInterval, type EventTimeFields } from './eventSchedule.js';
import type { questions } from '../db/schema.js';

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

export function filterEventsForLessonSlot(
  question: typeof questions.$inferSelect,
  dayEvents: (EventTimeFields & { id: number; title: string; blockType?: string | null })[],
  settings: { startDate?: Date | null },
): { id: number; title: string; place?: string | null; startTime?: Date | null }[] {
  const idx = lessonSlotIndex(question);
  if (!idx || !question.dayNumber) {
    return dayEvents.map(e => ({
      id: e.id,
      title: e.title,
      place: (e as { place?: string | null }).place ?? null,
      startTime: e.startTime ?? null,
    }));
  }

  const { openMin, closeMin } = slotWindowMinutes(idx);
  const dateKey = forumDayDateKey(settings.startDate ?? null, question.dayNumber);
  if (!dateKey) {
    return dayEvents.map(e => ({
      id: e.id,
      title: e.title,
      place: (e as { place?: string | null }).place ?? null,
      startTime: e.startTime ?? null,
    }));
  }

  const slotStart = mskInstant(dateKey, Math.floor(openMin / 60), openMin % 60).getTime();
  const slotEnd = mskInstant(dateKey, Math.floor(closeMin / 60), closeMin % 60).getTime();

  const filtered = dayEvents.filter(e => {
    const bt = (e.blockType || '').toLowerCase();
    if (bt === 'break') return false;
    const { start, end } = resolveEventInterval(e, settings);
    if (!start) return false;
    const evStart = start.getTime();
    const evEnd = (end ?? new Date(start.getTime() + 90 * 60_000)).getTime();
    return intervalsOverlap(evStart, evEnd, slotStart, slotEnd);
  });

  return filtered.map(e => ({
    id: e.id,
    title: e.title,
    place: (e as { place?: string | null }).place ?? null,
    startTime: e.startTime ?? null,
  }));
}

export function lessonSlotIndexForQuestion(q: { title?: string | null }): 4 | 5 | null {
  return lessonSlotIndex(q);
}
