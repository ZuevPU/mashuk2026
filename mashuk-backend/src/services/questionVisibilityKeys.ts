import { normalizeDayNumbers } from './questionAdminHelpers.js';
import {
  isStateCheckQuestion,
  normalizeStateCheckPhase,
  questionMatchesTouchpointSlot,
} from './touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';

type QLike = {
  title?: string | null;
  type?: string | null;
  block?: string | null;
  timePoint?: string | null;
  questionKind?: string | null;
  reflectionKind?: string | null;
  dayNumber?: number | null;
  dayNumbers?: number[] | null;
  isHidden?: boolean | null;
};

export { isStateCheckQuestion, normalizeStateCheckPhase };

/** Keys used to suppress twins of admin-hidden questions in participant lists. */
export function visibilityKeysForQuestion(q: QLike): string[] {
  const days = normalizeDayNumbers(q.dayNumbers, q.dayNumber);
  const keys: string[] = [];
  const title = (q.title || '').trim().toLowerCase();
  const phase = normalizeStateCheckPhase(q);

  for (const d of days) {
    if (title) keys.push(`${d}:title:${title}`);
    // Шире, чем точный title: «Дневная проверка» / «Дневная проверка состояния»
    if (isStateCheckQuestion(q) && phase) {
      keys.push(`${d}:state:${phase}`);
    }
    for (const slot of TOUCHPOINT_SLOTS) {
      if (questionMatchesTouchpointSlot(q, slot)) {
        keys.push(`${d}:slot:${slot.index}`);
      }
    }
  }
  return keys;
}

/** If any question is hidden, its slot/title keys block unanswered twins. */
export function buildSuppressedVisibilityKeys(list: QLike[]): Set<string> {
  const keys = new Set<string>();
  for (const q of list) {
    if (q.isHidden !== true) continue;
    for (const k of visibilityKeysForQuestion(q)) keys.add(k);
  }
  return keys;
}

export function isSuppressedByHiddenTwin(q: QLike, suppressed: Set<string>): boolean {
  if (q.isHidden === true) return true;
  return visibilityKeysForQuestion(q).some(k => suppressed.has(k));
}
