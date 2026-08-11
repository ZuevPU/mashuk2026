import { count, eq } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { exchangeQuestions, orgThreads } from '../../db/schema.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { buildPulseDashboard } from './pulseDashboard.js';
import { buildStateCheckDashboard } from './stateCheckDashboard.js';
import { buildEveningDashboard } from './eveningDashboard.js';
import { buildKindDashboard } from './questionKindDashboard.js';
import { buildPiggybankDashboard } from './piggybankDashboard.js';
import { buildExchangeAnalytics } from './exchangeAnalytics.js';
import { buildRoleDirectionMatrix } from './roleDirectionMatrix.js';
import { forumSeriesDays } from './dayComparison.js';
import {
  buildTouchpointSlotCoverage,
  buildTouchpointThresholdCoverage,
} from './touchpointMetrics.js';
import { getForumSettings } from '../helpers.js';

async function loadCommunityQueueCounts() {
  const [[pendingExchange], [orgWaiting], [activeExchange]] = await Promise.all([
    db.select({ count: count() }).from(exchangeQuestions)
      .where(eq(exchangeQuestions.moderationStatus, 'pending')),
    db.select({ count: count() }).from(orgThreads)
      .where(eq(orgThreads.status, 'waiting')),
    db.select({ count: count() }).from(exchangeQuestions)
      .where(eq(exchangeQuestions.moderationStatus, 'approved')),
  ]);
  return {
    pendingExchange: Number(pendingExchange?.count ?? 0),
    orgQuestionsWaiting: Number(orgWaiting?.count ?? 0),
    activeExchange: Number(activeExchange?.count ?? 0),
  };
}

/**
 * Композер линзы «Форум» для вкладки «Штаб» — облегчённый путь без дампов ответов
 * и без тяжёлых панелей точек (их грузит buildHubForumExtras).
 */
export async function buildHubForumDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const forumFilters: AnalyticsFilters = { ...filters, direction: null, group: null };
  const slim = { slim: true as const };

  const [
    cohort,
    pulse,
    stateCheckRaw,
    eveningRaw,
    afterBlocksRaw,
    piggybankRaw,
    community,
  ] = await Promise.all([
    loadCohortParticipants(forumFilters, req),
    buildPulseDashboard(forumFilters, req, {
      skipTouchpointPanels: true,
      skipActivitySeries: true,
    }),
    buildStateCheckDashboard(forumFilters, req, slim),
    buildEveningDashboard(forumFilters, req, slim),
    buildKindDashboard('after_blocks', forumFilters, req, slim),
    buildPiggybankDashboard(forumFilters, req, slim),
    loadCommunityQueueCounts(),
  ]);

  const stateCheck = stateCheckRaw as typeof stateCheckRaw & {
    emotionalPulse?: {
      avgEnergy?: number | null;
      riskFatiguePct?: number | null;
      phaseCounts?: Record<string, number>;
      topReasons?: { token: string; count: number }[];
      energyByDay?: { day: number; avg: number | null; responses: number }[];
      energyByDirectionDay?: { direction: string; day: number; avg: number | null; responses: number }[];
      directionEmotionEnergy?: {
        direction: string;
        day: number;
        energyAvg: number | null;
        responses: number;
        energyResponses: number;
        zones: Record<string, number>;
        riskFatiguePct: number;
        engagementLiftPct: number;
        dominantZone: string;
      }[];
    };
  };
  const scPulse = stateCheck.emotionalPulse ?? {};

  const registered = pulse.activity.registered ?? cohort.length;
  const selectedDay = forumFilters.day != null && forumFilters.day >= 1 ? forumFilters.day : null;
  const daySeries = (pulse.activity.daySeries ?? []) as {
    day: number;
    active?: number;
    coveragePct?: number;
    registered?: number;
  }[];
  const dayRow = selectedDay != null ? daySeries.find(r => r.day === selectedDay) : null;

  /**
   * В режиме дня KPI «активны / охват» берём из daySeries выбранного дня форума.
   * pulse.activeToday — календарный «сегодня» по lastActiveAt и ломает сравнение D1/D2/D3.
   */
  const activeToday = dayRow?.active ?? pulse.activity.activeToday ?? 0;
  const touchpointCoveragePct = dayRow?.coveragePct != null
    ? dayRow.coveragePct
    : (registered ? Math.round((activeToday / registered) * 1000) / 10 : 0);

  const byDirectionDaySeries = (pulse.activity.byDirectionDaySeries ?? []) as {
    direction: string;
    day: number;
    active?: number;
    registered?: number;
    coveragePct?: number;
  }[];

  const completionByDirection = pulse.activity.completionByDirection ?? [];
  const byDirection = selectedDay != null && byDirectionDaySeries.some(r => r.day === selectedDay)
    ? byDirectionDaySeries
      .filter(r => r.day === selectedDay)
      .map(row => ({
        direction: row.direction,
        registered: row.registered ?? registered,
        activeParticipants: row.active ?? 0,
        activityRatePct: row.coveragePct ?? 0,
      }))
    : completionByDirection.map(row => ({
      direction: row.direction,
      registered: row.registered,
      activeParticipants: row.activeParticipants,
      activityRatePct: row.activityRatePct,
    }));

  const zeroActivityCount = byDirection.reduce(
    (sum, row) => sum + Math.max(0, (row.registered ?? 0) - (row.activeParticipants ?? 0)),
    0,
  );

  const energyByDay = (scPulse.energyByDay ?? []) as {
    day: number;
    avg: number | null;
    responses?: number;
    riskFatiguePct?: number | null;
  }[];
  const energyDayRow = selectedDay != null
    ? energyByDay.find(r => r.day === selectedDay)
    : null;
  const avgEnergy = energyDayRow?.avg ?? scPulse.avgEnergy ?? null;
  const riskFatiguePct = energyDayRow?.riskFatiguePct ?? scPulse.riskFatiguePct ?? null;

  const energyRows = (scPulse.energyByDirectionDay ?? []) as {
    direction: string; day: number; avg: number | null; responses: number;
  }[];
  const zoneByDir = new Map(
    ((pulse.emotionalPulse?.byDirection ?? []) as { direction: string; zones: Record<string, number> }[])
      .map(r => [r.direction, r.zones]),
  );
  const piggyByDir = new Map(
    ((piggybankRaw as { byDirection?: { direction: string; count: number }[] }).byDirection ?? [])
      .map(r => [r.direction, r.count]),
  );

  // Без полного pointsLog — иначе /hub/forum часто упирается в таймаут прокси.
  const energyAgg = new Map<string, { sum: number; n: number }>();
  for (const r of energyRows) {
    if (r.avg == null || !r.responses) continue;
    if (selectedDay != null && r.day !== selectedDay) continue;
    const cur = energyAgg.get(r.direction) ?? { sum: 0, n: 0 };
    cur.sum += r.avg * r.responses;
    cur.n += r.responses;
    energyAgg.set(r.direction, cur);
  }
  const directionMetrics = byDirection.map(row => {
    const zones = zoneByDir.get(row.direction) ?? {};
    const engagementLiftPct = Math.round(
      ((Number(zones.engagement) || 0) + (Number(zones.lift) || 0)) * 10,
    ) / 10;
    const eAgg = energyAgg.get(row.direction);
    const energyAvg = eAgg && eAgg.n ? Math.round((eAgg.sum / eAgg.n) * 10) / 10 : null;
    const piggyCount = piggyByDir.get(row.direction) ?? 0;
    const piggyPerCapita = row.registered
      ? Math.round((piggyCount / row.registered) * 100) / 100
      : 0;
    return {
      direction: row.direction,
      registered: row.registered,
      coveragePct: row.activityRatePct,
      energyAvg,
      engagementLiftPct,
      avgPoints: 0,
      piggyCount,
      piggyPerCapita,
    };
  });

  const evening = {
    activity: eveningRaw.activity,
    scaleAverages: eveningRaw.scaleAverages,
    scaleOverallAvg: eveningRaw.scaleOverallAvg,
    scaleByDay: eveningRaw.scaleByDay,
    scaleByDirectionDay: eveningRaw.scaleByDirectionDay,
    practiceRecommendNps: eveningRaw.practiceRecommendNps,
  };

  const afterBlocks = {
    activity: afterBlocksRaw.activity,
    byEvent: (afterBlocksRaw as { byEvent?: unknown }).byEvent ?? [],
  };

  const piggybank = {
    topThemes: (piggybankRaw as { topThemes?: unknown }).topThemes ?? [],
    byDirection: (piggybankRaw as { byDirection?: unknown }).byDirection ?? [],
  };

  const mergedPulse = {
    ...pulse,
    emotionalPulse: {
      ...pulse.emotionalPulse,
      avgEnergy,
      riskFatiguePct,
      phaseCounts: scPulse.phaseCounts ?? pulse.activity?.stateChecks ?? null,
      topReasons: scPulse.topReasons ?? pulse.stateReasons?.topTokens ?? [],
      energyByDay: scPulse.energyByDay ?? [],
      energyByDirectionDay: scPulse.energyByDirectionDay ?? [],
      directionEmotionEnergy: scPulse.directionEmotionEnergy ?? [],
    },
  };

  return {
    filters: forumFilters,
    currentForumDay: pulse.currentForumDay,
    kpi: {
      registered,
      activeToday,
      touchpointCoveragePct,
      avgEnergy,
      riskFatiguePct,
      eveningSubmitted: evening.activity?.submitted ?? 0,
      eveningFillPct: evening.activity?.fillRatePct ?? null,
      afterBlocksSubmitted: afterBlocks.activity?.submitted ?? 0,
      afterBlocksFillPct: afterBlocks.activity?.fillRatePct ?? null,
      stateCheckSubmitted: stateCheck.activity?.submitted ?? 0,
      stateCheckFillPct: stateCheck.activity?.fillRatePct ?? null,
      phaseCounts: scPulse.phaseCounts ?? null,
      zeroActivityCount,
      cohortSize: cohort.length,
    },
    pulse: mergedPulse,
    evening,
    afterBlocks,
    piggybank,
    exchange: null,
    community,
    byDirection,
    directionMetrics,
    daySeries: pulse.activity.daySeries ?? [],
    byDirectionDaySeries: pulse.activity.byDirectionDaySeries ?? [],
    // Тяжёлые панели — отдельный endpoint /hub/forum-extras
    touchpointThreshold: null,
    touchpointSlotCoverage: null,
    roleDirectionMatrix: null,
    directionEmotionEnergy: scPulse.directionEmotionEnergy ?? [],
  };
}

/** Вторая фаза: точки охвата + heatmap ролей + обмен (после основного /hub/forum). */
export async function buildHubForumExtras(filters: AnalyticsFilters, req?: AdminRequest) {
  const forumFilters: AnalyticsFilters = { ...filters, direction: null, group: null };
  const cohort = await loadCohortParticipants(forumFilters, req);
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const seriesDays = forumSeriesDays(currentDay);

  const [touchpointThreshold, touchpointSlotCoverage, roleDirectionMatrix, exchange] = await Promise.all([
    buildTouchpointThresholdCoverage(cohort, seriesDays, forumFilters.shiftId),
    buildTouchpointSlotCoverage(cohort, seriesDays, forumFilters.shiftId),
    buildRoleDirectionMatrix(cohort, seriesDays),
    buildExchangeAnalytics(forumFilters, req),
  ]);

  return {
    touchpointThreshold,
    touchpointSlotCoverage,
    roleDirectionMatrix,
    exchange,
  };
}
