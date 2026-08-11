import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { collectKindAnswerRows, type KindAnswerRow } from './questionKindDashboard.js';
import {
  REFLECTION_LEVELS,
  TIME_BUCKETS,
  appropriationPct,
  classifyReflection,
  isAppropriation,
  levelCounts,
  median,
  round1,
  shortSubtopicLabel,
  timeBucketOf,
  type ReflectionLevel,
  type TimeBucket,
} from './afterBlocksHubMetrics.js';

type Classified = {
  row: KindAnswerRow;
  level: ReflectionLevel;
  len: number;
  event: string;
  subtopic: string;
};

function classifyRows(rows: KindAnswerRow[]): Classified[] {
  const out: Classified[] = [];
  for (const row of rows) {
    if (isOrganizerDirection(row.direction)) continue;
    const text = (row.answer || '').trim();
    if (!text || text.startsWith('(ответ без')) continue;
    const parent = (row.parentEventTitle || '').trim();
    const leaf = (row.eventTitle || '').trim();
    const event = parent || leaf || 'Без события';
    const subtopic = leaf && leaf !== parent ? leaf : (leaf || parent || 'Без подтемы');
    out.push({
      row,
      level: classifyReflection(text),
      len: text.length,
      event,
      subtopic,
    });
  }
  return out;
}

function levelDistOf(items: Classified[]) {
  const byLevel: Record<ReflectionLevel, number[]> = {
    'Перенос в практику': [],
    'Связь с собой': [],
    'Тезис': [],
    'Реакция': [],
  };
  for (const it of items) byLevel[it.level].push(it.len);
  return REFLECTION_LEVELS.map(name => ({
    name,
    n: byLevel[name].length,
    med: Math.round(median(byLevel[name])),
  }));
}

function buildSlice(
  items: Classified[],
  registeredRows: Array<{ id: number; direction: string }>,
) {
  const registered = registeredRows.length;
  const peopleIds = new Set(items.map(i => i.row.participantId));
  const levels = items.map(i => i.level);
  const own = appropriationPct(levels);
  const levelDist = levelDistOf(items);
  const medLen = Math.round(median(items.map(i => i.len)));

  // Events
  const eventMap = new Map<string, Classified[]>();
  for (const it of items) {
    if (!eventMap.has(it.event)) eventMap.set(it.event, []);
    eventMap.get(it.event)!.push(it);
  }
  const events = [...eventMap.entries()]
    .map(([event, list]) => {
      const dist = levelCounts(list.map(i => i.level));
      const people = new Set(list.map(i => i.row.participantId)).size;
      return {
        event,
        n: list.length,
        people,
        own: appropriationPct(list.map(i => i.level)),
        dist,
        med: Math.round(median(list.map(i => i.len))),
      };
    })
    .sort((a, b) => b.own - a.own || b.n - a.n || a.event.localeCompare(b.event, 'ru'));

  // Subtopics n ≥ 20
  const subMap = new Map<string, Classified[]>();
  for (const it of items) {
    const key = `${it.event}|||${it.subtopic}`;
    if (!subMap.has(key)) subMap.set(key, []);
    subMap.get(key)!.push(it);
  }
  const subtopics = [...subMap.entries()]
    .map(([, list]) => {
      const dist = levelCounts(list.map(i => i.level));
      return {
        name: list[0].subtopic,
        short: shortSubtopicLabel(list[0].subtopic),
        n: list.length,
        own: appropriationPct(list.map(i => i.level)),
        med: Math.round(median(list.map(i => i.len))),
        event: list[0].event,
        dist,
      };
    })
    .filter(s => s.n >= 20)
    .sort((a, b) => b.own - a.own || b.n - a.n);

  // Directions
  const dirReg = new Map<string, number>();
  for (const p of registeredRows) {
    if (isOrganizerDirection(p.direction)) continue;
    const d = (p.direction || '—').trim() || '—';
    dirReg.set(d, (dirReg.get(d) || 0) + 1);
  }
  const dirMap = new Map<string, Classified[]>();
  for (const it of items) {
    const d = (it.row.direction || '—').trim() || '—';
    if (isOrganizerDirection(d)) continue;
    if (!dirMap.has(d)) dirMap.set(d, []);
    dirMap.get(d)!.push(it);
  }
  const dirs = [...dirReg.entries()]
    .map(([dir, reg]) => {
      const list = dirMap.get(dir) ?? [];
      const people = new Set(list.map(i => i.row.participantId)).size;
      return {
        dir,
        n: list.length,
        people,
        registered: reg,
        cov: round1((people / Math.max(1, reg)) * 100),
        own: appropriationPct(list.map(i => i.level)),
        med: Math.round(median(list.map(i => i.len))),
        dist: levelCounts(list.map(i => i.level)),
      };
    })
    .filter(d => d.registered >= 1)
    .sort((a, b) => b.cov - a.cov || a.dir.localeCompare(b.dir, 'ru'));

  // Time
  const timeMap = new Map<TimeBucket, Classified[]>();
  for (const b of TIME_BUCKETS) timeMap.set(b, []);
  for (const it of items) {
    const b = timeBucketOf(it.row.createdAt);
    if (!b) continue;
    timeMap.get(b)!.push(it);
  }
  const byTime = TIME_BUCKETS.map(bucket => {
    const list = timeMap.get(bucket) ?? [];
    return {
      bucket,
      n: list.length,
      own: appropriationPct(list.map(i => i.level)),
      med: Math.round(median(list.map(i => i.len))),
    };
  }).filter(t => t.n > 0);

  // Quotes: appropriation, len > 60
  const quotes = items
    .filter(i => isAppropriation(i.level) && i.len > 60)
    .sort((a, b) => b.len - a.len)
    .slice(0, 40)
    .map(i => ({
      lvl: i.level,
      text: i.row.answer.trim().slice(0, 320),
      event: i.event,
      subtopic: i.subtopic,
      direction: i.row.direction,
    }));

  return {
    meta: {
      answers: items.length,
      people: peopleIds.size,
      registered,
      own,
      medLen,
      subtopics: subtopics.length,
      coveragePct: round1((peopleIds.size / Math.max(1, registered)) * 100),
    },
    levelDist,
    events,
    subtopics,
    dirs,
    byTime,
    quotes,
  };
}

export async function buildAfterBlocksHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const day = Math.min(8, Math.max(1, filters.day ?? currentDay));

  const cohort = await loadCohortParticipants(filters, req);
  const registeredRows = cohort
    .filter(p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction))
    .map(p => ({ id: p.id, direction: (p.direction || '—').trim() || '—' }));

  // Все дни смены — для динамики; срез выбранного дня — для панелей
  const shiftFilters: AnalyticsFilters = { ...filters, day: null, mode: 'shift', compareDays: [] };
  const { rows: allRows } = await collectKindAnswerRows('after_blocks', shiftFilters);
  const allowed = new Set(registeredRows.map(p => p.id));
  const scoped = allRows.filter(r => allowed.has(r.participantId));

  const dayItems = classifyRows(scoped.filter(r => r.day === day));
  const slice = buildSlice(dayItems, registeredRows);

  const daySeries = [1, 2, 3, 4, 5, 6, 7, 8].map(d => {
    const items = classifyRows(scoped.filter(r => r.day === d));
    if (!items.length && d !== day) {
      return { day: d, own: null, coveragePct: null, answers: 0 };
    }
    const s = buildSlice(items, registeredRows);
    return {
      day: d,
      own: items.length || d === day ? s.meta.own : null,
      coveragePct: items.length ? s.meta.coveragePct : (d === day ? 0 : null),
      answers: items.length,
    };
  });

  return {
    filters,
    currentForumDay: currentDay,
    levels: REFLECTION_LEVELS,
    meta: {
      day,
      now: new Date().toISOString(),
      ...slice.meta,
    },
    levelDist: slice.levelDist,
    events: slice.events,
    subtopics: slice.subtopics,
    dirs: slice.dirs,
    byTime: slice.byTime,
    quotes: slice.quotes,
    daySeries,
    exportPath: `/exports/after-blocks?mode=day&day=${day}`,
  };
}
