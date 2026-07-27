import { eq, and, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { questions, answers } from '../db/schema.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { getTouchpointAccess } from './helpers.js';

const slotTitles = new Set(TOUCHPOINT_SLOTS.map(s => s.title));

export type TouchpointItem = {
  id: number | string;
  title: string;
  state: 'done' | 'active' | 'overdue' | 'locked' | 'pending';
  block?: string | null;
};

export async function loadPublishedTouchpointQuestions(currentDay: number) {
  const list = await db.select().from(questions).where(eq(questions.status, 'published'));
  return list.filter(q =>
    q.dayNumber != null
    && q.dayNumber <= currentDay
    && q.dayNumber <= 7
    && slotTitles.has(q.title),
  );
}

export function buildTouchpointItemsForDay(
  dayQuestions: typeof questions.$inferSelect[],
  answeredIds: Set<number>,
  currentDay: number,
  dayNumber: number,
  now = new Date(),
): TouchpointItem[] {
  const dayQs = dayQuestions.filter(q => q.dayNumber === dayNumber);
  return TOUCHPOINT_SLOTS.map(slot => {
    const q = dayQs.find(dq => dq.title === slot.title);
    if (!q) {
      return { id: slot.index, title: slot.title, state: 'pending' as const, block: slot.block };
    }
    const done = answeredIds.has(q.id);
    const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
    let state: TouchpointItem['state'] = 'pending';
    if (done) state = 'done';
    else if (access === 'locked') state = 'locked';
    else if (access === 'overdue') state = 'overdue';
    else if (access === 'open') state = 'active';
    return { id: q.id, title: q.title, state, block: q.block };
  });
}

export function touchpointCompletionRatio(
  touchpointQuestions: typeof questions.$inferSelect[],
  answeredIds: Set<number>,
): { completed: number; expected: number } {
  const expected = touchpointQuestions.length;
  const completed = touchpointQuestions.filter(q => answeredIds.has(q.id)).length;
  return { completed, expected: Math.max(expected, 1) };
}
