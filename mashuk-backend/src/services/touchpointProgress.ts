import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { questions } from '../db/schema.js';
import { TOUCHPOINT_SLOTS, type TouchpointSlot } from './touchpointTemplates.js';
import { getTouchpointAccess } from './helpers.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import { resolveQuestionDayForAccess } from './questionEligibility.js';

export const TOUCHPOINT_BLOCKS = new Set(['Проверка состояния', 'Точки осмысления', 'Итоги дня']);

type QuestionRow = typeof questions.$inferSelect;

/** Сопоставление вопроса со слотом шаблона (точное название или тип/блок/время). */
export function questionMatchesTouchpointSlot(
  q: Pick<QuestionRow, 'title' | 'type' | 'block' | 'timePoint' | 'questionKind'>,
  slot: TouchpointSlot,
): boolean {
  if ((q.title || '').trim() === slot.title) return true;

  if (slot.type === 'checkin') {
    const tp = (q.timePoint || '').trim();
    if (tp !== slot.timePoint) return false;
    if ((q.block || '') !== slot.block) return false;
    // Accept any question in the state-check block/slot (admin may use type scale/open)
    return q.type === 'checkin'
      || q.questionKind === 'state_check'
      || (q.block || '') === 'Проверка состояния';
  }

  if (slot.block === 'Точки осмысления') {
    if ((q.block || '') !== 'Точки осмысления') return false;
    const title = (q.title || '').toLowerCase();
    if (slot.title === 'Осмысление по направлению') {
      if (title.includes('осмысление урока') || title.includes('слот')) return false;
      return (q.timePoint || '').trim() === slot.timePoint;
    }
    if (slot.title.startsWith('Осмысление урока')) {
      if (slot.title.includes('слот 1')) {
        return title.includes('слот 1')
          || (title.includes('осмысление урока') && !title.includes('слот 2'));
      }
      return title.includes('слот 2')
        || ((q.timePoint || '').trim() === 'вечер' && title.includes('осмысление') && !title.includes('слот 1'));
    }
  }

  if (slot.title === 'Итоговая анкета по дню') {
    return q.block === 'Итоги дня' || (q.block || '').includes('Итог');
  }

  return false;
}

export type FindTouchpointOpts = {
  answeredIds?: Set<number>;
  currentDay?: number;
  now?: Date;
};

/** Prefer answered twin, then currently open/overdue, then newest id. */
export function findTouchpointQuestionForSlot(
  candidates: QuestionRow[],
  slot: TouchpointSlot,
  opts?: FindTouchpointOpts,
): QuestionRow | undefined {
  const matched = candidates
    .filter(q => questionMatchesTouchpointSlot(q, slot))
    .sort((a, b) => b.id - a.id);
  if (matched.length === 0) return undefined;

  const answeredIds = opts?.answeredIds;
  if (answeredIds?.size) {
    const answered = matched.filter(q => answeredIds.has(q.id));
    if (answered[0]) return answered[0];
  }

  if (opts?.currentDay != null) {
    const now = opts.now ?? new Date();
    const open = matched.filter(q => {
      const accessDay = resolveQuestionDayForAccess(q, opts.currentDay!);
      const access = getTouchpointAccess(accessDay, opts.currentDay!, q.closeTime, now, q.publishTime);
      return access === 'open' || access === 'overdue';
    });
    if (open[0]) return open[0];
  }

  return matched[0];
}

export function isTouchpointQuestionForForumDay(q: QuestionRow, forumDay: number): boolean {
  if (!questionMatchesDay(q, forumDay)) return false;
  if (!TOUCHPOINT_BLOCKS.has(q.block || '')) return false;
  return TOUCHPOINT_SLOTS.some(s => questionMatchesTouchpointSlot(q, s));
}

export type TouchpointItem = {
  id: number | string;
  title: string;
  state: 'done' | 'active' | 'overdue' | 'locked' | 'pending';
  block?: string | null;
};

export async function loadPublishedTouchpointQuestions(currentDay: number, shiftId?: number | null) {
  const list = shiftId != null
    ? await db.select().from(questions).where(and(
      eq(questions.status, 'published'),
      eq(questions.shiftId, shiftId),
    ))
    : await db.select().from(questions).where(eq(questions.status, 'published'));
  return list.filter(q => {
    const days = [1, 2, 3, 4, 5, 6, 7].filter(d => d <= currentDay && questionMatchesDay(q, d));
    return days.some(d => isTouchpointQuestionForForumDay(q, d));
  });
}

export function buildTouchpointItemsForDay(
  dayQuestions: typeof questions.$inferSelect[],
  answeredIds: Set<number>,
  currentDay: number,
  dayNumber: number,
  now = new Date(),
): TouchpointItem[] {
  const dayQs = dayQuestions.filter(q => questionMatchesDay(q, dayNumber));
  return TOUCHPOINT_SLOTS.map(slot => {
    const matched = dayQs.filter(q => questionMatchesTouchpointSlot(q, slot));
    if (matched.length === 0) {
      return { id: slot.index, title: slot.title, state: 'pending' as const, block: slot.block };
    }
    const done = matched.some(q => answeredIds.has(q.id));
    const q = findTouchpointQuestionForSlot(dayQs, slot, { answeredIds, currentDay, now })!;
    const accessDay = resolveQuestionDayForAccess(q, currentDay);
    const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
    let state: TouchpointItem['state'] = 'pending';
    if (done) state = 'done';
    else if (access === 'locked') state = 'locked';
    else if (access === 'overdue') state = 'overdue';
    else if (access === 'open') state = 'active';
    // access === 'soon' → pending (окно ещё не открылось)
    return { id: q.id, title: q.title, state, block: q.block };
  });
}

export function touchpointCompletionRatio(
  dayQuestions: QuestionRow[],
  answeredIds: Set<number>,
  dayNumber: number,
): { completed: number; expected: number } {
  const dayQs = dayQuestions.filter(q => questionMatchesDay(q, dayNumber));
  let completed = 0;
  for (const slot of TOUCHPOINT_SLOTS) {
    // Any matching twin counts (user may have answered an older id than the newest publish)
    const matched = dayQs.filter(q => questionMatchesTouchpointSlot(q, slot));
    if (matched.some(q => answeredIds.has(q.id))) completed += 1;
  }
  return { completed, expected: TOUCHPOINT_SLOTS.length };
}

/** Cumulative completion across days 1..throughDay (inclusive). */
export function touchpointCompletionRatioCumulative(
  dayQuestions: QuestionRow[],
  answeredIds: Set<number>,
  throughDay: number,
): { completed: number; expected: number } {
  const last = Math.min(Math.max(1, throughDay), 7);
  let completed = 0;
  let expected = 0;
  for (let d = 1; d <= last; d++) {
    const r = touchpointCompletionRatio(dayQuestions, answeredIds, d);
    completed += r.completed;
    expected += r.expected;
  }
  return { completed, expected: Math.max(1, expected) };
}
