import type { ProgramSpeaker } from '../program/types';

export function normalizeSpeakerIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const n = item != null && typeof item === 'object' && 'id' in item
      ? Number((item as { id: unknown }).id)
      : Number(item);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function speakerNamesFromCatalog(
  ids: number[],
  speakers: ProgramSpeaker[],
  fallback?: string | null,
): string {
  const byId = new Map(speakers.map(s => [s.id, s]));
  const names = ids.map(id => byId.get(id)?.name?.trim()).filter((n): n is string => !!n);
  if (names.length) return names.join('; ');
  return fallback?.trim() || '';
}

export function speakerSearchHaystack(s: ProgramSpeaker): string {
  return [s.name, s.credentials, s.initials].filter(Boolean).join(' ').toLowerCase();
}

/** Короткая подпись в расписании и превью */
export function speakerShortLabel(s: ProgramSpeaker): string {
  return s.name;
}

/** Полная подпись с регалиями */
export function speakerFullLabel(s: ProgramSpeaker): string {
  const cred = s.credentials?.trim();
  return cred ? `${s.name} — ${cred}` : s.name;
}
