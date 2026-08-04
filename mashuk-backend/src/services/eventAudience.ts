/** Normalize jsonb / API payload into unique positive direction ids. */
export function normalizeAudienceDirectionIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

export type EventAudienceFields = {
  audienceType?: string | null;
  audienceDirectionId?: number | null;
  audienceDirectionIds?: unknown;
};

/**
 * Effective direction allow-list for a program event.
 * Empty → all participants. Legacy single-id rows are still supported.
 */
export function resolveEventAudienceDirectionIds(event: EventAudienceFields): number[] {
  const fromArr = normalizeAudienceDirectionIds(event.audienceDirectionIds);
  if (fromArr.length) return fromArr;
  if (event.audienceType === 'direction' && event.audienceDirectionId) {
    return [event.audienceDirectionId];
  }
  return [];
}

/** Participant sees the block if it is for everyone or includes their direction. */
export function eventVisibleForParticipantDirection(
  event: EventAudienceFields,
  participantDirectionId: number | null | undefined,
): boolean {
  const ids = resolveEventAudienceDirectionIds(event);
  if (!ids.length) return true;
  if (participantDirectionId == null) return true;
  return ids.includes(participantDirectionId);
}

/** Persist multi-select + keep legacy columns in sync. */
export function audienceWriteFields(input: {
  audienceDirectionIds?: number[] | null;
  audienceType?: 'all' | 'direction' | string | null;
  audienceDirectionId?: number | null;
}): {
  audienceType: 'all' | 'direction';
  audienceDirectionId: number | null;
  audienceDirectionIds: number[];
} {
  let ids = normalizeAudienceDirectionIds(input.audienceDirectionIds);
  if (
    !ids.length
    && input.audienceType === 'direction'
    && input.audienceDirectionId
    && Number.isInteger(input.audienceDirectionId)
    && input.audienceDirectionId > 0
  ) {
    ids = [input.audienceDirectionId];
  }
  if (!ids.length) {
    return { audienceType: 'all', audienceDirectionId: null, audienceDirectionIds: [] };
  }
  return {
    audienceType: 'direction',
    audienceDirectionId: ids[0],
    audienceDirectionIds: ids,
  };
}
