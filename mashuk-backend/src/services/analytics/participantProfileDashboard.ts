import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { buildPulseDashboard } from './pulseDashboard.js';
import { buildStateCheckDashboard } from './stateCheckDashboard.js';
import { buildEveningDashboard } from './eveningDashboard.js';
import { buildAfterBlocksDashboard } from './afterBlocksDashboard.js';
import { buildActivityDashboard } from './activityDashboard.js';
import { buildPiggybankDashboard } from './piggybankDashboard.js';
import { buildPortraitDashboard } from './portraitDashboard.js';
import { buildProgramDashboard } from './programDashboard.js';
import { buildExchangeAnalytics } from './exchangeAnalytics.js';
import { buildTouchpointThresholdCoverage, buildParticipantTouchpointEngagement } from './touchpointMetrics.js';
import {
  ENGAGEMENT_THRESHOLDS,
  PROFILE_RULE_THRESHOLDS,
  SEGMENT_LABELS,
  buildProfileRecommendations,
  engagementSegment,
  normalizeScaleToPct,
  numericSummary,
  type EngagementSegmentId,
  type NumericSummary,
} from './participantProfileStats.js';

function pct(n: number, den: number): number | null {
  if (!den) return null;
  return Math.round((n / den) * 1000) / 10;
}

function modeLabel(items: { label: string; count: number; pct?: number }[]): string | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => b.count - a.count)[0]?.label ?? null;
}

function zoneMode(zones: Record<string, number> | undefined, labels: Record<string, string> | undefined): string | null {
  if (!zones) return null;
  let bestKey: string | null = null;
  let best = -1;
  for (const [k, v] of Object.entries(zones)) {
    if (typeof v === 'number' && v > best) {
      best = v;
      bestKey = k;
    }
  }
  if (!bestKey) return null;
  return labels?.[bestKey] ?? bestKey;
}

function sampleTitle(opts: {
  currentDay: number;
  filters: AnalyticsFilters;
  sampleSize: number;
}): string {
  const parts = ['Образ участника'];
  if (opts.filters.mode === 'day' && opts.filters.day != null) {
    parts.push(`D${opts.filters.day}`);
  } else if (opts.filters.mode === 'shift') {
    parts.push('вся смена');
  } else {
    parts.push(`D${opts.currentDay}`);
  }
  if (opts.filters.direction?.trim()) {
    parts.push(`направление «${opts.filters.direction.trim()}»`);
  } else if (opts.filters.group?.trim()) {
    parts.push(`группа «${opts.filters.group.trim()}»`);
  } else {
    parts.push('весь форум');
  }
  parts.push(`${opts.sampleSize} участников`);
  return parts.join(' · ');
}

function categoricalFromCountMap(
  items: { key?: string; token?: string; label?: string; count: number }[],
  sampleSize: number,
  uniqueParticipants?: number,
) {
  return items.map(it => {
    const label = it.label ?? it.key ?? it.token ?? '—';
    const unique = uniqueParticipants ?? it.count;
    return {
      label,
      count: it.count,
      uniqueParticipants: unique,
      pct: sampleSize ? Math.round((unique / sampleSize) * 1000) / 10 : 0,
    };
  });
}

export async function buildParticipantProfileDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const cohort = await loadCohortParticipants(filters, req);
  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const sampleSize = registered.length;
  const denominator = sampleSize;

  const [
    pulse,
    stateCheck,
    evening,
    afterBlocks,
    activity,
    piggybank,
    portrait,
    program,
    exchange,
    touchpointThreshold,
    engagement,
  ] = await Promise.all([
    buildPulseDashboard(filters, req),
    buildStateCheckDashboard(filters, req),
    buildEveningDashboard(filters, req),
    buildAfterBlocksDashboard(filters, req),
    buildActivityDashboard(filters, req),
    buildPiggybankDashboard(filters, req),
    buildPortraitDashboard(filters, req),
    buildProgramDashboard(filters, req),
    buildExchangeAnalytics(filters, req),
    buildTouchpointThresholdCoverage(registered, days, filters.shiftId),
    buildParticipantTouchpointEngagement(registered, days, filters.shiftId),
  ]);

  const scPulse = (stateCheck as {
    emotionalPulse?: {
      avgEnergy?: number | null;
      medianEnergy?: number | null;
      energyCount?: number;
      riskFatiguePct?: number | null;
      zonesPercent?: Record<string, number>;
      zoneLabels?: Record<string, string>;
      emotions?: { label: string; count: number; pct: number }[];
      byPhase?: Record<string, Record<string, number>>;
      phaseCounts?: Record<string, number>;
      topReasons?: { token: string; count: number }[];
      energyByDay?: {
        day: number;
        avg: number | null;
        median?: number | null;
        responses: number;
        riskFatiguePct?: number | null;
      }[];
      energyByDirectionDay?: {
        direction: string;
        day: number;
        avg: number | null;
        median?: number | null;
        responses: number;
      }[];
    };
    activity?: { submitted?: number; cohortSize?: number; fillRatePct?: number; uniqueParticipants?: number };
  }).emotionalPulse ?? {};

  const energyStats: NumericSummary = {
    avg: scPulse.avgEnergy ?? null,
    median: scPulse.medianEnergy ?? null,
    min: null,
    max: null,
    count: scPulse.energyCount ?? 0,
  };

  const slotsTotal = engagement.slotsTotal || 7;
  const scoresWithData = engagement.scores.filter(s => s.hasData);
  const completedValues = scoresWithData.map(s => s.avgCompleted);
  const touchpointStats = numericSummary(completedValues);
  const noDataPct = pct(engagement.scores.filter(s => !s.hasData).length, denominator);

  const dist0to7 = Array.from({ length: slotsTotal + 1 }, (_, k) => ({
    completed: k,
    count: scoresWithData.filter(s => Math.round(s.avgCompleted) === k).length,
  }));

  const atLeast = (k: number) => scoresWithData.filter(s => s.avgCompleted >= k).length;

  const eveningAct = evening.activity as {
    submitted?: number;
    cohortSize?: number;
    fillRatePct?: number;
    drafts?: number;
  };
  const afterAct = (afterBlocks as { activity?: { submitted?: number; fillRatePct?: number; uniqueParticipants?: number } }).activity ?? {};
  const stateAct = (stateCheck as { activity?: { submitted?: number; fillRatePct?: number; uniqueParticipants?: number } }).activity ?? {};

  const eveningFillPct = eveningAct.fillRatePct ?? pct(eveningAct.submitted ?? 0, denominator);
  const stateFillPct = stateAct.fillRatePct ?? pct(stateAct.uniqueParticipants ?? stateAct.submitted ?? 0, denominator);
  const afterFillPct = afterAct.fillRatePct ?? pct(afterAct.uniqueParticipants ?? afterAct.submitted ?? 0, denominator);

  const tasksApproved = activity.moderation?.approved ?? 0;
  const tasksRejected = activity.moderation?.rejected ?? 0;
  const tasksTotal = tasksApproved + tasksRejected + (activity.moderation?.pending ?? 0);
  const taskApprovalPct = tasksApproved + tasksRejected
    ? Math.round((tasksApproved / (tasksApproved + tasksRejected)) * 1000) / 10
    : null;
  const participantsWithTasks = activity.participants?.completedAtLeastOneTask ?? 0;
  const avgPoints = (() => {
    const totalPts = (activity.pointsByDay ?? []).reduce((s: number, d: { points: number }) => s + d.points, 0);
    return denominator ? Math.round((totalPts / denominator) * 10) / 10 : null;
  })();

  const exchangeParticipants = exchange.kpi?.uniqueAskers ?? 0;

  const piggyEntriesCount = (piggybank as { navigation?: { total?: number } }).navigation?.total
    ?? Object.values((piggybank as { byTag?: Record<string, { count: number }> }).byTag ?? {})
      .reduce((s, t) => s + (t?.count ?? 0), 0);

  const nothingDoneCount = engagement.scores.filter(s => s.avgCompleted === 0).length;

  // Scale averages with normalization
  const scaleRows = (evening.scaleAverages ?? []).map((q: {
    key: string; label: string; avg: number; answered: number; max: number; type: string;
  }) => ({
    ...q,
    avgPct: normalizeScaleToPct(q.avg, q.max),
    insufficient: q.answered < PROFILE_RULE_THRESHOLDS.minSample,
  }));

  let weightedPctSum = 0;
  let weightedPctN = 0;
  let weightedRaw5Sum = 0;
  let weightedRaw5N = 0;
  let weightedRaw10Sum = 0;
  let weightedRaw10N = 0;
  for (const q of scaleRows) {
    weightedPctSum += q.avgPct * q.answered;
    weightedPctN += q.answered;
    if (q.max === 5) {
      weightedRaw5Sum += q.avg * q.answered;
      weightedRaw5N += q.answered;
    } else if (q.max === 10) {
      weightedRaw10Sum += q.avg * q.answered;
      weightedRaw10N += q.answered;
    }
  }
  const programScore = {
    overallPct: weightedPctN ? Math.round((weightedPctSum / weightedPctN) * 10) / 10 : null,
    scale5: weightedRaw5N ? {
      avg: Math.round((weightedRaw5Sum / weightedRaw5N) * 10) / 10,
      count: weightedRaw5N,
    } : null,
    scale10: weightedRaw10N ? {
      avg: Math.round((weightedRaw10Sum / weightedRaw10N) * 10) / 10,
      count: weightedRaw10N,
    } : null,
    answered: weightedPctN,
  };

  const scaleByDay = (evening.scaleByDay ?? []).map((d: {
    day: number;
    overallAvg: number | null;
    answered: number;
    byQuestion: { avg: number; answered: number; max: number; label: string; key: string }[];
  }) => {
    let sum = 0;
    let n = 0;
    for (const q of d.byQuestion ?? []) {
      sum += normalizeScaleToPct(q.avg, q.max) * q.answered;
      n += q.answered;
    }
    return {
      day: d.day,
      overallPct: n ? Math.round((sum / n) * 10) / 10 : null,
      overallAvgRaw: d.overallAvg,
      answered: d.answered,
      byQuestion: (d.byQuestion ?? []).map(q => ({
        ...q,
        avgPct: normalizeScaleToPct(q.avg, q.max),
      })),
    };
  });

  // Question table with day-over-day delta (for latest day in filter)
  const focusDay = days.length === 1 ? days[0] : currentDay;
  const dayRow = scaleByDay.find((d: { day: number }) => d.day === focusDay);
  const prevRow = scaleByDay.find((d: { day: number }) => d.day === focusDay - 1);
  const questionTable = scaleRows.map((q: typeof scaleRows[0]) => {
    const todayQ = dayRow?.byQuestion?.find((x: { key: string }) => x.key === q.key);
    const prevQ = prevRow?.byQuestion?.find((x: { key: string }) => x.key === q.key);
    const delta = todayQ?.avg != null && prevQ?.avg != null
      ? Math.round((todayQ.avg - prevQ.avg) * 10) / 10
      : null;
    return {
      key: q.key,
      label: q.label,
      avg: q.avg,
      median: null as number | null,
      max: q.max,
      scale: `1–${q.max}`,
      avgPct: q.avgPct,
      answered: q.answered,
      insufficient: q.insufficient,
      deltaPrevDay: delta,
    };
  });

  const lowestScale5 = scaleRows
    .filter((q: typeof scaleRows[0]) => q.max === 5 && !q.insufficient)
    .sort((a: typeof scaleRows[0], b: typeof scaleRows[0]) => a.avg - b.avg)[0] ?? null;
  const highestScale = [...scaleRows].sort((a, b) => b.avgPct - a.avgPct)[0] ?? null;
  const lowestScale = [...scaleRows].sort((a, b) => a.avgPct - b.avgPct)[0] ?? null;

  // Per-participant energy / emotion from state-check answers (one pass, no N+1)
  const energyByPid = new Map<number, number[]>();
  const emotionByPid = new Map<number, Map<string, number>>();
  for (const q of (stateCheck as {
    questions?: { answers?: { participantId: number; energy: number | null; emotion: string | null }[] }[];
  }).questions ?? []) {
    for (const a of q.answers ?? []) {
      if (a.energy != null && Number.isFinite(a.energy)) {
        if (!energyByPid.has(a.participantId)) energyByPid.set(a.participantId, []);
        energyByPid.get(a.participantId)!.push(a.energy);
      }
      const emo = (a.emotion || '').trim();
      if (emo) {
        if (!emotionByPid.has(a.participantId)) emotionByPid.set(a.participantId, new Map());
        const m = emotionByPid.get(a.participantId)!;
        m.set(emo, (m.get(emo) || 0) + 1);
      }
    }
  }
  const avgEnergyFor = (pid: number): number | null => {
    const vals = energyByPid.get(pid);
    if (!vals?.length) return null;
    return vals.reduce((s, n) => s + n, 0) / vals.length;
  };

  // Segments
  const segmentBuckets = new Map<EngagementSegmentId, typeof engagement.scores>();
  for (const id of Object.keys(SEGMENT_LABELS) as EngagementSegmentId[]) {
    segmentBuckets.set(id, []);
  }
  for (const s of engagement.scores) {
    const seg = s.hasData ? engagementSegment(s.activityPct) : 'insufficient_data';
    segmentBuckets.get(seg)!.push(s);
  }

  const emotionMode = modeLabel(scPulse.emotions ?? []);
  const zoneModeLabel = zoneMode(scPulse.zonesPercent, scPulse.zoneLabels);

  const segments = (Object.keys(SEGMENT_LABELS) as EngagementSegmentId[]).map(id => {
    const list = segmentBuckets.get(id) ?? [];
    const dirCounts = new Map<string, number>();
    for (const s of list) dirCounts.set(s.direction, (dirCounts.get(s.direction) || 0) + 1);
    const topDirections = [...dirCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([direction, count]) => ({ direction, count }));
    const energies = list.map(s => avgEnergyFor(s.participantId)).filter((v): v is number => v != null);
    const emoAgg = new Map<string, number>();
    for (const s of list) {
      const m = emotionByPid.get(s.participantId);
      if (!m) continue;
      for (const [emo, c] of m) emoAgg.set(emo, (emoAgg.get(emo) || 0) + c);
    }
    const topEmotions = [...emoAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count }));
    return {
      id,
      label: SEGMENT_LABELS[id],
      count: list.length,
      pct: pct(list.length, denominator),
      avgTouchpoints: numericSummary(list.map(s => s.avgCompleted)).avg,
      avgActivityPct: numericSummary(list.map(s => s.activityPct)).avg,
      topDirections,
      avgEnergy: numericSummary(energies).avg,
      avgProgramPct: programScore.overallPct,
      tasksApprox: null as number | null,
      topEmotions,
    };
  });

  // Direction engagement table
  const dirMap = new Map<string, typeof engagement.scores>();
  for (const s of engagement.scores) {
    if (!dirMap.has(s.direction)) dirMap.set(s.direction, []);
    dirMap.get(s.direction)!.push(s);
  }
  const eveningByDir = new Map(
    (evening.byDirection ?? []).map((d: { direction: string; fillRatePct: number; submitted: number }) => [d.direction, d]),
  );
  const directionTable = [...dirMap.entries()].map(([direction, list]) => {
    const withData = list.filter(s => s.hasData);
    const stats = numericSummary(withData.map(s => s.avgCompleted));
    const all7 = withData.filter(s => s.avgCompleted >= slotsTotal).length;
    const ev = eveningByDir.get(direction);
    const coverage = pct(withData.filter(s => s.avgCompleted >= 1).length, list.length);
    return {
      direction,
      participants: list.length,
      avgTouchpoints: stats.avg,
      medianTouchpoints: stats.median,
      all7,
      tasks: null as number | null,
      eveningFillPct: ev?.fillRatePct ?? null,
      coveragePct: coverage,
    };
  }).sort((a, b) => (a.coveragePct ?? 0) - (b.coveragePct ?? 0) || a.direction.localeCompare(b.direction, 'ru'));

  // Direction lag vs forum (coverage)
  const forumCoverage = pct(atLeast(1), denominator) ?? 0;
  let laggingDirection: string | null = null;
  let directionLagPp: number | null = null;
  for (const row of directionTable) {
    if (row.participants < PROFILE_RULE_THRESHOLDS.minSample) continue;
    if (row.coveragePct == null) continue;
    const lag = forumCoverage - row.coveragePct;
    if (lag > (directionLagPp ?? -1)) {
      directionLagPp = Math.round(lag * 10) / 10;
      laggingDirection = row.direction;
    }
  }

  const touchpointCoveragePct = pct(atLeast(1), denominator);
  const energyByDay = scPulse.energyByDay ?? [];
  const energyPrev = energyByDay.length >= 2
    ? energyByDay[energyByDay.length - 2]?.avg ?? null
    : null;
  const energyLatest = energyByDay.length
    ? energyByDay[energyByDay.length - 1]?.avg ?? energyStats.avg
    : energyStats.avg;

  const highEnergyLowReflection = (
    energyStats.avg != null
    && energyStats.avg >= PROFILE_RULE_THRESHOLDS.highEnergy
    && (afterFillPct == null || afterFillPct < PROFILE_RULE_THRESHOLDS.lowReflectionFillPct)
  );

  const recommendations = buildProfileRecommendations({
    sampleSize,
    riskFatiguePct: scPulse.riskFatiguePct ?? null,
    energyAvg: energyLatest ?? null,
    energyPrevAvg: energyPrev,
    touchpointCoveragePct,
    eveningFillPct: eveningFillPct ?? null,
    lowestScaleAvg5: lowestScale5?.avg ?? null,
    lowestScaleLabel: lowestScale5?.label ?? null,
    directionLagPp: directionLagPp != null && directionLagPp >= PROFILE_RULE_THRESHOLDS.directionLagPp
      ? directionLagPp
      : null,
    laggingDirection,
    highEnergyLowReflection,
  });

  const interestTop = portrait.preStart?.interestTop ?? [];
  const goalTop = portrait.preStart?.goalTopTokens ?? [];
  const topInterestLabels = interestTop.slice(0, 3).map((i: { key: string }) => i.key).filter(Boolean);

  const activityPctTypical = touchpointStats.avg != null && slotsTotal
    ? Math.round((touchpointStats.avg / slotsTotal) * 1000) / 10
    : null;

  const insufficientSample = sampleSize < PROFILE_RULE_THRESHOLDS.minSample;

  let typicalSummary: string | null = null;
  if (!insufficientSample) {
    const bits: string[] = [];
    if (touchpointStats.avg != null) {
      bits.push(`активен в ${touchpointStats.avg} из ${slotsTotal} точек дня`);
    }
    if (energyStats.avg != null) {
      bits.push(`имеет среднюю энергию ${energyStats.avg}`);
    }
    if (zoneModeLabel) {
      bits.push(`чаще находится в зоне «${zoneModeLabel}»`);
    }
    if (activityPctTypical != null) {
      bits.push(`выполняет ${activityPctTypical}% доступных активностей (по точкам)`);
    }
    if (programScore.scale5?.avg != null) {
      bits.push(`оценивает программу на ${programScore.scale5.avg} из 5`);
    } else if (programScore.overallPct != null) {
      bits.push(`оценивает программу на ${programScore.overallPct}% от максимума шкалы`);
    }
    if (topInterestLabels.length) {
      bits.push(`чаще всего интересуется темами ${topInterestLabels.join(', ')}`);
    }
    typicalSummary = bits.length
      ? `Типичный участник выбранной группы: ${bits.join(', ')}.`
      : 'Типичный участник выбранной группы: недостаточно согласованных метрик для текстового портрета.';
  }

  const dataCompletenessPct = (() => {
    const signals = [
      energyStats.count > 0,
      scoresWithData.length > 0,
      (eveningAct.submitted ?? 0) > 0,
      (stateAct.submitted ?? 0) > 0,
    ];
    const ok = signals.filter(Boolean).length;
    return Math.round((ok / signals.length) * 1000) / 10;
  })();

  const activeParticipants = pulse.activity?.activeToday
    ?? activity.participants?.activeToday
    ?? scoresWithData.filter(s => s.avgCompleted >= 1).length;

  const vRabota = (piggybank as { vRabota?: { total?: number; sample?: { text?: string }[]; byDirection?: unknown[] } }).vRabota;
  const piggyThemes = (piggybank as { topThemes?: { token: string; count: number }[] }).topThemes ?? [];

  const meanings = {
    goals: categoricalFromCountMap(goalTop.slice(0, 15), sampleSize),
    interests: categoricalFromCountMap(
      interestTop.slice(0, 20).map((i: { key: string; count: number }) => ({ key: i.key, count: i.count })),
      sampleSize,
    ),
    piggyThemes: categoricalFromCountMap(
      piggyThemes.slice(0, 15).map(t => ({ token: t.token, count: t.count })),
      sampleSize,
    ),
    vRabota: {
      total: vRabota?.total ?? 0,
      sample: (vRabota?.sample ?? []).slice(0, 5).map((e: { text?: string }) => e.text).filter(Boolean),
    },
    exchangeTopQuestions: (exchange.topQuestions ?? []).slice(0, 8) as unknown[],
    rolesOnEntry: categoricalFromCountMap(
      (portrait.preStart?.roleDistribution ?? []).map((r: { key: string; count: number }) => ({
        key: r.key, count: r.count,
      })),
      sampleSize,
    ),
    roleChanges: portrait.roleDynamics?.roleExitSummary ?? { changed: 0, same: 0 },
    pointAB: {
      completedBoth: portrait.departure?.completedBoth ?? 0,
      withPointA: (portrait.departure?.participants ?? []).filter((p: { hasPointA: boolean }) => p.hasPointA).length,
      withPointB: (portrait.departure?.participants ?? []).filter((p: { hasPointB: boolean }) => p.hasPointB).length,
      byDirection: portrait.departure?.byDirection ?? [],
    },
    quotes: {
      goals: goalTop.slice(0, 3).map((t: { token: string }) => t.token),
      piggy: (vRabota?.sample ?? []).slice(0, 3).map((e: { text?: string }) => e.text).filter(Boolean),
    },
  };

  void program;

  return {
    filters,
    currentForumDay: currentDay,
    title: sampleTitle({ currentDay, filters, sampleSize }),
    subtitle: 'Целостный портрет выбранной группы: состояние, вовлечённость, обучение и интересы',
    sample: {
      size: sampleSize,
      denominator,
      registered: sampleSize,
      cohortTotal: cohort.length,
      activeParticipants,
      dataCompletenessPct,
      noDataPct,
      insufficientSample,
      warning: insufficientSample
        ? 'Недостаточно данных для устойчивого портрета'
        : null,
      days,
      thresholds: {
        engagement: ENGAGEMENT_THRESHOLDS,
        rules: PROFILE_RULE_THRESHOLDS,
      },
    },
    typical: {
      summary: typicalSummary,
      kpis: {
        sampleSize,
        dataCompletenessPct,
        activeParticipants,
        touchpoints: touchpointStats,
        noDataPct,
        energy: energyStats,
        programPct: programScore.overallPct,
        eveningFillPct,
      },
    },
    feeling: {
      energy: energyStats,
      energyByDay,
      energyByDirectionDay: scPulse.energyByDirectionDay ?? [],
      emotions: scPulse.emotions ?? [],
      zonesPercent: scPulse.zonesPercent ?? {},
      zoneLabels: scPulse.zoneLabels ?? {},
      riskFatiguePct: scPulse.riskFatiguePct ?? null,
      mostFrequentEmotion: emotionMode,
      mostFrequentZone: zoneModeLabel,
      byPhase: scPulse.byPhase ?? {},
      phaseCounts: scPulse.phaseCounts ?? {},
      topReasons: scPulse.topReasons ?? [],
      coveragePct: stateFillPct,
    },
    engagement: {
      slotsTotal,
      touchpoints: touchpointStats,
      distribution: dist0to7,
      atLeast: {
        1: atLeast(1),
        3: atLeast(3),
        5: atLeast(5),
        7: atLeast(slotsTotal),
      },
      atLeastPct: {
        1: pct(atLeast(1), denominator),
        3: pct(atLeast(3), denominator),
        5: pct(atLeast(5), denominator),
        7: pct(atLeast(slotsTotal), denominator),
      },
      stateCheckCoveragePct: stateFillPct,
      afterBlocksCoveragePct: afterFillPct,
      eveningCoveragePct: eveningFillPct,
      tasks: {
        approved: tasksApproved,
        rejected: tasksRejected,
        pending: activity.moderation?.pending ?? 0,
        total: tasksTotal,
        approvalPct: taskApprovalPct,
        participantsWithTasks,
      },
      avgPoints,
      exchangeParticipants,
      piggyEntries: piggyEntriesCount,
      nothingDoneCount,
      nothingDonePct: pct(nothingDoneCount, denominator),
      touchpointThreshold,
      byDay: touchpointThreshold.byDay,
      byDirectionDay: touchpointThreshold.byDirectionDay,
      directionTable,
      pulseDaySeries: pulse.activity?.daySeries ?? [],
    },
    programPerception: {
      questions: questionTable,
      overall: programScore,
      byDay: scaleByDay,
      byDirectionDay: evening.scaleByDirectionDay ?? [],
      highest: highestScale ? { label: highestScale.label, avg: highestScale.avg, avgPct: highestScale.avgPct, max: highestScale.max } : null,
      lowest: lowestScale ? { label: lowestScale.label, avg: lowestScale.avg, avgPct: lowestScale.avgPct, max: lowestScale.max } : null,
      submitted: eveningAct.submitted ?? 0,
      draftsExcluded: eveningAct.drafts ?? 0,
    },
    meanings,
    segments,
    recommendations,
    sources: {
      pulse: true,
      stateCheck: true,
      evening: true,
      afterBlocks: true,
      activity: true,
      piggybank: true,
      portrait: true,
      program: true,
      exchange: true,
    },
    exportHints: {
      participants: '/exports/participants',
      stateChecks: '/exports/state-checks',
      evening: '/exports/evening-summary',
      reflections: '/exports/reflections',
      piggybank: '/exports/piggybank',
    },
  };
}
