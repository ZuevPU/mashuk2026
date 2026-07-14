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
