import { topReasonTokens } from './zoneDistribution.js';

export function templateDailyObservation(input: {
  day: number | null;
  depthCounts: Record<string, number>;
  topTerms: { token: string; count: number }[];
  corpusSize: number;
}): string {
  const dayLabel = input.day ? `D${input.day}` : 'смены';
  const terms = input.topTerms.slice(0, 5).map(t => t.token).join(', ') || '—';
  return `За ${dayLabel}: обработано ${input.corpusSize} текстов. `
    + `Слои глубины — фиксация ${input.depthCounts['Фиксация события'] || 0}, `
    + `личный вывод ${input.depthCounts['Личный вывод'] || 0}, `
    + `перенос ${input.depthCounts['Перенос в практику'] || 0}. `
    + `Частые темы: ${terms}. (Эвристика, без LLM.)`;
}

export function compareTermSets(
  earlyTexts: string[],
  lateTexts: string[],
  limit = 12,
): { earlyTop: { token: string; count: number }[]; lateTop: { token: string; count: number }[]; emerging: string[] } {
  const earlyTop = topReasonTokens(earlyTexts, limit);
  const lateTop = topReasonTokens(lateTexts, limit);
  const earlySet = new Set(earlyTop.map(t => t.token));
  const emerging = lateTop.filter(t => !earlySet.has(t.token)).slice(0, 8).map(t => t.token);
  return { earlyTop, lateTop, emerging };
}

export function termsByDayMap(
  textsByDay: Map<number, string[]>,
  limit = 10,
): { day: number; terms: { token: string; count: number }[] }[] {
  return [...textsByDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, texts]) => ({ day, terms: topReasonTokens(texts, limit) }));
}

export function newTokensOnDay(
  textsByDay: Map<number, string[]>,
  targetDay: number,
  limit = 12,
): { token: string; count: number }[] {
  const prior: string[] = [];
  for (const [day, texts] of textsByDay) {
    if (day < targetDay) prior.push(...texts);
  }
  const priorSet = new Set(topReasonTokens(prior, 40).map(t => t.token));
  const dayTexts = textsByDay.get(targetDay) ?? [];
  return topReasonTokens(dayTexts, limit).filter(t => !priorSet.has(t.token));
}
