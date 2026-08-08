import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { fullName } from '../exports/exportCommon.js';
import { getForumSettings } from '../helpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { forumDayCalendarDate } from './dashboardCatalog.js';
import { buildEveningDashboard } from './eveningDashboard.js';
import { buildKindDashboard } from './questionKindDashboard.js';
import { buildPulseDashboard } from './pulseDashboard.js';
import { buildProgramDashboard } from './programDashboard.js';
import { buildActivityDashboard } from './activityDashboard.js';
import { buildPiggybankDashboard } from './piggybankDashboard.js';
import { buildPortraitDashboard } from './portraitDashboard.js';
import { topReasonTokens } from './zoneDistribution.js';

type MissingPerson = {
  participantId: number;
  name: string;
  group: string;
};

function personRow(p: {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  groupName?: string | null;
}): MissingPerson {
  return {
    participantId: p.id,
    name: fullName(p) || `#${p.id}`,
    group: p.groupName || 'без группы',
  };
}

function missingFrom(
  registered: { id: number; firstName?: string | null; lastName?: string | null; groupName?: string | null }[],
  submittedIds: Set<number>,
): MissingPerson[] {
  return registered
    .filter(p => !submittedIds.has(p.id))
    .map(personRow)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function exportPathFor(filters: AnalyticsFilters): string {
  const u = new URLSearchParams();
  if (filters.day != null && filters.day > 0) u.set('day', String(filters.day));
  if (filters.direction?.trim()) u.set('direction', filters.direction.trim());
  if (filters.group?.trim()) u.set('group', filters.group.trim());
  const qs = u.toString();
  return qs ? `/exports/direction-pack?${qs}` : '/exports/direction-pack';
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

/**
 * Direction Command Center — full analytics pack for one selected direction.
 * Requires filters.direction; otherwise returns empty-state payload.
 */
export async function buildDirectionDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentForumDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentForumDay);
  const dayFilter = days.length === 1 ? days[0] : null;
  const direction = filters.direction?.trim() || null;

  if (!direction) {
    return {
      requiresDirection: true,
      direction: null,
      filters,
      currentForumDay,
      title: 'Аналитика направления',
      diagnostics: {
        notes: ['Выберите направление в фильтре Insights, чтобы открыть полный пакет аналитики.'],
      },
      exportPath: null,
    };
  }

  const directionFilters: AnalyticsFilters = { ...filters, direction };
  const directionAllGroupsFilters: AnalyticsFilters = { ...filters, direction, group: null };
  const forumFilters: AnalyticsFilters = { ...filters, direction: null, group: null };

  const [
    cohort,
    directionCohortAllGroups,
    forumCohort,
    pulse,
    forumPulse,
    evening,
    afterBlocks,
    stateCheck,
    program,
    activity,
    piggybank,
    portrait,
  ] = await Promise.all([
    loadCohortParticipants(directionFilters, req),
    loadCohortParticipants(directionAllGroupsFilters, req),
    loadCohortParticipants(forumFilters, req),
    buildPulseDashboard(directionFilters, req),
    buildPulseDashboard(forumFilters, req),
    buildEveningDashboard(directionFilters, req),
    buildKindDashboard('after_blocks', directionFilters, req),
    buildKindDashboard('state_check', directionFilters, req),
    buildProgramDashboard(directionFilters, req),
    buildActivityDashboard(directionFilters, req),
    buildPiggybankDashboard(directionFilters, req),
    buildPortraitDashboard(directionFilters, req),
  ]);

  const groupsAvailable = [...new Set(
    directionCohortAllGroups
      .filter(p => p.onboardingCompletedAt)
      .map(p => p.groupName || 'без группы'),
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  const registeredPeople = cohort.filter(p => p.onboardingCompletedAt);
  const registered = registeredPeople.length;
  const forumRegistered = forumCohort.filter(p => p.onboardingCompletedAt).length;

  const eveningPeople = new Set<number>();
  for (const q of evening.questions ?? []) {
    for (const a of q.answers ?? []) eveningPeople.add(a.participantId);
  }

  const afterIds = new Set(
    (afterBlocks.questions ?? []).flatMap((q: { answers?: { participantId: number }[] }) =>
      (q.answers ?? []).map((a: { participantId: number }) => a.participantId),
    ),
  );
  const stateIds = new Set(
    (stateCheck.questions ?? []).flatMap((q: { answers?: { participantId: number }[] }) =>
      (q.answers ?? []).map((a: { participantId: number }) => a.participantId),
    ),
  );

  const eveningSubmitted = Math.max(evening.activity?.submitted ?? 0, eveningPeople.size);
  const afterSubmitted = afterBlocks.activity?.submitted ?? afterIds.size;
  const stateSubmitted = stateCheck.activity?.submitted ?? stateIds.size;

  const byGroupMap = new Map<string, { registered: number; evening: number; afterBlocks: number; stateCheck: number }>();
  for (const p of registeredPeople) {
    const g = p.groupName || 'без группы';
    if (!byGroupMap.has(g)) byGroupMap.set(g, { registered: 0, evening: 0, afterBlocks: 0, stateCheck: 0 });
    byGroupMap.get(g)!.registered += 1;
  }
  for (const id of eveningPeople) {
    const p = registeredPeople.find(x => x.id === id);
    if (!p) continue;
    const g = p.groupName || 'без группы';
    if (!byGroupMap.has(g)) byGroupMap.set(g, { registered: 0, evening: 0, afterBlocks: 0, stateCheck: 0 });
    byGroupMap.get(g)!.evening += 1;
  }
  for (const id of afterIds) {
    const p = registeredPeople.find(x => x.id === id);
    if (!p) continue;
    const g = p.groupName || 'без группы';
    if (!byGroupMap.has(g)) byGroupMap.set(g, { registered: 0, evening: 0, afterBlocks: 0, stateCheck: 0 });
    byGroupMap.get(g)!.afterBlocks += 1;
  }
  for (const id of stateIds) {
    const p = registeredPeople.find(x => x.id === id);
    if (!p) continue;
    const g = p.groupName || 'без группы';
    if (!byGroupMap.has(g)) byGroupMap.set(g, { registered: 0, evening: 0, afterBlocks: 0, stateCheck: 0 });
    byGroupMap.get(g)!.stateCheck += 1;
  }

  const byGroup = [...byGroupMap.entries()]
    .map(([group, s]) => ({
      group,
      registered: s.registered,
      evening: s.evening,
      afterBlocks: s.afterBlocks,
      stateCheck: s.stateCheck,
      eveningFillPct: pct(s.evening, s.registered),
      afterBlocksFillPct: pct(s.afterBlocks, s.registered),
      stateCheckFillPct: pct(s.stateCheck, s.registered),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, 'ru'));

  const activeToday = pulse.activity?.activeToday ?? 0;
  const forumActive = forumPulse.activity?.activeToday ?? 0;
  const touchTotal = pulse.activity?.touchpoints?.total ?? 0;
  const touchpointCoveragePct = registered ? pct(activeToday, registered) : 0;
  const forumActivityRatePct = forumRegistered ? pct(forumActive, forumRegistered) : 0;

  const statePulse = (stateCheck as { emotionalPulse?: {
    avgEnergy?: number | null;
    riskFatiguePct?: number | null;
    topReasons?: { token: string; count: number }[];
    zonesPercent?: Record<string, number>;
    byPhase?: Record<string, Record<string, number>>;
    phaseCounts?: Record<string, number>;
    emotions?: { label: string; count: number; pct: number }[];
  } }).emotionalPulse;
  const afterBlocksByEvent = (afterBlocks as { byEvent?: { label: string; count: number; pct: number }[] }).byEvent ?? [];
  const avgEnergy = statePulse?.avgEnergy ?? null;
  const riskFatiguePct = statePulse?.riskFatiguePct ?? null;

  const textPool: string[] = [];
  for (const q of evening.questions ?? []) {
    for (const a of q.answers ?? []) {
      if (typeof a.answer === 'string' && a.answer.trim().length > 12) textPool.push(a.answer.trim());
    }
  }
  for (const q of afterBlocks.questions ?? []) {
    for (const a of q.answers ?? []) {
      if (a.answer?.trim()) textPool.push(a.answer.trim());
    }
  }
  const quotes = textPool
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .map(text => ({ text: text.length > 220 ? `${text.slice(0, 220)}…` : text }));

  const departureDir = (portrait.departure?.byDirection ?? []).find(
    (d: { direction: string }) => d.direction === direction,
  ) ?? (portrait.departure?.byDirection ?? [])[0] ?? null;

  const piggyEntries = piggybank.entries ?? [];
  const piggyByPerson = new Map<number, number>();
  for (const e of piggyEntries) {
    piggyByPerson.set(e.participantId, (piggyByPerson.get(e.participantId) || 0) + 1);
  }
  const piggyTop = [...piggyByPerson.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([participantId, count]) => {
      const p = registeredPeople.find(x => x.id === participantId);
      return {
        participantId,
        name: p ? fullName(p) : `#${participantId}`,
        count,
      };
    });

  const ratingTop = (activity.ratings?.total ?? activity.ratings?.day ?? []).slice(0, 15);

  const roleDistribution = portrait.preStart?.roleDistribution ?? [];
  const calendarDate = dayFilter != null
    ? forumDayCalendarDate(settings.startDate ?? null, dayFilter)
    : null;

  const notes: string[] = [
    ...(evening.diagnostics?.notes ?? []),
    ...(afterBlocks.diagnostics?.notes ?? []),
    ...(stateCheck.diagnostics?.notes ?? []),
  ];
  if (!registered) notes.push('В направлении нет зарегистрированных участников в срезе.');

  return {
    requiresDirection: false,
    direction,
    filters: directionFilters,
    currentForumDay,
    title: 'Аналитика направления',
    header: {
      direction,
      day: dayFilter,
      days,
      dayLabel: dayFilter != null ? `D${dayFilter}` : 'Вся смена',
      calendarDate,
      group: filters.group?.trim() || null,
    },
    groupsAvailable,
    kpi: {
      registered,
      activeToday,
      touchpointCoveragePct,
      touchpointsTotal: touchTotal,
      avgEnergy,
      riskFatiguePct,
      eveningSubmitted,
      afterBlocksSubmitted: afterSubmitted,
      stateCheckSubmitted: stateSubmitted,
      eveningFillPct: pct(eveningSubmitted, registered),
      afterBlocksFillPct: pct(afterSubmitted, registered),
      stateCheckFillPct: pct(stateSubmitted, registered),
    },
    forumCompare: {
      registered: forumRegistered,
      activityRatePct: forumActivityRatePct,
      directionActivityRatePct: touchpointCoveragePct,
    },
    stateCheck: {
      activity: stateCheck.activity,
      emotionalPulse: statePulse ?? null,
      questions: stateCheck.questions,
      exportPath: stateCheck.exportPath,
    },
    evening: {
      activity: evening.activity,
      questions: evening.questions,
      diagnostics: evening.diagnostics,
      exportPath: evening.exportPath,
    },
    afterBlocks: {
      activity: afterBlocks.activity,
      byEvent: afterBlocksByEvent,
      questions: afterBlocks.questions,
      exportPath: afterBlocks.exportPath,
    },
    program: {
      directionRatings: program.blocks?.direction ?? [],
      topEvents: (program.dayEvents?.topEvents ?? []).slice(0, 12),
      topMentions: (program.dayEvents?.topMentions ?? []).slice(0, 15),
      nps: program.nps ?? null,
    },
    activity: {
      participants: activity.participants,
      pointsByDay: activity.pointsByDay ?? [],
      engagementSeries: activity.engagementSeries ?? [],
      ratingTop,
      pointsByNomination: (activity.pointsByNomination ?? []).slice(0, 8),
    },
    piggybank: {
      total: piggybank.navigation?.total ?? piggyEntries.length,
      topThemes: (piggybank.topThemes ?? []).slice(0, 15),
      topParticipants: piggyTop,
    },
    portrait: {
      completedBoth: portrait.departure?.completedBoth ?? 0,
      departure: departureDir,
      goalTopTokens: (portrait.preStart?.goalTopTokens ?? []).slice(0, 15),
      interestTop: (portrait.preStart?.interestTop ?? []).slice(0, 15),
      roleDistribution,
      quotes,
      themeTokens: topReasonTokens(textPool, 20),
    },
    ops: {
      missingEvening: missingFrom(registeredPeople, eveningPeople),
      missingAfterBlocks: missingFrom(registeredPeople, afterIds),
      missingStateCheck: missingFrom(registeredPeople, stateIds),
      byGroup,
    },
    participants: registeredPeople.map(p => ({
      participantId: p.id,
      name: fullName(p),
      group: p.groupName || 'без группы',
      filledEvening: eveningPeople.has(p.id),
      filledAfterBlocks: afterIds.has(p.id),
      filledStateCheck: stateIds.has(p.id),
    })),
    diagnostics: { notes: [...new Set(notes)].slice(0, 12) },
    exportPath: exportPathFor(directionFilters),
    sectionExports: {
      evening: evening.exportPath,
      afterBlocks: afterBlocks.exportPath,
      stateChecks: stateCheck.exportPath,
    },
  };
}
