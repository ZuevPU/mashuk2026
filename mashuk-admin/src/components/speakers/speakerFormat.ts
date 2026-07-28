import type { ProgramSpeaker } from '../program/types';

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
