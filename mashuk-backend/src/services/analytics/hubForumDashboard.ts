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
import { buildActivityDashboard } from './activityDashboard.js';
import { buildPiggybankDashboard } from './piggybankDashboard.js';
import { buildPortraitDashboard } from './portraitDashboard.js';
import { buildExchangeAnalytics } from './exchangeAnalytics.js';
import { computeLeaderboardScores } from '../leaderboardService.js';
import { buildRoleDirectionMatrix } from './roleDirectionMatrix.js';
import { forumSeriesDays } from './dayComparison.js';

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
 * Композер линзы «Форум» для вкладки «Штаб».
 * Формы pulse/evening/afterBlocks совпадают с /analytics/dashboards/*,
 * плюс exchange + community + byDirection roll-up.
 */
export async function buildHubForumDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const forumFilters: AnalyticsFilters = { ...filters, direction: null, group: null };

  const [
    cohort,
    pulse,
    stateCheckRaw,
    evening,
    afterBlocks,
    activity,
    piggybank,
    portrait,
    exchange,
    community,
  ] = await Promise.all([
    loadCohortParticipants(forumFilters, req),
    buildPulseDashboard(forumFilters, req),
    buildStateCheckDashboard(forumFilters, req),
    buildEveningDashboard(forumFilters, req),
    buildKindDashboard('after_blocks', forumFilters, req),
    buildActivityDashboard(forumFilters, req),
    buildPiggybankDashboard(forumFilters, req),
    buildPortraitDashboard(forumFilters, req),
    buildExchangeAnalytics(forumFilters, req),
    loadCommunityQueueCounts(),
  ]);

  const roleDirectionMatrix = await buildRoleDirectionMatrix(
    cohort,
    forumSeriesDays(pulse.currentForumDay ?? 1),
  );

  const stateCheck = stateCheckRaw as typeof stateCheckRaw & {
    emotionalPulse?: {
      avgEnergy?: number | null;
      riskFatiguePct?: number | null;
      phaseCounts?: Record<string, number>;
      topReasons?: { token: string; count: number }[];
      energyByDay?: { day: number; avg: number | null; responses: number }[];
      energyByDirectionDay?: { direction: string; day: number; avg: number | null; responses: number }[];
    };
  };
  const scPulse = stateCheck.emotionalPulse ?? {};

  const completionByDirection = pulse.activity.completionByDirection ?? [];
  const byDirection = completionByDirection.map(row => ({
    direction: row.direction,
    registered: row.registered,
    activeParticipants: row.activeParticipants,
    activityRatePct: row.activityRatePct,
  }));

  /** Зарегистрированы, но 0 активности — по completionByDirection: registered − active. */
  const zeroActivityCount = byDirection.reduce(
    (sum, row) => sum + Math.max(0, (row.registered ?? 0) - (row.activeParticipants ?? 0)),
    0,
  );

  const registered = pulse.activity.registered ?? cohort.length;
  const activeToday = pulse.activity.activeToday ?? 0;
  const touchpointCoveragePct = registered
    ? Math.round((activeToday / registered) * 1000) / 10
    : 0;

  /** Метрики направлений для radar / сравнений (нормировка 0–100 на фронте по max). */
  const energyRows = (scPulse.energyByDirectionDay ?? []) as {
    direction: string; day: number; avg: number | null; responses: number;
  }[];
  const zoneByDir = new Map(
    ((pulse.emotionalPulse?.byDirection ?? []) as { direction: string; zones: Record<string, number> }[])
      .map(r => [r.direction, r.zones]),
  );
  const piggyByDir = new Map(
    ((piggybank as { byDirection?: { direction: string; count: number }[] }).byDirection ?? [])
      .map(r => [r.direction, r.count]),
  );
  const cohortIds = cohort.map(p => p.id);
  const totalScores = cohortIds.length
    ? await computeLeaderboardScores(cohortIds, { scope: 'shift', track: 'total' })
    : new Map<number, number>();
  const pointsByDir = new Map<string, { sum: number; n: number }>();
  for (const p of cohort) {
    const d = p.direction || '—';
    const pts = totalScores.get(p.id) ?? 0;
    const cur = pointsByDir.get(d) ?? { sum: 0, n: 0 };
    cur.sum += pts;
    cur.n += 1;
    pointsByDir.set(d, cur);
  }
  const energyAgg = new Map<string, { sum: number; n: number }>();
  for (const r of energyRows) {
    if (r.avg == null || !r.responses) continue;
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
    const pAgg = pointsByDir.get(row.direction);
    const avgPoints = pAgg && pAgg.n ? Math.round((pAgg.sum / pAgg.n) * 10) / 10 : 0;
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
      avgPoints,
      piggyCount,
      piggyPerCapita,
    };
  });

  const mergedPulse = {
    ...pulse,
    emotionalPulse: {
      ...pulse.emotionalPulse,
      avgEnergy: scPulse.avgEnergy ?? null,
      riskFatiguePct: scPulse.riskFatiguePct ?? null,
      phaseCounts: scPulse.phaseCounts ?? pulse.activity?.stateChecks ?? null,
      topReasons: scPulse.topReasons ?? pulse.stateReasons?.topTokens ?? [],
      energyByDay: scPulse.energyByDay ?? [],
      energyByDirectionDay: scPulse.energyByDirectionDay ?? [],
    },
    stateCheck: {
      activity: stateCheck.activity,
      byDirection: stateCheck.byDirection,
      questions: stateCheck.questions,
      exportPath: stateCheck.exportPath,
      diagnostics: stateCheck.diagnostics,
      daySeries: stateCheck.daySeries,
      byDirectionDaySeries: stateCheck.byDirectionDaySeries,
    },
  };

  return {
    filters: forumFilters,
    currentForumDay: pulse.currentForumDay,
    kpi: {
      registered,
      activeToday,
      touchpointCoveragePct,
      avgEnergy: scPulse.avgEnergy ?? null,
      riskFatiguePct: scPulse.riskFatiguePct ?? null,
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
    activity,
    piggybank,
    portrait,
    exchange,
    community,
    byDirection,
    directionMetrics,
    daySeries: pulse.activity.daySeries ?? [],
    byDirectionDaySeries: pulse.activity.byDirectionDaySeries ?? [],
    touchpointThreshold: pulse.activity.touchpointThreshold ?? null,
    touchpointSlotCoverage: pulse.activity.touchpointSlotCoverage ?? null,
    roleDirectionMatrix,
  };
}
