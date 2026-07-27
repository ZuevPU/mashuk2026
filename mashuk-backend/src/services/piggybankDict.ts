/** Словарь копилки v11 — тег и источник независимы */

export const PIGGYBANK_TAGS = [
  'идея',
  'мысль',
  'вопрос',
  'контакт',
  'на будущее',
  'в работу',
] as const;

/** Служебный тег канала «Организаторам» (не из словаря копилки) */
export const ORG_TAG = 'организаторам';

export const PIGGYBANK_SOURCES = [
  'Направление',
  'Урок о важном',
  'Открытый урок',
  'Клуб',
  'Разговор с участником',
  'Своя мысль',
] as const;

export type PiggybankTag = (typeof PIGGYBANK_TAGS)[number];
export type PiggybankSource = (typeof PIGGYBANK_SOURCES)[number];

const TAG_ALIASES: Record<string, string> = {
  'забрать в работу': 'в работу',
  'подумать над этим': 'на будущее',
  'обсудить с командой': 'контакт',
};

const SOURCE_ALIASES: Record<string, string> = {
  'собственные размышления': 'Своя мысль',
  'блок программы': 'Направление',
  'общение с участниками': 'Разговор с участником',
  'общение со спикерами': 'Открытый урок',
};

export function normalizePiggybankTag(raw: string): string {
  const t = (raw || '').trim();
  if (t === ORG_TAG) return ORG_TAG;
  return TAG_ALIASES[t] || t;
}

export function normalizePiggybankSource(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  return SOURCE_ALIASES[s] || s;
}

export function isAllowedPiggybankTag(tag: string): boolean {
  if (tag === ORG_TAG) return true;
  return (PIGGYBANK_TAGS as readonly string[]).includes(tag);
}

export function isAllowedPiggybankSource(source: string | null): boolean {
  if (source == null) return false;
  return (PIGGYBANK_SOURCES as readonly string[]).includes(source);
}

export function pointsActionForTag(tag: string): string {
  if (tag === 'идея') return 'piggybank_idea';
  if (tag === 'мысль') return 'piggybank_thought';
  if (tag === 'вопрос') return 'piggybank_question';
  return 'piggybank_entry';
}

const TAG_POINTS_PRIORITY = ['идея', 'мысль', 'вопрос', 'в работу', 'на будущее', 'контакт'] as const;

/** Одно начисление по «главному» тегу записи */
export function pointsActionForTags(tags: string[]): string {
  const set = new Set(tags);
  for (const t of TAG_POINTS_PRIORITY) {
    if (set.has(t)) return pointsActionForTag(t);
  }
  if (tags[0]) return pointsActionForTag(tags[0]);
  return 'piggybank_entry';
}

export function normalizePiggybankTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : []);
  const out: string[] = [];
  for (const item of list) {
    const t = normalizePiggybankTag(String(item));
    if (!t || !isAllowedPiggybankTag(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

export type PiggybankEntryLike = {
  tag?: string | null;
  tags?: unknown;
};

export function entryTags(entry: PiggybankEntryLike): string[] {
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    return entry.tags.map(String).filter(Boolean);
  }
  if (entry.tag) return [entry.tag];
  return [];
}

export function primaryTag(entry: PiggybankEntryLike): string | null {
  const tags = entryTags(entry);
  return tags[0] ?? entry.tag ?? null;
}

export function entryHasTag(entry: PiggybankEntryLike, filterTag: string): boolean {
  const t = normalizePiggybankTag(filterTag);
  return entryTags(entry).includes(t);
}

export function formatTagsForExport(entry: PiggybankEntryLike): string {
  const tags = entryTags(entry);
  return tags.length ? tags.join(',') : (entry.tag || '—');
}
