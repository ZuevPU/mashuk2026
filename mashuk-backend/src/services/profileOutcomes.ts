export function buildOutcomesHeuristic(input: {
  answersCount: number;
  tasksApproved: number;
  piggyTotal: number;
  piggyInWork: number;
  eveningNotes: string[];
  recentAnswerTexts?: string[];
}): string[] {
  // Profile «Что получилось» — краткий итог смены, не дословные цитаты из ответов.
  // Полный архив текстов — в разделе «Вопросы».
  const bullets: string[] = [];
  if (input.tasksApproved > 0) {
    bullets.push(`Выполнено заданий на форуме: ${input.tasksApproved}`);
  }
  if (input.answersCount >= 3) {
    bullets.push(`Рефлексия: ${input.answersCount} ответов на вопросы программы`);
  } else if (input.answersCount > 0) {
    bullets.push(
      `Рефлексия: ${input.answersCount} ответ${input.answersCount === 1 ? '' : 'а'} — тексты в «Вопросы»`,
    );
  }
  if (input.piggyTotal >= 1) {
    bullets.push(`Копилка: ${input.piggyTotal} записей (${input.piggyInWork} «в работу»)`);
  }
  const eveningUnique = uniqueNormalized(input.eveningNotes);
  if (eveningUnique.length > 0) {
    bullets.push(
      eveningUnique.length === 1
        ? 'Заполнена итоговая анкета дня — текст в «Вопросы»'
        : `Итоговых анкет дня: ${eveningUnique.length} — тексты в «Вопросы»`,
    );
  }
  if (bullets.length === 0) {
    bullets.push('Продолжайте отмечать идеи и отвечать на вопросы — итог сформируется по ходу смены.');
  }
  return uniqueNormalized(bullets).slice(0, 5);
}

function uniqueNormalized(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = String(line ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
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
  return uniqueNormalized(steps).slice(0, 5);
}

export function parseOutcomesForDisplay(outcomesEdited: unknown, heuristic: string[]): string[] {
  let raw: string[] = [];
  if (Array.isArray(outcomesEdited)) {
    raw = outcomesEdited.map(String).filter(Boolean);
  } else if (outcomesEdited && typeof outcomesEdited === 'object') {
    const o = outcomesEdited as { summary?: string; bullets?: string[] };
    if (Array.isArray(o.bullets) && o.bullets.length) raw = o.bullets.map(String);
    else if (typeof o.summary === 'string' && o.summary.trim()) raw = [o.summary.trim()];
  } else if (typeof outcomesEdited === 'string' && outcomesEdited.trim()) {
    raw = [outcomesEdited.trim()];
  } else {
    raw = heuristic.map(String);
  }
  return uniqueNormalized(raw).slice(0, 5);
}
