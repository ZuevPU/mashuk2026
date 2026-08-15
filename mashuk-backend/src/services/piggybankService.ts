import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, piggybank, pointsLog } from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import {
  normalizePiggybankTags,
  normalizePiggybankSource,
  isAllowedPiggybankSource,
  ORG_TAG,
  pointsActionForTags,
} from './piggybankDict.js';
import { awardPoints, revokePointsLogEntry } from './pointsService.js';

const PIGGY_ACTION_TYPES = [
  'piggybank_idea',
  'piggybank_thought',
  'piggybank_question',
  'piggybank_entry',
] as const;

export function filterPiggybankEntries<T extends { source?: string | null; text: string; forumDay?: number | null }>(
  entries: T[],
  query: { tag?: string; source?: string; day?: number; q?: string },
  tagFn: (e: T, tag: string) => boolean,
): T[] {
  const q = query.q?.trim().slice(0, 100).toLowerCase();
  const day = query.day != null ? Number(query.day) : undefined;
  return entries.filter(e => {
    if (query.tag && !tagFn(e, query.tag)) return false;
    if (query.source && e.source !== query.source) return false;
    if (day != null && !Number.isNaN(day) && e.forumDay !== day) return false;
    if (q && !e.text.toLowerCase().includes(q)) return false;
    return true;
  });
}

export async function resolveForumDayForNewEntry(shiftId?: number | null): Promise<number> {
  const settings = await getForumSettings(shiftId);
  return resolveEffectiveCurrentDay(settings);
}

export async function createPiggybankEntry(input: {
  participantId: number;
  text: string;
  tags: unknown;
  source: unknown;
  forumDay?: number;
}): Promise<typeof piggybank.$inferSelect> {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text required');

  const tags = normalizePiggybankTags(input.tags);
  if (tags.length === 0) throw new Error('tags required');

  let source = normalizePiggybankSource(input.source != null ? String(input.source) : null);
  const contactOnly = tags.length === 1 && tags[0] === 'контакт';
  if (tags.includes(ORG_TAG)) {
    source = source || 'Своя мысль';
  } else if (contactOnly) {
    if (source != null && !isAllowedPiggybankSource(source)) {
      throw new Error('source required');
    }
  } else if (!source || !isAllowedPiggybankSource(source)) {
    throw new Error('source required');
  }

  const [owner] = input.forumDay != null
    ? [null]
    : await db.select({ shiftId: participants.shiftId })
      .from(participants)
      .where(eq(participants.id, input.participantId))
      .limit(1);
  const forumDay = input.forumDay ?? await resolveForumDayForNewEntry(owner?.shiftId);

  const [entry] = await db.insert(piggybank).values({
    participantId: input.participantId,
    tag: tags[0],
    tags,
    text,
    source,
    forumDay,
  }).returning();

  const awarded = await awardPoints(
    input.participantId,
    pointsActionForTags(tags),
    undefined,
    forumDay ?? undefined,
  );
  if (awarded?.logId) {
    const [updated] = await db.update(piggybank)
      .set({ pointsLogId: awarded.logId })
      .where(eq(piggybank.id, entry.id))
      .returning();
    return updated ?? entry;
  }
  return entry;
}

/** Find linked or nearest unrevoked piggybank points log for an entry. */
export async function resolvePiggybankPointsLogId(
  entry: typeof piggybank.$inferSelect,
): Promise<number | null> {
  if (entry.pointsLogId) {
    const [row] = await db.select({ id: pointsLog.id, revokedAt: pointsLog.revokedAt })
      .from(pointsLog)
      .where(eq(pointsLog.id, entry.pointsLogId))
      .limit(1);
    if (row && !row.revokedAt) return row.id;
    if (row?.revokedAt) return null;
  }

  const created = entry.createdAt ? new Date(entry.createdAt) : new Date();
  const from = new Date(created.getTime() - 15 * 60_000);
  const to = new Date(created.getTime() + 15 * 60_000);
  const conditions = [
    eq(pointsLog.participantId, entry.participantId),
    isNull(pointsLog.revokedAt),
    gte(pointsLog.points, 1),
    gte(pointsLog.createdAt, from),
    lte(pointsLog.createdAt, to),
    inArray(pointsLog.actionType, [...PIGGY_ACTION_TYPES]),
  ];
  if (entry.forumDay != null) {
    conditions.push(eq(pointsLog.forumDay, entry.forumDay));
  }

  const [hit] = await db.select({ id: pointsLog.id })
    .from(pointsLog)
    .where(and(...conditions))
    .orderBy(desc(pointsLog.createdAt))
    .limit(1);
  return hit?.id ?? null;
}

export async function softDeletePiggybankEntry(
  entryId: number,
  reason = 'Удаление записи копилки администратором',
): Promise<{
  entry: typeof piggybank.$inferSelect;
  pointsRevoked: boolean;
  pointsLogId: number | null;
  revokeError?: string;
}> {
  const [existing] = await db.select().from(piggybank)
    .where(and(eq(piggybank.id, entryId), isNull(piggybank.deletedAt)))
    .limit(1);
  if (!existing) throw new Error('Not found');

  const logId = await resolvePiggybankPointsLogId(existing);
  let pointsRevoked = false;
  let revokeError: string | undefined;
  if (logId) {
    const revoked = await revokePointsLogEntry(logId, existing.participantId, reason);
    if (revoked.ok) pointsRevoked = true;
    else revokeError = revoked.error;
  }

  const [updated] = await db.update(piggybank)
    .set({
      deletedAt: new Date(),
      isHidden: true,
      ...(logId && !existing.pointsLogId ? { pointsLogId: logId } : {}),
    })
    .where(eq(piggybank.id, entryId))
    .returning();

  return {
    entry: updated!,
    pointsRevoked,
    pointsLogId: logId,
    revokeError,
  };
}

export async function restorePiggybankEntry(entryId: number): Promise<typeof piggybank.$inferSelect> {
  const [existing] = await db.select().from(piggybank)
    .where(eq(piggybank.id, entryId))
    .limit(1);
  if (!existing) throw new Error('Not found');
  if (!existing.deletedAt) throw new Error('Not deleted');

  const [updated] = await db.update(piggybank)
    .set({ deletedAt: null, isHidden: false })
    .where(eq(piggybank.id, entryId))
    .returning();
  return updated!;
}

export function inferSourceFromEventTitle(title: string | null | undefined): string {
  if (!title) return 'Направление';
  const t = title.toLowerCase();
  if (t.includes('урок') && t.includes('важн')) return 'Урок о важном';
  if (t.includes('открыт')) return 'Открытый урок';
  if (t.includes('клуб')) return 'Клуб';
  return 'Направление';
}
