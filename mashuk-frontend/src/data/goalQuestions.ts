import type { GoalAnswerType, GoalQuestion, GoalShowWhen } from './onboarding';

export const GOAL_OTHER_VALUE = '__other__';
export const GOAL_MULTI_SEP = ' · ';
export const MAX_GOAL_QUESTIONS = 24;
export const MIN_GOAL_OPTIONS = 2;

export function newGoalQuestionId(): string {
  return `gq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseMultiGoalAnswer(answer: string): string[] {
  if (!answer) return [];
  return answer.split(GOAL_MULTI_SEP).map(s => s.trim()).filter(Boolean);
}

export function joinMultiGoalAnswer(selected: string[]): string {
  return selected.join(GOAL_MULTI_SEP);
}

export function isOtherGoalAnswer(q: GoalQuestion, answer: string): boolean {
  const a = answer.trim();
  if (!a) return false;
  if (q.type === 'multi') {
    return parseMultiGoalAnswer(a).some(p => !q.options.includes(p));
  }
  return !q.options.includes(a);
}

export function goalAnswerMatchesTriggers(
  parent: GoalQuestion,
  parentAnswer: string,
  triggers: string[],
): boolean {
  const parts = parent.type === 'multi'
    ? parseMultiGoalAnswer(parentAnswer)
    : [String(parentAnswer ?? '').trim()].filter(Boolean);
  if (!parts.length || !triggers.length) return false;
  for (const trigger of triggers) {
    if (trigger === GOAL_OTHER_VALUE) {
      if (parts.some(p => !parent.options.includes(p))) return true;
    } else if (parts.includes(trigger)) {
      return true;
    }
  }
  return false;
}

export function isGoalQuestionVisible(
  questions: GoalQuestion[],
  answers: string[],
  index: number,
): boolean {
  const q = questions[index];
  if (!q) return false;
  if (!q.showWhen?.questionId || !q.showWhen.options?.length) return true;
  const parentIdx = questions.findIndex(x => x.id === q.showWhen!.questionId);
  if (parentIdx < 0 || parentIdx >= index) return false;
  if (!isGoalQuestionVisible(questions, answers, parentIdx)) return false;
  return goalAnswerMatchesTriggers(questions[parentIdx], answers[parentIdx] ?? '', q.showWhen.options);
}

export function pruneHiddenGoalAnswers(questions: GoalQuestion[], answers: string[]): string[] {
  const next = questions.map((_, i) => String(answers[i] ?? ''));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < questions.length; i++) {
      if (!isGoalQuestionVisible(questions, next, i) && next[i]) {
        next[i] = '';
        changed = true;
      }
    }
  }
  return next;
}

export function visibleGoalQuestionsFilled(questions: GoalQuestion[], answers: string[]): boolean {
  const pruned = pruneHiddenGoalAnswers(questions, answers);
  return questions.every((_, i) => {
    if (!isGoalQuestionVisible(questions, pruned, i)) return true;
    return (pruned[i] || '').trim().length > 0;
  });
}

export function coerceGoalQuestions(raw: unknown): GoalQuestion[] {
  const fallback: GoalQuestion[] = [
    'С какой целью ты приехал на Машук?',
    'Что ты хочешь получить от программы?',
    'Какой запрос ты хочешь принести своему направлению?',
    'Что для тебя было бы главным результатом этих 8 дней?',
    'Что ты ожидаешь от других участников?',
  ].map((text, i) => ({ id: `gq_default_${i + 1}`, text, type: 'open' as const, options: [] }));

  if (!Array.isArray(raw) || raw.length < 1) {
    return fallback.map(q => ({ ...q, options: [...q.options] }));
  }

  const usedIds = new Set<string>();
  const draft: Array<GoalQuestion & { showWhenRaw?: unknown }> = [];
  for (const item of raw.slice(0, MAX_GOAL_QUESTIONS)) {
    if (typeof item === 'string') {
      let id = newGoalQuestionId();
      while (usedIds.has(id)) id = newGoalQuestionId();
      usedIds.add(id);
      draft.push({ id, text: item, type: 'open', options: [] });
      continue;
    }
    if (!item || typeof item !== 'object') {
      let id = newGoalQuestionId();
      while (usedIds.has(id)) id = newGoalQuestionId();
      usedIds.add(id);
      draft.push({ id, text: '', type: 'open', options: [] });
      continue;
    }
    const obj = item as {
      id?: unknown;
      text?: unknown;
      type?: unknown;
      options?: unknown;
      allowOther?: unknown;
      otherLabel?: unknown;
      showWhen?: unknown;
    };
    let id = String(obj.id ?? '').trim();
    if (!id || usedIds.has(id)) id = newGoalQuestionId();
    usedIds.add(id);
    const typeRaw = String(obj.type ?? 'open');
    const type: GoalAnswerType = (typeRaw === 'choice' || typeRaw === 'multi') ? typeRaw : 'open';
    const options = Array.isArray(obj.options)
      ? obj.options.map(o => String(o ?? '').trim()).filter(Boolean)
      : [];
    const effectiveType: GoalAnswerType = (
      type !== 'open' && options.length >= MIN_GOAL_OPTIONS ? type : 'open'
    );
    const allowOther = effectiveType !== 'open' && obj.allowOther === true;
    draft.push({
      id,
      text: String(obj.text ?? ''),
      type: effectiveType,
      options: effectiveType === 'open' ? [] : options,
      allowOther: allowOther || undefined,
      otherLabel: allowOther
        ? (String(obj.otherLabel ?? '').trim() || 'Свой вариант')
        : undefined,
      showWhenRaw: obj.showWhen,
    });
  }

  const knownIds = new Set(draft.map(q => q.id));
  return draft.map((q, index) => {
    let showWhen: GoalShowWhen | null = null;
    const rawSw = q.showWhenRaw;
    if (rawSw && typeof rawSw === 'object') {
      const sw = rawSw as { questionId?: unknown; options?: unknown };
      const questionId = String(sw.questionId ?? '').trim();
      const options = Array.isArray(sw.options)
        ? sw.options.map(o => String(o ?? '').trim()).filter(Boolean)
        : [];
      const parentIdx = draft.findIndex(d => d.id === questionId);
      if (questionId && knownIds.has(questionId) && options.length && parentIdx >= 0 && parentIdx < index) {
        showWhen = { questionId, options };
      }
    }
    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      allowOther: q.allowOther,
      otherLabel: q.otherLabel,
      showWhen,
    };
  });
}
