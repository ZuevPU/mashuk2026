import type { participants } from '../db/schema.js';

type ParticipantRow = typeof participants.$inferSelect;

export type PlaceholderContext = {
  programDay?: number | null;
  eventTitle?: string | null;
};

const PLACEHOLDER_RE = /\{ФИО\}|\{День\}|\{Роль\}|\{Событие\}/g;

export function expandPushPlaceholders(
  template: string,
  participant: Pick<ParticipantRow, 'firstName' | 'lastName' | 'pedagogicalRole'>,
  ctx: PlaceholderContext = {},
): string {
  const fio = `${participant.firstName ?? ''} ${participant.lastName ?? ''}`.trim() || 'Участник';
  const day = ctx.programDay != null ? `Д${ctx.programDay}` : 'День';
  const role = participant.pedagogicalRole?.trim() || 'Участник';
  const event = ctx.eventTitle?.trim() || 'Событие';

  return template
    .replace(/\{ФИО\}/g, fio)
    .replace(/\{День\}/g, day)
    .replace(/\{Роль\}/g, role)
    .replace(/\{Событие\}/g, event);
}

export function placeholdersInText(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}
