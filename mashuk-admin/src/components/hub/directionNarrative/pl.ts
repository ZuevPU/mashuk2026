/** Склонение числительных: «2 вопроса», не «2 вопросов». */
export function pl(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const k = Math.abs(n) % 10;
  const word = m >= 11 && m <= 14 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many;
  return `${n} ${word}`;
}

export function pct(a: number, b: number): number {
  return b ? Math.round((a / b) * 100) : 0;
}
