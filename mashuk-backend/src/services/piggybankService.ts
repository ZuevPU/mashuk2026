import { db } from '../db/index.js';
import { piggybank } from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import {
  normalizePiggybankTags,
  normalizePiggybankSource,
  isAllowedPiggybankSource,
  ORG_TAG,
  pointsActionForTags,
} from './piggybankDict.js';
import { awardPoints } from './pointsService.js';

export function filterPiggybankEntries<T extends { source?: string | null; text: string; forumDay?: number | null }>(
  entries: T[],
  query: { tag?: string; source?: string; day?: number; q?: string },
  tagFn: (e: T, tag: string) => boolean,
): T[] {
  const q = query.q?.trim().slice(0, 100).toLowerCase();
  const day = query.day != null && query.day !== '' ? Number(query.day) : undefined;
  return entries.filter(e => {
    if (query.tag && !tagFn(e, query.tag)) return false;
    if (query.source && e.source !== query.source) return false;
    if (day != null && !Number.isNaN(day) && e.forumDay !== day) return false;
    if (q && !e.text.toLowerCase().includes(q)) return false;
    return true;
  });
}

export async function resolveForumDayForNewEntry(): Promise<number> {
  const settings = await getForumSettings();
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
  if (tags.includes(ORG_TAG)) {
    source = source || 'Своя мысль';
  } else if (!source || !isAllowedPiggybankSource(source)) {
    throw new Error('source required');
  }

  const forumDay = input.forumDay ?? await resolveForumDayForNewEntry();

  const [entry] = await db.insert(piggybank).values({
    participantId: input.participantId,
    tag: tags[0],
    tags,
    text,
    source,
    forumDay,
  }).returning();

  await awardPoints(input.participantId, pointsActionForTags(tags));
  return entry;
}

export function inferSourceFromEventTitle(title: string | null | undefined): string {
  if (!title) return 'Направление';
  const t = title.toLowerCase();
  if (t.includes('урок') && t.includes('важн')) return 'Урок о важном';
  if (t.includes('открыт')) return 'Открытый урок';
  if (t.includes('клуб')) return 'Клуб';
  return 'Направление';
}
