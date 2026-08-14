/**
 * Классификация полей и агрегаты дашборда «Итоги форума».
 * Без БД — удобно тестировать на фикстурах.
 */
import type { EveningField } from '../eveningQuestionnaireConfig.js';
import {
  countNamed,
  formalSharePct,
  isFormalAnswer,
  lowSharePct,
  mean,
  round1,
  round2,
  scaleDist,
} from './dayResultsMetrics.js';

export type ForumFieldKind =
  | 'scale_block'
  | 'nps'
  | 'improve'
  | 'point_b'
  | 'role'
  | 'selfway'
  | 'plan_when'
  | 'nextstep'
  | 'psych'
  | 'rating_sys'
  | 'bot'
  | 'materials'
  | 'final'
  | 'choice'
  | 'yesno'
  | 'skip';

const STOP_WORDS = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она',
  'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее',
  'мне', 'было', 'вот', 'от', 'меня', 'еще', 'о', 'из', 'ему', 'теперь', 'когда', 'уже',
  'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей', 'может', 'они', 'тут', 'где',
  'есть', 'надо', 'ней', 'для', 'мы', 'тебя', 'их', 'чем', 'была', 'сам', 'чтоб', 'без',
  'будто', 'чего', 'раз', 'тоже', 'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот',
  'того', 'потому', 'этого', 'какой', 'совсем', 'ним', 'здесь', 'этом', 'один', 'почти',
  'мой', 'тем', 'чтобы', 'нее', 'сейчас', 'были', 'куда', 'зачем', 'сказать', 'всех',
  'никогда', 'сегодня', 'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть', 'после',
  'над', 'больше', 'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них', 'какая', 'много',
  'разве', 'три', 'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой', 'перед', 'иногда',
  'лучше', 'чуть', 'том', 'нельзя', 'такой', 'им', 'более', 'всегда', 'конечно', 'всю',
  'между', 'это', 'эта', 'этих', 'был', 'быть', 'ещё', 'очень', 'просто', 'также',
]);

export function classifyForumField(f: EveningField): ForumFieldKind {
  if (f.type === 'info_text') return 'skip';
  const label = (f.label || '').toLowerCase();
  const key = (f.key || '').toLowerCase();
  const blob = `${key} ${label}`;

  if (f.type === 'scale_1_10' && /рекоменд|nps|коллег|друзьям/.test(blob)) return 'nps';
  if (f.type === 'scale_1_5' && /рейтинг/.test(blob)) return 'rating_sys';
  if (f.type === 'scale_1_5' && /бот/.test(blob)) return 'bot';
  if (f.type === 'scale_1_5' || f.type === 'scale_1_10') {
    if (/движен\S* к своей цели|находишься в движен/.test(label)) return 'skip';
    return f.type === 'scale_1_10' ? 'nps' : 'scale_block';
  }

  if (f.type === 'role_select') return 'role';
  if (f.type === 'choice') {
    if (/точк\S* б|что произошло с целью|результат.? к которому/.test(blob)) return 'point_b';
    if (/роль|способ.? действ/.test(blob) && !/понял/.test(blob)) return 'role';
    if (/когда|срок|48 час|14 дн|перв(ый|ого) шаг/.test(blob)) return 'plan_when';
    return 'choice';
  }

  if (f.type === 'yes_no') {
    if (/психолог/.test(blob)) return 'psych';
    if (/рейтинг/.test(blob)) return 'rating_sys';
    if (/материал/.test(blob)) return 'materials';
    if (/бот/.test(blob)) return 'bot';
    return 'yesno';
  }

  if (f.type === 'text' || f.type === 'experiment_text') {
    if (/психолог/.test(blob)) return 'psych';
    if (/бот/.test(blob)) return 'bot';
    if (/материал/.test(blob)) return 'materials';
    if (/сделать.? чтобы|оценк\S* стал\S* выше|улучш/.test(blob)) return 'improve';
    if (/способ.? действов|понял\S* о сво/.test(blob)) return 'selfway';
    if (/перв(ый|ого) шаг|ожидан|выпускник/.test(blob)) return 'nextstep';
    if (/впечатлен|главн\S* тезис|свободн|итог/.test(blob)) return 'final';
    return 'final';
  }

  return 'skip';
}

export function numScale(raw: unknown, maxScale: number, minScale = 1): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < minScale || num > maxScale) return null;
  return num;
}

export function yesNoValue(raw: unknown): boolean | null {
  if (raw === true || raw === 'true' || raw === 'yes' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 'no' || raw === 0 || raw === '0') return false;
  return null;
}

/** True if the row has any answer among the marked forum-final fields. */
export function rowHasForumFinalAnswer(
  ratings: Record<string, unknown>,
  fields: EveningField[],
): boolean {
  for (const field of fields) {
    const raw = ratings[field.key];
    if (raw == null || raw === '') continue;
    if (typeof raw === 'string' && !raw.trim()) continue;
    return true;
  }
  return false;
}

export function textValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

export type ForumQuote = { text: string; meta: string };

export function collectQuotes(
  rows: Array<{ ratings: Record<string, unknown>; direction?: string }>,
  fieldKey: string,
  opts?: { minLen?: number; limit?: number; label?: string },
): ForumQuote[] {
  const minLen = opts?.minLen ?? 12;
  const limit = opts?.limit ?? 80;
  const pool: Array<ForumQuote & { len: number }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t = textValue(r.ratings[fieldKey]);
    if (!t || t.length < minLen || isFormalAnswer(t)) continue;
    const id = t.slice(0, 80);
    if (seen.has(id)) continue;
    seen.add(id);
    pool.push({
      text: t.slice(0, 400),
      meta: [opts?.label, r.direction].filter(Boolean).join(' · '),
      len: t.length,
    });
  }
  return pool
    .sort((a, b) => b.len - a.len)
    .slice(0, limit)
    .map(({ text, meta }) => ({ text, meta }));
}

export type ForumNps = {
  n: number;
  mean: number;
  criticsPct: number;
  passivePct: number;
  promotersPct: number;
  score: number;
  fieldKey: string;
  fieldLabel: string;
};

export function buildForumNps(
  rows: Array<{ ratings: Record<string, unknown> }>,
  field: EveningField,
): ForumNps | null {
  const vals: number[] = [];
  for (const r of rows) {
    const n = numScale(r.ratings[field.key], 10, 0);
    if (n != null) vals.push(n);
  }
  if (!vals.length) return null;
  const critics = vals.filter(v => v <= 6).length;
  const passive = vals.filter(v => v === 7 || v === 8).length;
  const promoters = vals.filter(v => v >= 9).length;
  const n = vals.length;
  const criticsPct = round1((critics / n) * 100);
  const passivePct = round1((passive / n) * 100);
  const promotersPct = round1((promoters / n) * 100);
  return {
    n,
    mean: mean(vals) ?? 0,
    criticsPct,
    passivePct,
    promotersPct,
    score: round1(promotersPct - criticsPct),
    fieldKey: field.key,
    fieldLabel: field.label || field.key,
  };
}

export type ForumChoiceDist = {
  key: string;
  label: string;
  kind: ForumFieldKind;
  n: number;
  items: Array<{ name: string; n: number; pct: number }>;
};

export function buildChoiceDist(
  rows: Array<{ ratings: Record<string, unknown> }>,
  field: EveningField,
  kind: ForumFieldKind,
): ForumChoiceDist {
  const values: string[] = [];
  for (const r of rows) {
    if (field.type === 'yes_no') {
      const yn = yesNoValue(r.ratings[field.key]);
      if (yn === true) values.push('Да');
      else if (yn === false) values.push('Нет');
      continue;
    }
    const t = textValue(r.ratings[field.key]);
    if (t) values.push(t);
  }
  const counted = countNamed(values);
  const tot = counted.reduce((a, c) => a + c.n, 0) || 1;
  return {
    key: field.key,
    label: field.label || field.key,
    kind,
    n: values.length,
    items: counted.map(c => ({ name: c.name, n: c.n, pct: Math.round((c.n / tot) * 100) })),
  };
}

export type ForumScaleBlock = {
  key: string;
  label: string;
  n: number;
  mean: number;
  dist: number[];
  low: number;
};

export function buildScaleBlock(
  rows: Array<{ ratings: Record<string, unknown> }>,
  field: EveningField,
): ForumScaleBlock | null {
  const maxScale = field.type === 'scale_1_10' ? 10 : 5;
  const vals: number[] = [];
  for (const r of rows) {
    const n = numScale(r.ratings[field.key], maxScale);
    if (n != null) vals.push(n);
  }
  if (!vals.length) return null;
  const dist = scaleDist(vals, maxScale === 10 ? 10 : 5);
  const dist5 = maxScale === 5
    ? dist
    : [
      dist.slice(0, 2).reduce((a, b) => a + b, 0),
      dist.slice(2, 4).reduce((a, b) => a + b, 0),
      dist.slice(4, 6).reduce((a, b) => a + b, 0),
      dist.slice(6, 8).reduce((a, b) => a + b, 0),
      dist.slice(8, 10).reduce((a, b) => a + b, 0),
    ];
  const low = maxScale === 5
    ? lowSharePct(dist)
    : round1(((dist[0] + dist[1] + dist[2]) / vals.length) * 100);
  return {
    key: field.key,
    label: field.label || field.key,
    n: vals.length,
    mean: mean(vals) ?? 0,
    dist: dist5,
    low,
  };
}

export function buildTagCloud(texts: string[], limit = 8): Array<{ word: string; n: number }> {
  const map = new Map<string, number>();
  for (const raw of texts) {
    const words = raw
      .toLowerCase()
      .replace(/[«»""„().,!?:;—–-]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
    const uniq = new Set(words);
    for (const w of uniq) map.set(w, (map.get(w) || 0) + 1);
  }
  return [...map.entries()]
    .map(([word, n]) => ({ word, n }))
    .sort((a, b) => b.n - a.n || a.word.localeCompare(b.word, 'ru'))
    .slice(0, limit);
}

export function yesSharePct(
  rows: Array<{ ratings: Record<string, unknown> }>,
  fieldKey: string,
): { n: number; yesPct: number } | null {
  let yes = 0;
  let n = 0;
  for (const r of rows) {
    const v = yesNoValue(r.ratings[fieldKey]);
    if (v == null) continue;
    n += 1;
    if (v) yes += 1;
  }
  if (!n) return null;
  return { n, yesPct: Math.round((yes / n) * 100) };
}

export function scaleMean(
  rows: Array<{ ratings: Record<string, unknown> }>,
  fieldKey: string,
  maxScale = 5,
): { n: number; mean: number } | null {
  const vals: number[] = [];
  for (const r of rows) {
    const n = numScale(r.ratings[fieldKey], maxScale);
    if (n != null) vals.push(n);
  }
  if (!vals.length) return null;
  return { n: vals.length, mean: mean(vals) ?? 0 };
}

export function clusterSimilarTexts(texts: string[], limit = 6): Array<{ name: string; n: number }> {
  const counted = countNamed(texts.filter(t => t && !isFormalAnswer(t)));
  const substantial = counted.filter(c => c.name.length >= 18);
  if (substantial.length >= 3) return substantial.slice(0, limit);
  return counted.slice(0, limit);
}

export function formalShareOfFields(
  rows: Array<{ ratings: Record<string, unknown> }>,
  fields: EveningField[],
): number {
  const shares: number[] = [];
  for (const f of fields) {
    const texts = rows.map(r => textValue(r.ratings[f.key])).filter(Boolean);
    if (texts.length) shares.push(formalSharePct(texts));
  }
  if (!shares.length) return 0;
  return round1(shares.reduce((a, b) => a + b, 0) / shares.length);
}

export { round1, round2, mean };
