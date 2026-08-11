/**
 * Скрытие вопроса должно убирать и «близнецов» (тот же слот/день/смена),
 * иначе в приложении остаётся другой published id с тем же заголовком.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { questions } from '../db/schema.js';
import { normalizeDayNumbers } from './questionAdminHelpers.js';
import { questionMatchesTouchpointSlot } from './touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';

type Q = typeof questions.$inferSelect;

export function questionsAreVisibilityTwins(a: Q, b: Q): boolean {
  if (a.id === b.id) return true;
  if (a.shiftId != null && b.shiftId != null && a.shiftId !== b.shiftId) return false;

  const daysA = normalizeDayNumbers(a.dayNumbers, a.dayNumber);
  const daysB = normalizeDayNumbers(b.dayNumbers, b.dayNumber);
  if (!daysA.some(d => daysB.includes(d))) return false;

  for (const slot of TOUCHPOINT_SLOTS) {
    if (questionMatchesTouchpointSlot(a, slot) && questionMatchesTouchpointSlot(b, slot)) {
      return true;
    }
  }

  const titleA = (a.title || '').trim().toLowerCase();
  const titleB = (b.title || '').trim().toLowerCase();
  if (!titleA || titleA !== titleB) return false;

  const kindA = String(a.questionKind || a.reflectionKind || '').toLowerCase();
  const kindB = String(b.questionKind || b.reflectionKind || '').toLowerCase();
  if (kindA && kindB && kindA === kindB) return true;

  const blockA = (a.block || '').trim().toLowerCase();
  const blockB = (b.block || '').trim().toLowerCase();
  return Boolean(blockA && blockA === blockB);
}

/** Apply isHidden to the question and all non-archived twins on the same shift. */
export async function setQuestionHiddenCascade(
  questionId: number,
  isHidden: boolean,
): Promise<{ ids: number[]; count: number }> {
  const [target] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!target) return { ids: [], count: 0 };

  const siblings = await db.select().from(questions).where(and(
    target.shiftId != null ? eq(questions.shiftId, target.shiftId) : eq(questions.id, target.id),
    ne(questions.status, 'archived'),
  ));

  const twinIds = [...new Set(
    siblings
      .filter(s => questionsAreVisibilityTwins(target, s))
      .map(s => s.id),
  )];

  if (!twinIds.length) twinIds.push(target.id);

  await db.update(questions)
    .set({ isHidden })
    .where(inArray(questions.id, twinIds));

  return { ids: twinIds, count: twinIds.length };
}
