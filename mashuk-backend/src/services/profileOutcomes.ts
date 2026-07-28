export function buildOutcomesHeuristic(input: {
  answersCount: number;
  tasksApproved: number;
  piggyTotal: number;
  piggyInWork: number;
  eveningNotes: string[];
  recentAnswerTexts?: string[];
}): string[] {
  const bullets: string[] = [];
  if (input.tasksApproved > 0) {
    bullets.push(`Выполнено заданий на форуме: ${input.tasksApproved}`);
  }
  if (input.answersCount >= 1 && input.recentAnswerTexts?.length) {
    for (const t of input.recentAnswerTexts.slice(0, 3)) {
      if (t.trim()) bullets.push(t.trim().slice(0, 160));
    }
  } else if (input.answersCount >= 3) {
    bullets.push(`Рефлексия: ${input.answersCount} ответов на вопросы программы`);
  } else if (input.answersCount > 0) {
    bullets.push(`Рефлексия: ${input.answersCount} ответ${input.answersCount === 1 ? '' : 'а'} — тексты в «Общение» → «Мои ответы»`);
  }
  if (input.piggyTotal >= 2) {
    bullets.push(`Копилка: ${input.piggyTotal} записей (${input.piggyInWork} «в работу»)`);
  }
  for (const note of input.eveningNotes.slice(0, 2)) {
    if (note.trim()) bullets.push(note.trim().slice(0, 120));
  }
  if (bullets.length === 0) {
    bullets.push('Продолжайте отмечать идеи и отвечать на вопросы — итог сформируется по ходу смены.');
  }
  return bullets.slice(0, 5);
}

export function buildNextStepsFromSources(input: {
  piggyPlans: string[];
  nextExperiment: string | null;
  pointBNextStep: string | null;
  fallbackTasks: string[];
}): string[] {
  const steps: string[] = [];
  for (const t of input.piggyPlans) {
    if (steps.length >= 5) break;
    steps.push(t);
  }
  if (input.nextExperiment?.trim()) steps.push(input.nextExperiment.trim());
  if (input.pointBNextStep?.trim()) steps.push(input.pointBNextStep.trim());
  for (const t of input.fallbackTasks) {
    if (steps.length >= 5) break;
    if (!steps.includes(t)) steps.push(t);
  }
  return steps.slice(0, 5);
}

export function parseOutcomesForDisplay(outcomesEdited: unknown, heuristic: string[]): string[] {
  if (Array.isArray(outcomesEdited)) {
    return outcomesEdited.map(String).filter(Boolean).slice(0, 8);
  }
  if (outcomesEdited && typeof outcomesEdited === 'object') {
    const o = outcomesEdited as { summary?: string; bullets?: string[] };
    if (Array.isArray(o.bullets) && o.bullets.length) return o.bullets.map(String);
    if (typeof o.summary === 'string' && o.summary.trim()) return [o.summary.trim()];
  }
  if (typeof outcomesEdited === 'string' && outcomesEdited.trim()) return [outcomesEdited.trim()];
  return heuristic;
}
