import { normalizeSpeakerIds } from '../speakers/speakerFormat';
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
  hideFromHome: boolean;
  tagNames: string[];
  dayNumber: number;
  /** Empty = all directions. */
  audienceDirectionIds: number[];
  speakerIds: number[];
  hasSubSessions: boolean;
};

export function resolveDraftAudienceIds(e: ProgramEvent): number[] {
  const raw = e.audienceDirectionIds;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(Number).filter(n => Number.isInteger(n) && n > 0);
  }
  if (e.audienceType === 'direction' && e.audienceDirectionId) {
    return [e.audienceDirectionId];
  }
  return [];
}

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
    hideFromHome: false,
    tagNames: [],
    dayNumber,
    audienceDirectionIds: [],
    speakerIds: [],
    hasSubSessions: false,
  };
}

export function draftFromEvent(e: ProgramEvent): EventDraft {
  const { start, end } = parseTimeSlot(e.timeSlot);
  const tags = Array.isArray(e.tags) ? e.tags : [];
  const blockType = e.blockType === 'key_block' || e.isKeyBlock ? 'key_block' : (e.blockType || 'session');
  const speakerIds = normalizeSpeakerIds(e.speakerIds?.length ? e.speakerIds : e.speakers);
  return {
    title: e.title || '',
    place: e.place || '',
    description: e.description || '',
    descriptionHtml: e.descriptionHtml || e.description || '',
    timeStart: start,
    timeEnd: end,
    blockType,
    pushReminder: e.pushReminder !== false,
    hideFromHome: e.hideFromHome === true,
    tagNames: [...tags],
    dayNumber: e.dayNumber ?? 1,
    audienceDirectionIds: resolveDraftAudienceIds(e),
    speakerIds: [...speakerIds],
    hasSubSessions: e.hasSubSessions === true,
  };
}

export function draftToBody(draft: EventDraft, opts?: { publish?: boolean; dayPublished?: boolean; dayNumber?: number }) {
  const blockType = draft.blockType;
  const isKeyBlock = blockType === 'key_block';
  const dayNumber = opts?.dayNumber ?? draft.dayNumber;
  const ids = draft.audienceDirectionIds.filter(n => Number.isInteger(n) && n > 0);
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
    hideFromHome: draft.hideFromHome,
    dayNumber,
    audienceType: ids.length ? 'direction' : 'all',
    audienceDirectionId: ids[0] ?? null,
    audienceDirectionIds: ids,
    speakerIds: draft.speakerIds,
    hasSubSessions: draft.hasSubSessions,
    ...(opts?.publish ? {
      isPublished: true,
      ...(opts.dayPublished ? { dayPublished: true } : {}),
    } : {}),
  };
}
