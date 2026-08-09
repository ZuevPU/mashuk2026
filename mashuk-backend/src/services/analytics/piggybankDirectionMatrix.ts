import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { PIGGYBANK_TAGS, entryTags } from '../piggybankDict.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';

/**
 * Матрица направление × тег копилки с охватом по уникальным участникам
 * (piggybankDashboard.byTag.byDirection считает записи, не людей).
 */
export async function buildPiggybankDirectionMatrix(filters: AnalyticsFilters, req?: AdminRequest) {
  const forumFilters: AnalyticsFilters = { ...filters, direction: null, group: null };
  const cohort = await loadCohortParticipants(forumFilters, req);
  const byDirectionRegistered = new Map<string, number>();
  for (const p of cohort) {
    const dir = p.direction || '—';
    byDirectionRegistered.set(dir, (byDirectionRegistered.get(dir) || 0) + 1);
  }
  const directions = [...byDirectionRegistered.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const tags = [...PIGGYBANK_TAGS];

  const ids = cohort.map(p => p.id);
  if (!ids.length) {
    return {
      filters: forumFilters,
      tags,
      directions,
      registeredByDirection: Object.fromEntries(directions.map(d => [d, 0])),
      cells: [] as {
        direction: string;
        tag: string;
        uniqueParticipants: number;
        entries: number;
        coveragePct: number;
      }[],
    };
  }

  const conditions = [inArray(piggybank.participantId, ids), isNull(piggybank.deletedAt)];
  const rows = await db.select().from(piggybank).where(and(...conditions));
  const cohortById = new Map(cohort.map(p => [p.id, p]));

  const cellSets = new Map<string, Set<number>>();
  const cellEntries = new Map<string, number>();
  for (const e of rows) {
    const p = cohortById.get(e.participantId);
    const direction = p?.direction || '—';
    for (const tag of entryTags(e)) {
      if (!tags.includes(tag as typeof tags[number])) continue;
      const key = `${direction}\0${tag}`;
      if (!cellSets.has(key)) cellSets.set(key, new Set());
      cellSets.get(key)!.add(e.participantId);
      cellEntries.set(key, (cellEntries.get(key) || 0) + 1);
    }
  }

  const cells: {
    direction: string;
    tag: string;
    uniqueParticipants: number;
    entries: number;
    coveragePct: number;
  }[] = [];

  for (const direction of directions) {
    const registered = byDirectionRegistered.get(direction) || 0;
    for (const tag of tags) {
      const key = `${direction}\0${tag}`;
      const uniqueParticipants = cellSets.get(key)?.size ?? 0;
      const entries = cellEntries.get(key) ?? 0;
      cells.push({
        direction,
        tag,
        uniqueParticipants,
        entries,
        coveragePct: registered
          ? Math.round((uniqueParticipants / registered) * 1000) / 10
          : 0,
      });
    }
  }

  return {
    filters: forumFilters,
    tags,
    directions,
    registeredByDirection: Object.fromEntries(
      directions.map(d => [d, byDirectionRegistered.get(d) || 0]),
    ),
    cells,
  };
}
