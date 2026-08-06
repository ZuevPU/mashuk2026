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

export function normalizeOutcomeKey(line: string): string {
  return String(line ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Known summary phrasing from buildOutcomesHeuristic — never treat as verbatim quote. */
export function isSummaryOutcomeBullet(line: string): boolean {
  const t = normalizeOutcomeKey(line);
  if (!t) return false;
  return (
    /^выполнено заданий/.test(t)
    || /^рефлексия:\s*\d+/.test(t)
    || /^копилка:\s*\d+/.test(t)
    || /^заполнена итоговая анкета/.test(t)
    || /^итоговых анкет дня:/.test(t)
    || /итог сформируется по ходу смены/.test(t)
  );
}

/**
 * True when an outcomes bullet is a copy (or old 120/160-char slice) of a reflection /
 * evening note — leftover from the pre-9f061ee heuristic that pasted answer texts.
 */
export function isVerbatimReflectionBullet(line: string, reflectionTexts: string[]): boolean {
  const bullet = normalizeOutcomeKey(line);
  if (!bullet || bullet.length < 12 || isSummaryOutcomeBullet(bullet)) return false;
  for (const raw of reflectionTexts) {
    const ref = normalizeOutcomeKey(raw);
    if (!ref || ref.length < 12) continue;
    if (ref === bullet) return true;
    // Old heuristic used .slice(0, 160) / .slice(0, 120)
    if (ref.startsWith(bullet) && bullet.length >= 40) return true;
    if (bullet.startsWith(ref) && ref.length >= 40) return true;
    const slice160 = ref.slice(0, 160);
    const slice120 = ref.slice(0, 120);
    if (bullet === slice160 || bullet === slice120) return true;
  }
  return false;
}

export function extractRawOutcomeBullets(outcomesEdited: unknown): string[] {
  if (Array.isArray(outcomesEdited)) {
    return outcomesEdited.map(String).filter(Boolean);
  }
  if (outcomesEdited && typeof outcomesEdited === 'object') {
    const o = outcomesEdited as { summary?: string; bullets?: string[] };
    if (Array.isArray(o.bullets) && o.bullets.length) return o.bullets.map(String);
    if (typeof o.summary === 'string' && o.summary.trim()) return [o.summary.trim()];
  }
  if (typeof outcomesEdited === 'string' && outcomesEdited.trim()) {
    return [outcomesEdited.trim()];
  }
  return [];
}

/**
 * Cached outcomesEdited still holding pasted reflection quotes (common after
 * synthesize / old heuristic). Prefer heuristic when majority of bullets are verbatim.
 */
export function outcomesEditedLooksVerbatim(
  outcomesEdited: unknown,
  reflectionTexts: string[],
): boolean {
  const raw = uniqueNormalized(extractRawOutcomeBullets(outcomesEdited));
  if (!raw.length || !reflectionTexts.length) return false;
  const nonSummary = raw.filter(b => !isSummaryOutcomeBullet(b));
  if (!nonSummary.length) return false;
  const verbatimHits = nonSummary.filter(b => isVerbatimReflectionBullet(b, reflectionTexts)).length;
  return verbatimHits * 2 >= nonSummary.length;
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

export function parseOutcomesForDisplay(
  outcomesEdited: unknown,
  heuristic: string[],
  reflectionTexts: string[] = [],
): string[] {
  const hasEdited = extractRawOutcomeBullets(outcomesEdited).length > 0;
  let raw: string[] = hasEdited
    ? extractRawOutcomeBullets(outcomesEdited)
    : heuristic.map(String);

  raw = uniqueNormalized(raw);

  if (hasEdited && reflectionTexts.length > 0) {
    if (outcomesEditedLooksVerbatim(outcomesEdited, reflectionTexts)) {
      return uniqueNormalized(heuristic).slice(0, 5);
    }
    // Strip individual verbatim leaks but keep real admin/summary bullets
    raw = raw.filter(b => !isVerbatimReflectionBullet(b, reflectionTexts));
    if (raw.length === 0) return uniqueNormalized(heuristic).slice(0, 5);
  }

  return raw.slice(0, 5);
}
