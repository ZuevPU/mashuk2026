import type { EventTimeFields, ForumScheduleSettings } from './eventSchedule.js';
import { resolveEventInterval } from './eventSchedule.js';
import {
  isLessonAlreadyConducted,
  lessonThemeLeaves,
  type LessonPickEvent,
} from './lessonSlotEvents.js';

export type AfterBlocksSubtopic = {
  id: number;
  title: string;
  place: string | null;
  startTime: Date | null;
  endTime: Date | null;
};

export type AfterBlocksEventNode = {
  id: number;
  title: string;
  place: string | null;
  startTime: Date | null;
  endTime: Date | null;
  children: AfterBlocksSubtopic[];
};

function isBreak(e: { blockType?: string | null }): boolean {
  return (e.blockType || '').toLowerCase() === 'break';
}

function mapNode(
  e: LessonPickEvent,
  container: LessonPickEvent,
  settings: ForumScheduleSettings | undefined,
): AfterBlocksSubtopic {
  const fields: EventTimeFields = {
    startTime: e.startTime ?? container.startTime ?? null,
    endTime: e.endTime ?? container.endTime ?? null,
    timeSlot: e.timeSlot ?? container.timeSlot ?? null,
    dayNumber: e.dayNumber ?? container.dayNumber ?? null,
    eventDate: e.eventDate ?? container.eventDate ?? null,
  };
  const { start, end } = resolveEventInterval(fields, settings ?? {});
  return {
    id: e.id,
    title: e.title,
    place: e.place ?? container.place ?? null,
    startTime: start ?? e.startTime ?? container.startTime ?? null,
    endTime: end ?? e.endTime ?? container.endTime ?? null,
  };
}

/**
 * Tree for «После блоков»: parallel program events → subtopics (lessons/themes).
 * linkedEventIds = root blocks chosen in admin; otherwise all top-level day events.
 */
export function collectAfterBlocksTree(
  dayEvents: LessonPickEvent[],
  linkedEventIds: number[] | null | undefined,
  settings?: ForumScheduleSettings,
  now = new Date(),
): {
  events: AfterBlocksEventNode[];
  /** Flattened leaf ids allowed for submit */
  allowedLeafIds: number[];
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

  // Prefer outermost selected blocks (if both parent and child linked, keep parent only)
  const rootIds = new Set(roots.map(r => r.id));
  roots = roots.filter(e => {
    let pid = e.parentEventId ?? null;
    while (pid != null) {
      if (rootIds.has(pid)) return false;
      pid = byId.get(pid)?.parentEventId ?? null;
    }
    return true;
  });

  const eventsOut: AfterBlocksEventNode[] = [];
  const allowedLeafIds: number[] = [];

  for (const root of roots) {
    const leaves = lessonThemeLeaves(root, byParent);
    const conductedLeaves = leaves.filter(leaf =>
      isLessonAlreadyConducted(leaf, root, settings, now));

    // Event appears once any of its themes has started; if root has no children, use itself
    const topics = conductedLeaves.length
      ? conductedLeaves
      : (leaves.length === 0 && isLessonAlreadyConducted(root, root, settings, now) ? [root] : []);

    if (!topics.length) continue;

    const children = topics
      .filter(t => t.id !== root.id)
      .map(t => mapNode(t, root, settings));

    // If only the root itself is the theme (no real children), expose empty children
    // and treat the root as the selectable leaf on the client.
    const rootMapped = mapNode(root, root, settings);
    eventsOut.push({
      id: rootMapped.id,
      title: rootMapped.title,
      place: rootMapped.place,
      startTime: rootMapped.startTime,
      endTime: rootMapped.endTime,
      children,
    });

    if (children.length > 0) {
      for (const c of children) allowedLeafIds.push(c.id);
    } else {
      allowedLeafIds.push(root.id);
    }
  }

  return {
    events: eventsOut,
    allowedLeafIds,
    programBlockCount: roots.length,
  };
}
