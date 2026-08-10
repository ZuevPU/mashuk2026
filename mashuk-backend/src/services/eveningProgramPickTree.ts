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

function isRootEvent(e: LessonPickEvent): boolean {
  return e.parentEventId == null || e.parentEventId === 0;
}

type PublishFlags = {
  parentEventId?: number | null;
  isPublished?: boolean | null;
  dayPublished?: boolean | null;
};

/**
 * Roots need dayPublished; nested subtopics are kept even if dayPublished is false
 * (common when admin adds themes under an already published block).
 */
export function filterEventsForEveningProgramPick<T extends PublishFlags>(rows: T[]): T[] {
  return rows.filter(e => {
    if (e.isPublished === false) return false;
    if (e.parentEventId != null && e.parentEventId !== 0) return true;
    return e.dayPublished !== false;
  });
}

/**
 * Full program tree for evening questionnaire event pick:
 * large blocks + all nested sub-blocks (no «already conducted» filter).
 *
 * `allEvents` may include the whole shift so children missing day_number still nest.
 * When `surveyDay` is set and there is no explicit link list, only roots of that day
 * are offered (children still attach from the full set).
 */
export function collectEveningProgramPickTree(
  allEvents: LessonPickEvent[],
  linkedEventIds: number[] | null | undefined,
  settings?: ForumScheduleSettings,
  surveyDay?: number | null,
): {
  events: EveningProgramPickNode[];
  programBlockCount: number;
} {
  const byId = new Map(allEvents.map(e => [e.id, e]));
  const byParent = new Map<number, LessonPickEvent[]>();
  for (const e of allEvents) {
    if (e.parentEventId != null && e.parentEventId !== 0) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }

  const linked = Array.isArray(linkedEventIds)
    ? [...new Set(linkedEventIds.filter(id => Number.isFinite(id) && id > 0))]
    : [];

  /** Roots must belong to the questionnaire day — never leak another day's blocks. */
  const belongsToSurveyDay = (e: LessonPickEvent): boolean => {
    if (surveyDay == null) return true;
    if (e.dayNumber == null) {
      // Nested rows sometimes omit day_number; climb to a dated ancestor.
      let pid = e.parentEventId ?? null;
      const seen = new Set<number>();
      while (pid != null && pid !== 0 && !seen.has(pid)) {
        seen.add(pid);
        const parent = byId.get(pid);
        if (!parent) break;
        if (parent.dayNumber != null) return parent.dayNumber === surveyDay;
        pid = parent.parentEventId ?? null;
      }
      // Explicitly linked undated root: allow only when admin selected it for this day.
      return linked.length > 0 && linked.includes(e.id);
    }
    return e.dayNumber === surveyDay;
  };

  let roots: LessonPickEvent[] = [];
  if (linked.length > 0) {
    for (const id of linked) {
      const e = byId.get(id);
      if (!e || isBreak(e)) continue;
      if (!belongsToSurveyDay(e)) continue;
      roots.push(e);
    }
  } else {
    roots = allEvents
      .filter(e => isRootEvent(e) && !isBreak(e))
      .filter(belongsToSurveyDay)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }

  const rootIds = new Set(roots.map(r => r.id));
  roots = roots.filter(e => {
    let pid = e.parentEventId ?? null;
    while (pid != null && pid !== 0) {
      if (rootIds.has(pid)) return false;
      pid = byId.get(pid)?.parentEventId ?? null;
    }
    return true;
  });

  // Stable unique roots (guards against duplicate linked ids / copied rows).
  const seenRoot = new Set<number>();
  roots = roots.filter(e => {
    if (seenRoot.has(e.id)) return false;
    seenRoot.add(e.id);
    return true;
  });

  const events = roots.map(root => mapNode(root, root, settings, byParent));
  return { events, programBlockCount: roots.length };
}
