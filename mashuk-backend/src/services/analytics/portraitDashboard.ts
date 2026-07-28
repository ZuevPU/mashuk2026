import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { participantDayState, participants } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getRoleMeta } from '../roleService.js';
import { loadCohortParticipants } from './cohort.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { topReasonTokens } from './zoneDistribution.js';

function histNumeric(values: number[], buckets: number[]): { bucket: string; count: number }[] {
  const counts = buckets.map((b, i) => {
    const max = buckets[i + 1] ?? Infinity;
    const n = values.filter(v => v >= b && v < max).length;
    return { bucket: max === Infinity ? `${b}+` : `${b}-${max - 1}`, count: n };
  });
  return counts;
}

function countMap(items: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const k of items) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
}

export async function buildPortraitDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const cohort = await loadCohortParticipants(filters, req);
  const onboarded = cohort.filter(p => p.onboardingCompletedAt);

  const interestTags: string[] = [];
  for (const p of onboarded) {
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    interestTags.push(...ints);
  }

  const roleDist = countMap(onboarded.map(p => p.pedagogicalRole || 'none').map(k => getRoleMeta(k)?.name ?? k));

  const goalTexts: string[] = [];
  for (const p of onboarded) {
    const g = p.goalAnswers;
    if (Array.isArray(g)) goalTexts.push(...g.map(String));
    else if (g && typeof g === 'object') goalTexts.push(...Object.values(g as Record<string, unknown>).map(String));
  }

  const preStart = {
    goalTopTokens: topReasonTokens(goalTexts, 15),
    interestTop: countMap(interestTags).slice(0, 20),
    roleDistribution: roleDist,
    byDirection: countMap(onboarded.map(p => p.direction || '—')),
    byGroup: countMap(onboarded.map(p => p.groupName || 'без группы')),
    byRegion: countMap(onboarded.map(p => p.region || 'не указан')),
  };

  const histograms = {
    age: histNumeric(onboarded.map(p => p.age ?? 0).filter(a => a > 0), [0, 18, 25, 35, 45, 55, 100]),
    direction: preStart.byDirection,
    group: preStart.byGroup,
    region: preStart.byRegion,
    workplace: countMap(onboarded.map(p => p.workplace || '—')).slice(0, 15),
    position: countMap(onboarded.map(p => p.position || '—')).slice(0, 15),
  };

  const ids = onboarded.map(p => p.id);
  const states = ids.length
    ? await db.select().from(participantDayState).where(inArray(participantDayState.participantId, ids))
    : [];

  const experimentByDay: { day: number; role: string; count: number }[] = [];
  const expFreq = new Map<string, number>();
  for (const s of states) {
    if (s.dayNumber >= 2 && s.dayNumber <= 7 && s.activeRoleKey) {
      experimentByDay.push({ day: s.dayNumber, role: s.activeRoleKey, count: 1 });
      expFreq.set(s.activeRoleKey, (expFreq.get(s.activeRoleKey) || 0) + 1);
    }
  }
  const experimentTop = [...expFreq.entries()].sort((a, b) => b[1] - a[1]).map(([role, count]) => ({
    role,
    label: getRoleMeta(role)?.name ?? role,
    count,
  }));

  const matrixRows: { participantId: number; start: string; experiments: string[]; finalStrong: string; finalGrowth: string }[] = [];
  for (const p of onboarded.slice(0, 500)) {
    const pStates = states.filter(s => s.participantId === p.id);
    matrixRows.push({
      participantId: p.id,
      start: p.pedagogicalRole || '—',
      experiments: pStates.filter(s => s.activeRoleKey).map(s => s.activeRoleKey!),
      finalStrong: p.strongRole || '—',
      finalGrowth: p.growthRole || '—',
    });
  }

  const departure = onboarded.map(p => ({
    id: p.id,
    name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
    direction: p.direction,
    groupName: p.groupName,
    region: p.region,
    pointA: p.goalAnswers,
    pointB: p.pointBAnswers,
    hasPointA: !!p.goalAnswers,
    hasPointB: !!p.pointBAnswers,
    strongRole: p.strongRole,
    growthRole: p.growthRole,
  }));

  return {
    filters,
    preStart,
    histograms,
    roleDynamics: {
      experimentTop,
      experimentByDay: countMap(experimentByDay.map(e => `D${e.day}:${e.role}`)),
      matrixSample: matrixRows.slice(0, 100),
    },
    departure: {
      participants: departure,
      completedBoth: departure.filter(r => r.hasPointA && r.hasPointB).length,
    },
  };
}

export async function buildDeparturePortrait(filters: AnalyticsFilters, req?: AdminRequest) {
  const d = await buildPortraitDashboard(filters, req);
  return d.departure;
}
