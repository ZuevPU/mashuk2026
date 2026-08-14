import { and, count, eq } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { exchangeQuestions, orgThreads, participants } from '../../db/schema.js';
import { getForumSettings } from '../helpers.js';
import { resolveAnalyticsFilters } from './analyticsQuery.js';
import { listFilterOptions } from './cohort.js';
import { getRoleTaxonomyPayload } from './roleTaxonomy.js';
import { analyticsRefreshMs, semanticV2Enabled } from './refreshScheduler.js';
import { buildPulseDashboard } from './pulseDashboard.js';
import { buildPortraitDashboard } from './portraitDashboard.js';
import { buildProgramDashboard } from './programDashboard.js';
import { buildActivityDashboard } from './activityDashboard.js';
import { buildPiggybankDashboard } from './piggybankDashboard.js';
import { buildSemanticDashboard, buildClubsDashboard } from './semanticDashboard.js';
import { buildExchangeAnalytics } from './exchangeAnalytics.js';
import { buildEveningDashboard } from './eveningDashboard.js';
import { buildStateCheckDashboard } from './stateCheckDashboard.js';
import { DASHBOARD_CATALOG, forumDayCalendarDate } from './dashboardCatalog.js';
import { resolveAdminShiftId } from '../shiftService.js';

async function loadCommunityQueueCounts(shiftId: number | null) {
  const exchangeScope = (status: 'pending' | 'approved') => {
    const statusEq = eq(exchangeQuestions.moderationStatus, status);
    return shiftId != null
      ? and(statusEq, eq(participants.shiftId, shiftId))
      : statusEq;
  };
  const [[pendingExchange], [orgWaiting], [activeExchange]] = await Promise.all([
    db.select({ count: count() }).from(exchangeQuestions)
      .innerJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .where(exchangeScope('pending')),
    db.select({ count: count() }).from(orgThreads)
      .where(eq(orgThreads.status, 'waiting')),
    db.select({ count: count() }).from(exchangeQuestions)
      .innerJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .where(exchangeScope('approved')),
  ]);
  return {
    pendingExchange: Number(pendingExchange?.count ?? 0),
    orgQuestionsWaiting: Number(orgWaiting?.count ?? 0),
    activeExchange: Number(activeExchange?.count ?? 0),
  };
}

export async function buildAnalyticsMeta(req: AdminRequest) {
  const settings = await getForumSettings();
  const shiftId = await resolveAdminShiftId(req);
  const filters = await listFilterOptions(shiftId);
  const roleTaxonomy = await getRoleTaxonomyPayload();
  const currentForumDay = settings.currentDay ?? 1;
  const forumDays = Array.from({ length: settings.totalDays ?? 8 }, (_, i) => {
    const day = i + 1;
    return {
      day,
      label: `D${day}`,
      calendarDate: forumDayCalendarDate(settings.startDate, day),
    };
  });
  return {
    currentForumDay,
    forumStartDate: settings.startDate ?? null,
    forumDays,
    refreshMs: analyticsRefreshMs(),
    semanticV2: semanticV2Enabled(),
    modes: ['today', 'day', 'shift', 'compare'] as const,
    filters,
    roleTaxonomy,
    dashboardCatalog: DASHBOARD_CATALOG,
  };
}

export async function composeLegacyDashboards(req: AdminRequest) {
  const filters = await resolveAnalyticsFilters(req);
  const [pulse, portrait, program, activity, piggybank, semantic, community, exchange, evening, stateCheck] = await Promise.all([
    buildPulseDashboard(filters, req),
    buildPortraitDashboard(filters, req),
    buildProgramDashboard(filters, req),
    buildActivityDashboard(filters, req),
    buildPiggybankDashboard(filters, req),
    buildSemanticDashboard(filters, req),
    loadCommunityQueueCounts(filters.shiftId),
    buildExchangeAnalytics(filters, req),
    buildEveningDashboard(filters, req),
    buildStateCheckDashboard(filters, req),
  ]);
  const scPulse = (stateCheck as {
    emotionalPulse?: {
      avgEnergy?: number | null;
      energyByDay?: { day: number; avg: number | null; responses: number }[];
      energyByDirectionDay?: { direction: string; day: number; avg: number | null; responses: number }[];
    };
  }).emotionalPulse ?? {};
  return {
    mode: filters.mode,
    day: filters.day,
    community,
    exchange,
    evening: {
      submitted: evening.activity.submitted,
      fillRatePct: evening.activity.fillRatePct,
      scaleAverages: evening.scaleAverages ?? [],
      scaleOverallAvg: evening.scaleOverallAvg ?? null,
      scaleByDay: evening.scaleByDay ?? [],
      scaleByDirectionDay: evening.scaleByDirectionDay ?? [],
    },
    energy: {
      avg: scPulse.avgEnergy ?? null,
      byDay: scPulse.energyByDay ?? [],
      byDirectionDay: scPulse.energyByDirectionDay ?? [],
    },
    pulse: {
      registered: pulse.activity.registered,
      activeToday: pulse.activity.activeToday,
      eveningCompleted: pulse.activity.eveningCompleted,
      totalAnswers: pulse.activity.activitySeries.reduce((s, d) => s + d.answers, 0),
      energySeries: scPulse.energyByDay ?? [],
      completionByDay: pulse.activity.activitySeries,
      daySeries: pulse.activity.daySeries ?? [],
      byDirectionDaySeries: pulse.activity.byDirectionDaySeries ?? [],
      touchpointThreshold: pulse.activity.touchpointThreshold ?? null,
      completionByDirection: pulse.activity.completionByDirection ?? [],
      stateReasonsTop: pulse.stateReasons?.topTokens?.slice(0, 8) ?? [],
    },
    portrait: {
      roleDistribution: Object.fromEntries(
        portrait.preStart.roleDistribution.map(r => [r.key, r.count]),
      ),
      roleList: portrait.preStart.roleDistribution,
      directionDistribution: Object.fromEntries(portrait.preStart.byDirection.map(r => [r.key, r.count])),
      groupDistribution: Object.fromEntries(portrait.preStart.byGroup.map(r => [r.key, r.count])),
      goalTopTokens: portrait.preStart.goalTopTokens?.slice(0, 8) ?? [],
      completedBoth: portrait.departure?.completedBoth,
    },
    program: {
      eventsCount: program.dayEvents.topEvents.length,
      scaleAverages: program.blocks.workshops,
      topEvents: program.dayEvents.topEvents,
      topMentions: program.dayEvents?.topMentions?.slice(0, 8) ?? [],
      divergenceCount: (program.divergenceExtended ?? program.divergence ?? []).length,
    },
    activity: {
      pathLeaders: (activity.ratings.path ?? []).slice(0, 5),
      topTotal: (activity.ratings.total ?? []).slice(0, 5),
      tasksApproved: activity.tasks.popular.reduce((s, t) => s + t.count, 0),
      tasksPendingModeration: activity.tasks.pendingModeration,
      teamPendingConfirm: activity.tasks.pendingTeam,
      popularTasks: (activity.tasks.popular ?? []).slice(0, 5),
      emotionZones: pulse.emotionalPulse.zonesPercent,
      reflectionDepth: {},
      participants: activity.participants,
    },
    piggybank: {
      total: piggybank.navigation.total,
      byTag: Object.fromEntries(Object.entries(piggybank.byTag).map(([k, v]) => [k, v.count])),
      series: Object.entries(piggybank.byTag).map(([tag, v]) => ({ tag, value: v.count })),
      vRabotaTotal: piggybank.vRabota?.total,
      vRabotaByDirection: (piggybank.vRabota?.byDirection ?? []).slice(0, 6),
    },
    semantic,
    education: program.blocks,
  };
}
