/** Токенизация ответов для облака тегов: без предлогов, союзов, междометий. */

const RU_STOP = new Set([
  // предлоги
  'в', 'во', 'на', 'над', 'под', 'к', 'ко', 'от', 'ото', 'из', 'изо', 'у', 'с', 'со', 'по', 'про',
  'для', 'без', 'до', 'за', 'через', 'при', 'между', 'среди', 'около', 'возле', 'перед', 'после',
  'кроме', 'вместо', 'вроде', 'насчёт', 'насчет', 'благодаря', 'согласно', 'вопреки',
  // союзы
  'и', 'а', 'но', 'да', 'или', 'либо', 'ни', 'что', 'чтобы', 'как', 'если', 'когда', 'пока',
  'хотя', 'потому', 'также', 'тоже', 'зато', 'однако', 'ведь', 'будто', 'словно', 'чем',
  'либо', 'причем', 'причём', 'то', 'ли',
  // частицы / местоимения / связки
  'не', 'ни', 'бы', 'б', 'же', 'ж', 'вот', 'вон', 'даже', 'уже', 'ещё', 'еще', 'только',
  'лишь', 'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те', 'там', 'тут', 'здесь', 'так',
  'такой', 'такая', 'такие', 'весь', 'вся', 'все', 'всё', 'сам', 'сама', 'сами',
  'я', 'мы', 'ты', 'вы', 'он', 'она', 'оно', 'они', 'мне', 'меня', 'нас', 'вас', 'его', 'её', 'ее', 'их',
  'мой', 'моя', 'мои', 'наш', 'наша', 'наши', 'ваш', 'своя', 'свой', 'свои',
  'кто', 'кого', 'кому', 'чем', 'чего', 'где', 'куда', 'откуда', 'почему', 'зачем', 'какой', 'какая', 'какие',
  'есть', 'быть', 'был', 'была', 'были', 'будет', 'быть', 'можно', 'нужно', 'надо', 'очень',
  'просто', 'типа', 'короче', 'вообще', 'именно', 'именно', 'кажется', 'типа',
  // междометия / мусор
  'ах', 'ох', 'эх', 'ой', 'ай', 'ну', 'ага', 'угу', 'эм', 'эээ', 'мм', 'хм', 'блин', 'типа',
  'типа', 'короче', 'ладно', 'ок', 'окей', 'yes', 'no', 'the', 'and', 'or', 'a', 'an', 'of', 'to', 'in',
]);

export function extractAnswerPlainText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (Array.isArray(data)) {
    return data.map(v => extractAnswerPlainText(v)).filter(Boolean).join(' ');
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ['text', 'reason', 'answer', 'value', 'comment', 'note', 'freeNote', 'mainThesis']) {
      if (typeof o[key] === 'string' && (o[key] as string).trim()) parts.push(String(o[key]));
    }
    if (Array.isArray(o.values)) parts.push(...o.values.map(v => extractAnswerPlainText(v)));
    if (Array.isArray(o.selected)) parts.push(...o.selected.map(v => extractAnswerPlainText(v)));
    if (parts.length) return parts.join(' ');
    try { return JSON.stringify(o); } catch { return ''; }
  }
  return '';
}

export function tokenizeForTagCloud(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s/|]+/)
    .map(w => w.replace(/^-+|-+$/g, ''))
    .filter(w => w.length >= 3 && !RU_STOP.has(w) && !/^\d+$/.test(w));
}

export function buildTagCloudTokens(
  answerDatas: unknown[],
  limit = 50,
): { token: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const data of answerDatas) {
    const text = extractAnswerPlainText(data);
    if (!text.trim()) continue;
    for (const w of tokenizeForTagCloud(text)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  const max = Math.min(Math.max(1, limit), 80);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, max)
    .map(([token, count]) => ({ token, count }));
}
