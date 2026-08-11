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
import { normalizeStateCheckPhase } from './questionVisibilityKeys.js';

type Q = typeof questions.$inferSelect;

function isStateCheck(q: Q): boolean {
  const kind = String(q.questionKind || q.reflectionKind || '').toLowerCase();
  const block = (q.block || '').toLowerCase();
  return q.type === 'checkin'
    || kind === 'state_check'
    || block.includes('проверк');
}

export function questionsAreVisibilityTwins(a: Q, b: Q): boolean {
  if (a.id === b.id) return true;
  if (a.shiftId != null && b.shiftId != null && a.shiftId !== b.shiftId) return false;

  const daysA = normalizeDayNumbers(a.dayNumbers, a.dayNumber);
  const daysB = normalizeDayNumbers(b.dayNumbers, b.dayNumber);
  if (!daysA.some(d => daysB.includes(d))) return false;

  // Проверки состояния: одна фаза (утро/день/вечер) на день = близнецы,
  // даже если timePoint пустой или заголовок чуть другой.
  if (isStateCheck(a) && isStateCheck(b)) {
    const pa = normalizeStateCheckPhase(a);
    const pb = normalizeStateCheckPhase(b);
    if (pa && pb && pa === pb) return true;
  }

  for (const slot of TOUCHPOINT_SLOTS) {
    if (questionMatchesTouchpointSlot(a, slot) && questionMatchesTouchpointSlot(b, slot)) {
      return true;
    }
  }

  const titleA = (a.title || '').trim().toLowerCase();
  const titleB = (b.title || '').trim().toLowerCase();
  if (titleA && titleB) {
    if (titleA === titleB) return true;
    // «Дневная проверка» ≈ «Дневная проверка состояния»
    if (titleA.includes(titleB) || titleB.includes(titleA)) {
      const kindA = String(a.questionKind || a.reflectionKind || '').toLowerCase();
      const kindB = String(b.questionKind || b.reflectionKind || '').toLowerCase();
      if (kindA && kindB && kindA === kindB) return true;
      if (isStateCheck(a) && isStateCheck(b)) return true;
    }
  }

  const kindA = String(a.questionKind || a.reflectionKind || '').toLowerCase();
  const kindB = String(b.questionKind || b.reflectionKind || '').toLowerCase();
  if (kindA && kindB && kindA === kindB && titleA && titleA === titleB) return true;

  return false;
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
