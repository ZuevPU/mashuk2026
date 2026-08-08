/** Questions shown in profile «Мой запрос · Точка А» (goal + success criteria). */

export const POINT_A_REQUEST_CANONICAL = [
  'С какой главной целью ты приехал на эту программу?',
  'По каким признакам (критериям) в конце программы ты поймешь, что достиг цели?',
] as const;

export type PointARequestItem = {
  question: string;
  answer: string;
};

function isGoalQuestion(q: string): boolean {
  const t = q.toLowerCase();
  if (/признак|критери|достиг|пойм[её]шь/.test(t)) return false;
  return /главн\w*\s+цел|цел\w*.{0,60}приехал|приехал.{0,60}цел|с какой цел/.test(t);
}

function isCriteriaQuestion(q: string): boolean {
  const t = q.toLowerCase();
  return /признак|критери|достиг\w*.{0,40}цел|пойм[её]шь.{0,40}цел|пойм[её]шь.*программ/.test(t);
}

/**
 * Pick the two «request» onboarding answers with question labels for the profile card.
 * Matches by question text; falls back to the first two configured questions.
 */
export function buildPointARequestItems(
  questions: Array<string | { text?: string | null }> | null | undefined,
  answers: string[] | null | undefined,
): PointARequestItem[] {
  const qs = Array.isArray(questions)
    ? questions.map((q) => (
      typeof q === 'string' ? q.trim() : String(q?.text ?? '').trim()
    ))
    : [];
  const as = Array.isArray(answers) ? answers.map(a => String(a ?? '').trim()) : [];
  const pairs = qs.map((question, i) => ({
    question: question || POINT_A_REQUEST_CANONICAL[i] || `Вопрос ${i + 1}`,
    answer: as[i] || '',
  }));

  if (pairs.length === 0) {
    return POINT_A_REQUEST_CANONICAL
      .map((question, i) => ({ question, answer: as[i] || '' }))
      .filter(p => p.answer);
  }

  const goal = pairs.find(p => isGoalQuestion(p.question)) || pairs[0];
  const criteria = pairs.find(p => p !== goal && isCriteriaQuestion(p.question))
    || pairs.find(p => p !== goal)
    || null;

  const out: PointARequestItem[] = [];
  if (goal) out.push(goal);
  if (criteria) out.push(criteria);
  return out.slice(0, 2);
}
