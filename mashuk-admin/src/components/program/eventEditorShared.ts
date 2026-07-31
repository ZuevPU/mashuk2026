import { buildTimeSlot, parseTimeSlot, type ProgramEvent } from './types';

export type EventDraft = {
  title: string;
  place: string;
  description: string;
  descriptionHtml: string;
  timeStart: string;
  timeEnd: string;
  blockType: string;
  pushReminder: boolean;
  tagNames: string[];
  dayNumber: number;
  audienceType: 'all' | 'direction';
  audienceDirectionId: string;
  speakerIds: number[];
  hasSubSessions: boolean;
};

export function emptyEventDraft(dayNumber: number, timeStart = '09:00', timeEnd = '10:30'): EventDraft {
  return {
    title: '',
    place: '',
    description: '',
    descriptionHtml: '',
    timeStart,
    timeEnd,
    blockType: 'session',
    pushReminder: true,
    tagNames: [],
    dayNumber,
    audienceType: 'all',
    audienceDirectionId: '',
    speakerIds: [],
    hasSubSessions: false,
  };
}

export function draftFromEvent(e: ProgramEvent): EventDraft {
  const { start, end } = parseTimeSlot(e.timeSlot);
  const tags = Array.isArray(e.tags) ? e.tags : [];
  const blockType = e.blockType === 'key_block' || e.isKeyBlock ? 'key_block' : (e.blockType || 'session');
  const speakerIds = Array.isArray(e.speakerIds) ? e.speakerIds : (e.speakers?.map(s => s.id) ?? []);
  return {
    title: e.title || '',
    place: e.place || '',
    description: e.description || '',
    descriptionHtml: e.descriptionHtml || e.description || '',
    timeStart: start,
    timeEnd: end,
    blockType,
    pushReminder: e.pushReminder !== false,
    tagNames: [...tags],
    dayNumber: e.dayNumber ?? 1,
    audienceType: (e.audienceType === 'direction' ? 'direction' : 'all') as 'all' | 'direction',
    audienceDirectionId: e.audienceDirectionId ? String(e.audienceDirectionId) : '',
    speakerIds: [...speakerIds],
    hasSubSessions: e.hasSubSessions === true,
  };
}

export function draftToBody(draft: EventDraft, opts?: { publish?: boolean; dayPublished?: boolean; dayNumber?: number }) {
  const blockType = draft.blockType;
  const isKeyBlock = blockType === 'key_block';
  const dayNumber = opts?.dayNumber ?? draft.dayNumber;
  return {
    title: draft.title.trim(),
    place: draft.place.trim() || null,
    description: draft.description.trim() || null,
    descriptionHtml: draft.descriptionHtml.trim() || draft.description.trim() || null,
    timeSlot: buildTimeSlot(draft.timeStart, draft.timeEnd),
    tags: draft.tagNames,
    blockType: isKeyBlock ? 'key_block' : blockType,
    isKeyBlock,
    pushReminder: draft.pushReminder,
    dayNumber,
    audienceType: draft.audienceType,
    audienceDirectionId: draft.audienceType === 'direction' && draft.audienceDirectionId
      ? Number(draft.audienceDirectionId)
      : null,
    speakerIds: draft.speakerIds,
    hasSubSessions: draft.hasSubSessions,
    ...(opts?.publish ? {
      isPublished: true,
      ...(opts.dayPublished ? { dayPublished: true } : {}),
    } : {}),
  };
}
