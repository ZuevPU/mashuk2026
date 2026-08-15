import { mean, round2 } from './dayResultsMetrics.js';
import { numScale } from './forumResultsMetrics.js';

export type ForumPeopleColumn = {
  key: string;
  ratingKey: string;
  label: string;
  max: 5 | 10;
  days: number[];
};

export type ForumPeopleRow = {
  participantId: number;
  name: string;
  direction: string;
  group: string;
  days: number[];
  lastDay: number;
  filledAt: string | null;
  heat: Array<{ key: string; v: number | null }>;
  index: number | null;
};

export type ForumResultsPeople = {
  columns: ForumPeopleColumn[];
  rows: ForumPeopleRow[];
};

export type ForumPeopleSourceRow = {
  participantId: number;
  dayNumber: number;
  ratings: Record<string, unknown>;
  filledAt: Date | string | null;
  direction: string;
  group: string;
  firstName?: string | null;
  lastName?: string | null;
};

function personName(row: ForumPeopleSourceRow): string {
  const name = `${row.firstName || ''} ${row.lastName || ''}`.replace(/\s+/g, ' ').trim();
  return name || `#${row.participantId}`;
}

function filledAtMs(value: Date | string | null): number {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function pickScale(
  rows: ForumPeopleSourceRow[],
  col: ForumPeopleColumn,
): number | null {
  const matching = rows
    .filter(r => !col.days.length || col.days.includes(r.dayNumber))
    .sort((a, b) => b.dayNumber - a.dayNumber || filledAtMs(b.filledAt) - filledAtMs(a.filledAt));
  for (const row of matching) {
    const v = numScale(row.ratings[col.ratingKey], col.max);
    if (v != null) return v;
  }
  return null;
}

/** Уникальные сдавшие: ФИО / направление / группа + тепловая полоса шкал. */
export function buildForumResultsPeople(
  submitted: ForumPeopleSourceRow[],
  columns: ForumPeopleColumn[],
): ForumResultsPeople {
  const byId = new Map<number, ForumPeopleSourceRow[]>();
  for (const row of submitted) {
    const list = byId.get(row.participantId) ?? [];
    list.push(row);
    byId.set(row.participantId, list);
  }

  const rows: ForumPeopleRow[] = [...byId.entries()].map(([participantId, list]) => {
    const latest = [...list].sort(
      (a, b) => filledAtMs(b.filledAt) - filledAtMs(a.filledAt) || b.dayNumber - a.dayNumber,
    )[0];
    const days = [...new Set(list.map(r => r.dayNumber))].sort((a, b) => a - b);
    const heat = columns.map(col => ({ key: col.key, v: pickScale(list, col) }));
    const indexVals = heat.map(c => c.v).filter((v): v is number => v != null);
    return {
      participantId,
      name: personName(latest),
      direction: (latest.direction || '—').trim() || '—',
      group: (latest.group || '—').trim() || '—',
      days,
      lastDay: latest.dayNumber,
      filledAt: toIso(latest.filledAt),
      heat,
      index: indexVals.length ? round2(mean(indexVals) ?? 0) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return { columns, rows };
}
