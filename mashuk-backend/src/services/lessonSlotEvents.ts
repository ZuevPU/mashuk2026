import type { questions } from '../db/schema.js';
import {
  resolveEventInterval,
  type EventTimeFields,
  type ForumScheduleSettings,
} from './eventSchedule.js';

export type LessonPickEvent = EventTimeFields & {
  id: number;
  title: string;
  place?: string | null;
  blockType?: string | null;
  parentEventId?: number | null;
  hasSubSessions?: boolean | null;
  sortOrder?: number | null;
};

export type LessonPickItem = {
  id: number;
  title: string;
  place?: string | null;
  startTime?: Date | null;
  endTime?: Date | null;
};

type LessonKind = 'important' | 'open' | 'any';

/**
 * Слот осмысления урока по заголовку вопроса.
 * Админка часто пишет «Осмысление Уроков о важном» / «Открытых уроков…»
 * вместо шаблонного «Осмысление урока (слот 1/2)».
 */
function lessonSlotIndex(q: { title?: string | null }): 4 | 5 | null {
  const t = (q.title || '').toLowerCase();
  if (!t.trim()) return null;

  // Слот 2 / открытые — сначала, чтобы «открытый урок о важном» не ушёл в слот 1.
  if (
    t.includes('слот 2')
    || t.includes('(слот 2)')
    || t.includes('открыт')
    || t.includes('наоборот')
  ) {
    return 5;
  }

  if (
    t.includes('слот 1')
    || t.includes('(слот 1)')
    || t.includes('важн')
    || /осмысление\s+урок/.test(t)
  ) {
    return 4;
  }

  return null;
}

function lessonKindForSlot(slot: 4 | 5 | null): LessonKind {
  if (slot === 5) return 'open';
  if (slot === 4) return 'important';
  return 'any';
}

function isBreak(e: { blockType?: string | null }): boolean {
  return (e.blockType || '').toLowerCase() === 'break';
}

/** Блок / тема из семейства уроков (не утренний круг, не мастерская направления). */
export function isLessonEvent(e: { title: string; blockType?: string | null }): boolean {
  const t = e.title.toLowerCase();
  const bt = (e.blockType || '').toLowerCase();
  if (isBreak(e)) return false;
  return (
    t.includes('урок')
    || t.includes('важн')
    || bt.includes('урок')
    || bt.includes('lesson')
    || bt.includes('important')
    || bt.includes('topic')
  );
}

/** «Уроки о важном» (слот 1). */
export function isImportantLessonBlock(e: { title: string; blockType?: string | null }): boolean {
  const t = e.title.toLowerCase();
  const bt = (e.blockType || '').toLowerCase();
  if (t.includes('открыт') || t.includes('наоборот')) return false;
  return (
    t.includes('важн')
    || bt.includes('important')
    || bt.includes('lesson_important')
    || (t.includes('урок') && !t.includes('открыт'))
  );
}

/** «Открытые уроки» / практики (слот 2). */
export function isOpenLessonBlock(e: { title: string; blockType?: string | null }): boolean {
  const t = e.title.toLowerCase();
  const bt = (e.blockType || '').toLowerCase();
  return (
    t.includes('открыт')
    || t.includes('наоборот')
    || bt.includes('open')
    || bt.includes('lesson_open')
  );
}

function matchesKind(e: { title: string; blockType?: string | null }, kind: LessonKind): boolean {
  if (kind === 'important') return isImportantLessonBlock(e);
  if (kind === 'open') return isOpenLessonBlock(e);
  return isLessonEvent(e);
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

/**
 * Урок уже начался / прошёл по расписанию дня.
 * Без времени в программе — считаем доступным (legacy).
 */
export function isLessonAlreadyConducted(
  theme: LessonPickEvent,
  container: LessonPickEvent,
  settings: ForumScheduleSettings | undefined,
  now: Date,
): boolean {
  const fields: EventTimeFields = {
    startTime: theme.startTime ?? container.startTime ?? null,
    endTime: theme.endTime ?? container.endTime ?? null,
    timeSlot: theme.timeSlot ?? container.timeSlot ?? null,
    dayNumber: theme.dayNumber ?? container.dayNumber ?? null,
    eventDate: theme.eventDate ?? container.eventDate ?? null,
  };
  const { start } = resolveEventInterval(fields, settings ?? {});
  if (!start) return true;
  return start.getTime() <= now.getTime();
}

function mapPick(
  e: LessonPickEvent,
  container: LessonPickEvent,
  settings: ForumScheduleSettings | undefined,
): LessonPickItem {
  const { start, end } = resolveEventInterval(
    {
      startTime: e.startTime ?? container.startTime ?? null,
      endTime: e.endTime ?? container.endTime ?? null,
      timeSlot: e.timeSlot ?? container.timeSlot ?? null,
      dayNumber: e.dayNumber ?? container.dayNumber ?? null,
      eventDate: e.eventDate ?? container.eventDate ?? null,
    },
    settings ?? {},
  );
  return {
    id: e.id,
    title: e.title,
    place: e.place ?? container.place ?? null,
    startTime: start ?? e.startTime ?? container.startTime ?? null,
    endTime: end ?? e.endTime ?? container.endTime ?? null,
  };
}

/**
 * Контейнеры уроков на любом уровне дерева (не только top-level):
 * «Уроки о важном» часто лежит внутри ключевого блока дня.
 * Берём самый «внешний» matching-узел: если и родитель, и ребёнок match — предпочитаем родителя.
 */
function pickLessonContainers(
  dayEvents: LessonPickEvent[],
  kind: LessonKind,
): LessonPickEvent[] {
  const byId = new Map(dayEvents.map(e => [e.id, e]));
  const matchFn = (e: LessonPickEvent) => matchesKind(e, kind);

  let matched = dayEvents.filter(e => !isBreak(e) && matchFn(e));
  if (matched.length === 0 && kind !== 'any') {
    matched = dayEvents.filter(e => !isBreak(e) && isLessonEvent(e));
  }
  if (matched.length === 0) return [];

  const matchedIds = new Set(matched.map(e => e.id));
  return matched.filter(e => {
    let pid = e.parentEventId ?? null;
    while (pid != null) {
      if (matchedIds.has(pid)) return false;
      pid = byId.get(pid)?.parentEventId ?? null;
    }
    return true;
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
}

export type FilterLessonSlotResult = {
  items: LessonPickItem[];
  /** Сколько тем в программе слота всего (включая ещё не начавшиеся). */
  programThemeCount: number;
};

/**
 * События для «Осмысление урока»: темы уроков дня из программы.
 * Слот 1 → «Уроки о важном», слот 2 → «Открытые уроки».
 * В список попадают только уже начавшиеся / проведённые темы.
 */
export function filterEventsForLessonSlot(
  question: typeof questions.$inferSelect,
  dayEvents: LessonPickEvent[],
  settings?: ForumScheduleSettings,
  now = new Date(),
): LessonPickItem[] {
  return collectLessonSlotThemes(question, dayEvents, settings, now).items;
}

/** Полный результат с метаданными для UI. */
export function collectLessonSlotThemes(
  question: typeof questions.$inferSelect,
  dayEvents: LessonPickEvent[],
  settings?: ForumScheduleSettings,
  now = new Date(),
): FilterLessonSlotResult {
  const byParent = new Map<number, LessonPickEvent[]>();
  for (const e of dayEvents) {
    if (e.parentEventId != null) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }

  const kind = lessonKindForSlot(lessonSlotIndex(question));
  const containers = pickLessonContainers(dayEvents, kind);

  const allThemes: { theme: LessonPickEvent; container: LessonPickEvent }[] = [];
  const seen = new Set<number>();

  for (const container of containers) {
    const themes = lessonThemeLeaves(container, byParent);
    for (const theme of themes) {
      if (seen.has(theme.id)) continue;
      seen.add(theme.id);
      allThemes.push({ theme, container });
    }
  }

  const conducted = allThemes.filter(({ theme, container }) =>
    isLessonAlreadyConducted(theme, container, settings, now));

  const items = conducted
    .map(({ theme, container }) => mapPick(theme, container, settings))
    .sort((a, b) => {
      const ta = a.startTime?.getTime() ?? 0;
      const tb = b.startTime?.getTime() ?? 0;
      return ta - tb || a.id - b.id;
    });

  return { items, programThemeCount: allThemes.length };
}

export function lessonSlotIndexForQuestion(q: { title?: string | null }): 4 | 5 | null {
  return lessonSlotIndex(q);
}
