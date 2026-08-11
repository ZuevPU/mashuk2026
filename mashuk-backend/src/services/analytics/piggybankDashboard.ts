import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import {
  PIGGYBANK_SOURCES,
  PIGGYBANK_TAGS,
  entryTags,
  normalizePiggybankSource,
} from '../piggybankDict.js';
import { loadCohortParticipants } from './cohort.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { topReasonTokens } from './zoneDistribution.js';

export type PiggybankDashboardOptions = {
  /** Штаб · Форум: только topThemes + byDirection. */
  slim?: boolean;
};

export async function buildPiggybankDashboard(
  filters: AnalyticsFilters,
  req?: AdminRequest,
  opts?: PiggybankDashboardOptions,
) {
  const slim = Boolean(opts?.slim);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = cohort.map(p => p.id);
  if (!ids.length) {
    return {
      filters,
      navigation: { total: 0, page: filters.page, limit: filters.limit },
      byTag: Object.fromEntries(PIGGYBANK_TAGS.map(tag => [tag, { count: 0, series: [], entries: [], byDirection: [], topThemes: [] }])),
      bySource: Object.fromEntries(PIGGYBANK_SOURCES.map(src => [src, { count: 0, tagMix: [], series: [] }])),
      byDirection: [] as { direction: string; count: number }[],
      topThemes: [],
      recurringTools: [],
      vRabota: { total: 0, byDirection: [], sample: [] },
      entries: [],
    };
  }
  const conditions = [inArray(piggybank.participantId, ids), isNull(piggybank.deletedAt)];
  if (filters.day != null) conditions.push(eq(piggybank.forumDay, filters.day));
  const rows = await db.select().from(piggybank).where(and(...conditions));

  let entries = rows;
  if (filters.source) {
    entries = entries.filter(e => normalizePiggybankSource(e.source) === filters.source);
  }
  if (filters.tag) {
    entries = entries.filter(e => entryTags(e).includes(filters.tag!));
  }

  if (slim) {
    const piggyByDirection = new Map<string, number>();
    for (const e of rows) {
      const p = cohort.find(c => c.id === e.participantId);
      const d = p?.direction || '—';
      piggyByDirection.set(d, (piggyByDirection.get(d) || 0) + 1);
    }
    return {
      filters,
      navigation: { total: entries.length, page: filters.page, limit: filters.limit },
      byTag: {},
      bySource: {},
      byDirection: [...piggyByDirection.entries()]
        .map(([direction, count]) => ({ direction, count }))
        .sort((a, b) => b.count - a.count || a.direction.localeCompare(b.direction, 'ru')),
      topThemes: topReasonTokens(rows.map(e => e.text), 20),
      recurringTools: [],
      vRabota: { total: 0, byDirection: [], sample: [] },
      entries: [],
    };
  }

  const byTag: Record<string, { count: number; series: { day: number; count: number }[]; entries: unknown[]; byDirection: { direction: string; count: number }[]; topThemes: { token: string; count: number }[] }> = {};
  for (const tag of PIGGYBANK_TAGS) {
    const tagged = rows.filter(e => entryTags(e).includes(tag));
    const dayMap = new Map<number, number>();
    const dirMap = new Map<string, number>();
    for (const e of tagged) {
      const d = e.forumDay ?? 0;
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
      const p = cohort.find(c => c.id === e.participantId);
      const dir = p?.direction || '—';
      dirMap.set(dir, (dirMap.get(dir) || 0) + 1);
    }
    byTag[tag] = {
      count: tagged.length,
      series: [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map(([day, count]) => ({ day, count })),
      entries: tagged.slice(0, filters.tag === tag ? filters.limit : 5).map(e => ({
        id: e.id,
        participantId: e.participantId,
        day: e.forumDay,
        text: e.text,
        source: e.source,
        createdAt: e.createdAt,
      })),
      byDirection: [...dirMap.entries()].map(([direction, count]) => ({ direction, count })),
      topThemes: topReasonTokens(tagged.map(e => e.text), 10),
    };
  }

  const bySource: Record<string, { count: number; tagMix: { tag: string; count: number }[]; series: { day: number; count: number }[] }> = {};
  for (const src of PIGGYBANK_SOURCES) {
    const sourced = rows.filter(e => normalizePiggybankSource(e.source) === src);
    const tagMix = new Map<string, number>();
    const dayMap = new Map<number, number>();
    for (const e of sourced) {
      for (const t of entryTags(e)) tagMix.set(t, (tagMix.get(t) || 0) + 1);
      const d = e.forumDay ?? 0;
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
    bySource[src] = {
      count: sourced.length,
      tagMix: [...tagMix.entries()].map(([tag, count]) => ({ tag, count })),
      series: [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map(([day, count]) => ({ day, count })),
    };
  }

  const vRabota = rows.filter(e => entryTags(e).includes('в работу'));
  const vRabotaByDirection = new Map<string, number>();
  for (const e of vRabota) {
    const p = cohort.find(c => c.id === e.participantId);
    const d = p?.direction || '—';
    vRabotaByDirection.set(d, (vRabotaByDirection.get(d) || 0) + 1);
  }

  const piggyByDirection = new Map<string, number>();
  for (const e of rows) {
    const p = cohort.find(c => c.id === e.participantId);
    const d = p?.direction || '—';
    piggyByDirection.set(d, (piggyByDirection.get(d) || 0) + 1);
  }

  const offset = (filters.page - 1) * filters.limit;
  const pageEntries = entries.slice(offset, offset + filters.limit);

  return {
    filters,
    navigation: { total: entries.length, page: filters.page, limit: filters.limit },
    byTag,
    bySource,
    byDirection: [...piggyByDirection.entries()]
      .map(([direction, count]) => ({ direction, count }))
      .sort((a, b) => b.count - a.count || a.direction.localeCompare(b.direction, 'ru')),
    topThemes: topReasonTokens(rows.map(e => e.text), 20),
    recurringTools: topReasonTokens(rows.map(e => e.text), 15),
    vRabota: {
      total: vRabota.length,
      byDirection: [...vRabotaByDirection.entries()].map(([direction, count]) => ({ direction, count })),
      sample: vRabota.slice(0, 20).map(e => ({ id: e.id, text: e.text, source: e.source })),
    },
    entries: pageEntries.map(e => ({
      id: e.id,
      participantId: e.participantId,
      day: e.forumDay,
      text: e.text,
      tags: entryTags(e),
      source: e.source,
    })),
  };
}
