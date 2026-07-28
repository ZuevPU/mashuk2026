import { eq } from 'drizzle-orm';
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
    return q.type === 'checkin' || q.questionKind === 'state_check';
  }

  if (slot.title === 'Осмысление по направлению') {
    const title = (q.title || '').toLowerCase();
    if (title.includes('осмысление урока') || title.includes('слот')) return false;
    return q.block === 'Точки осмысления' && q.timePoint === 'день' && q.type === 'open';
  }

  if (slot.title.startsWith('Осмысление урока')) {
    const title = (q.title || '').toLowerCase();
    if (slot.title.includes('слот 1')) {
      return title.includes('слот 1') || (title.includes('осмысление урока') && !title.includes('слот 2'));
    }
    return title.includes('слот 2');
  }

  if (slot.title === 'Итоговая анкета по дню') {
    return q.block === 'Итоги дня' || (q.block || '').includes('Итог');
  }

  return false;
}

export function findTouchpointQuestionForSlot(
  candidates: QuestionRow[],
  slot: TouchpointSlot,
): QuestionRow | undefined {
  const exact = candidates.find(q => (q.title || '').trim() === slot.title);
  if (exact) return exact;
  const matched = candidates.filter(q => questionMatchesTouchpointSlot(q, slot));
  if (matched.length === 0) return undefined;
  return matched.sort((a, b) => a.id - b.id)[0];
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

export async function loadPublishedTouchpointQuestions(currentDay: number) {
  const list = await db.select().from(questions).where(eq(questions.status, 'published'));
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
    const q = findTouchpointQuestionForSlot(dayQs, slot);
    if (!q) {
      return { id: slot.index, title: slot.title, state: 'pending' as const, block: slot.block };
    }
    const done = answeredIds.has(q.id);
    const accessDay = resolveQuestionDayForAccess(q, currentDay);
    const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
    let state: TouchpointItem['state'] = 'pending';
    if (done) state = 'done';
    else if (access === 'locked') state = 'locked';
    else if (access === 'overdue') state = 'overdue';
    else if (access === 'open') state = 'active';
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
    const q = findTouchpointQuestionForSlot(dayQs, slot);
    if (q && answeredIds.has(q.id)) completed += 1;
  }
  return { completed, expected: TOUCHPOINT_SLOTS.length };
}
