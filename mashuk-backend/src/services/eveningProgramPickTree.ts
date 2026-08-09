import type { EventTimeFields, ForumScheduleSettings } from './eventSchedule.js';
import { resolveEventInterval } from './eventSchedule.js';
import type { LessonPickEvent } from './lessonSlotEvents.js';

export type EveningProgramPickNode = {
  id: number;
  title: string;
  place: string | null;
  startTime: Date | null;
  endTime: Date | null;
  children: EveningProgramPickNode[];
};

function isBreak(e: { blockType?: string | null }): boolean {
  return (e.blockType || '').toLowerCase() === 'break';
}

function childrenOf(parentId: number, byParent: Map<number, LessonPickEvent[]>): LessonPickEvent[] {
  return (byParent.get(parentId) || [])
    .filter(k => !isBreak(k))
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
}

function mapNode(
  e: LessonPickEvent,
  container: LessonPickEvent,
  settings: ForumScheduleSettings | undefined,
  byParent: Map<number, LessonPickEvent[]>,
): EveningProgramPickNode {
  const fields: EventTimeFields = {
    startTime: e.startTime ?? container.startTime ?? null,
    endTime: e.endTime ?? container.endTime ?? null,
    timeSlot: e.timeSlot ?? container.timeSlot ?? null,
    dayNumber: e.dayNumber ?? container.dayNumber ?? null,
    eventDate: e.eventDate ?? container.eventDate ?? null,
  };
  const { start, end } = resolveEventInterval(fields, settings ?? {});
  const kids = childrenOf(e.id, byParent);
  return {
    id: e.id,
    title: e.title,
    place: e.place ?? container.place ?? null,
    startTime: start ?? e.startTime ?? container.startTime ?? null,
    endTime: end ?? e.endTime ?? container.endTime ?? null,
    children: kids.map(k => mapNode(k, e, settings, byParent)),
  };
}

/**
 * Full program tree for evening questionnaire event pick:
 * large blocks + all nested sub-blocks (no «already conducted» filter).
 */
export function collectEveningProgramPickTree(
  dayEvents: LessonPickEvent[],
  linkedEventIds: number[] | null | undefined,
  settings?: ForumScheduleSettings,
): {
  events: EveningProgramPickNode[];
  programBlockCount: number;
} {
  const byId = new Map(dayEvents.map(e => [e.id, e]));
  const byParent = new Map<number, LessonPickEvent[]>();
  for (const e of dayEvents) {
    if (e.parentEventId != null) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }

  const linked = Array.isArray(linkedEventIds)
    ? linkedEventIds.filter(id => Number.isFinite(id))
    : [];

  let roots: LessonPickEvent[] = [];
  if (linked.length > 0) {
    for (const id of linked) {
      const e = byId.get(id);
      if (e && !isBreak(e)) roots.push(e);
    }
  } else {
    roots = dayEvents
      .filter(e => (e.parentEventId == null || e.parentEventId === 0) && !isBreak(e))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }

  const rootIds = new Set(roots.map(r => r.id));
  roots = roots.filter(e => {
    let pid = e.parentEventId ?? null;
    while (pid != null) {
      if (rootIds.has(pid)) return false;
      pid = byId.get(pid)?.parentEventId ?? null;
    }
    return true;
  });

  const events = roots.map(root => mapNode(root, root, settings, byParent));
  return { events, programBlockCount: roots.length };
}
