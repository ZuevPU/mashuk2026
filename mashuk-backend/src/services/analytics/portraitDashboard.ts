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

  const interestsByDirection: { direction: string; top: { key: string; count: number }[] }[] = [];
  const dirInterest = new Map<string, string[]>();
  for (const p of onboarded) {
    const d = p.direction || '—';
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    if (!dirInterest.has(d)) dirInterest.set(d, []);
    dirInterest.get(d)!.push(...ints);
  }
  for (const [direction, tags] of dirInterest) {
    interestsByDirection.push({ direction, top: countMap(tags).slice(0, 10) });
  }

  const preStart = {
    goalTopTokens: topReasonTokens(goalTexts, 15),
    interestTop: countMap(interestTags).slice(0, 20),
    interestsByDirection,
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

  const experimentDaySeries: { day: number; role: string; label: string; count: number }[] = [];
  const dayRoleMap = new Map<string, number>();
  const expFreq = new Map<string, number>();
  for (const s of states) {
    if (s.dayNumber >= 2 && s.dayNumber <= 7 && s.activeRoleKey) {
      const key = `${s.dayNumber}:${s.activeRoleKey}`;
      dayRoleMap.set(key, (dayRoleMap.get(key) || 0) + 1);
      expFreq.set(s.activeRoleKey, (expFreq.get(s.activeRoleKey) || 0) + 1);
    }
  }
  for (const [key, count] of dayRoleMap) {
    const [dayStr, role] = key.split(':');
    experimentDaySeries.push({
      day: Number(dayStr),
      role,
      label: getRoleMeta(role)?.name ?? role,
      count,
    });
  }
  experimentDaySeries.sort((a, b) => a.day - b.day || b.count - a.count);

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
      experiments: [...new Set(pStates.filter(s => s.activeRoleKey).map(s => s.activeRoleKey!))],
      finalStrong: p.strongRole || '—',
      finalGrowth: p.growthRole || '—',
    });
  }

  const matrixAggregate = new Map<string, number>();
  for (const row of matrixRows) {
    const exps = row.experiments.length ? row.experiments : ['—'];
    for (const exp of exps) {
      const key = `${row.start}|${exp}|${row.finalStrong}`;
      matrixAggregate.set(key, (matrixAggregate.get(key) || 0) + 1);
    }
  }
  const roleMatrix = [...matrixAggregate.entries()]
    .map(([key, count]) => {
      const [startRole, experimentRole, finalRole] = key.split('|');
      return {
        startRole,
        startLabel: getRoleMeta(startRole)?.name ?? startRole,
        experimentRole,
        experimentLabel: getRoleMeta(experimentRole)?.name ?? experimentRole,
        finalRole,
        finalLabel: getRoleMeta(finalRole)?.name ?? finalRole,
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);

  let exploredRolesTotal = 0;
  for (const row of matrixRows) {
    exploredRolesTotal += row.experiments.length;
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

  let roleChangedAtExit = 0;
  let roleSameAtExit = 0;
  for (const p of onboarded) {
    if (!p.strongRole && !p.growthRole) continue;
    const start = p.pedagogicalRole || '';
    if (p.strongRole && start && p.strongRole !== start) roleChangedAtExit += 1;
    else if (p.strongRole && start) roleSameAtExit += 1;
  }

  const departureByDirection: {
    direction: string;
    total: number;
    bothPoints: number;
    pointATokens: { token: string; count: number }[];
    pointBTokens: { token: string; count: number }[];
  }[] = [];
  const depDir = new Map<string, typeof onboarded>();
  for (const p of onboarded) {
    const d = p.direction || '—';
    if (!depDir.has(d)) depDir.set(d, []);
    depDir.get(d)!.push(p);
  }
  for (const [direction, list] of depDir) {
    const aTexts: string[] = [];
    const bTexts: string[] = [];
    for (const p of list) {
      const ga = p.goalAnswers;
      if (Array.isArray(ga)) aTexts.push(...ga.map(String));
      else if (ga && typeof ga === 'object') aTexts.push(...Object.values(ga as Record<string, unknown>).map(String));
      const gb = p.pointBAnswers;
      if (Array.isArray(gb)) bTexts.push(...gb.map(String));
      else if (gb && typeof gb === 'object') bTexts.push(...Object.values(gb as Record<string, unknown>).map(String));
    }
    departureByDirection.push({
      direction,
      total: list.length,
      bothPoints: list.filter(p => p.goalAnswers && p.pointBAnswers).length,
      pointATokens: topReasonTokens(aTexts, 12),
      pointBTokens: topReasonTokens(bTexts, 12),
    });
  }

  return {
    filters,
    preStart,
    histograms,
    roleDynamics: {
      experimentTop,
      experimentDaySeries,
      roleExitSummary: { changed: roleChangedAtExit, same: roleSameAtExit },
      matrixSample: matrixRows.slice(0, 100),
      roleMatrix,
      exploredRolesTotal,
      exploredRolesAvg: matrixRows.length ? Math.round((exploredRolesTotal / matrixRows.length) * 10) / 10 : 0,
    },
    departure: {
      participants: departure,
      completedBoth: departure.filter(r => r.hasPointA && r.hasPointB).length,
      byDirection: departureByDirection,
    },
  };
}

export async function buildDeparturePortrait(filters: AnalyticsFilters, req?: AdminRequest) {
  const d = await buildPortraitDashboard(filters, req);
  return {
    ...d.departure,
    byDirection: d.departure.byDirection,
  };
}
