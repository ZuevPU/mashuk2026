import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank, taskSubmissions } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import { getRoleMeta } from '../roleService.js';
import { entryTags } from '../piggybankDict.js';
import { topReasonTokens } from './zoneDistribution.js';
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
import { collectKindAnswerRows } from './questionKindDashboard.js';
import { buildTouchpointThresholdCoverage, buildParticipantTouchpointEngagement } from './touchpointMetrics.js';
import {
  ENGAGEMENT_THRESHOLDS,
  PROFILE_RULE_THRESHOLDS,
  SEGMENT_LABELS,
  accumulateThemeMention,
  buildAnswerLengthByDay,
  buildProfileRecommendations,
  engagementSegment,
  normalizeScaleToPct,
  numericSummary,
  themesFromBag,
  type EngagementSegmentId,
  type NumericSummary,
} from './participantProfileStats.js';
import {
  buildEmotionDayPhaseDynamics,
  buildEnergyDayPhaseDynamics,
  buildParticipantPathAcrossDays,
  buildParticipantPathSeries,
  type PathAnswerInput,
} from './participantPathSeries.js';

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
  } else if (opts.filters.mode === 'compare' && opts.filters.compareDays?.length) {
    parts.push(`D${opts.filters.compareDays.join('+')}`);
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

export async function buildParticipantProfileDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const cohort = await loadCohortParticipants(filters, req);
  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const sampleSize = registered.length;
  const denominator = sampleSize;
  const cohortIds = registered.map(p => p.id);

  const shiftWideFilters: AnalyticsFilters = {
    ...filters,
    mode: 'shift',
    day: null,
    compareDays: [],
  };
  const totalDays = Math.min(8, Math.max(1, settings.totalDays ?? 8));

  const [
    pulse,
    stateCheck,
    evening,
    afterBlocks,
    activity,
    piggybankDash,
    portrait,
    _program,
    exchange,
    touchpointThreshold,
    engagement,
    approvedTaskRows,
    piggyRows,
    shiftStateCollected,
    shiftAfterBlocksCollected,
    eveningShift,
    piggyRowsAllDays,
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
    cohortIds.length
      ? db.select({
        participantId: taskSubmissions.participantId,
        status: taskSubmissions.status,
      }).from(taskSubmissions).where(inArray(taskSubmissions.participantId, cohortIds))
      : Promise.resolve([] as { participantId: number; status: string | null }[]),
    cohortIds.length
      ? db.select({
        participantId: piggybank.participantId,
        text: piggybank.text,
        forumDay: piggybank.forumDay,
        tags: piggybank.tags,
        source: piggybank.source,
      }).from(piggybank).where(and(
        inArray(piggybank.participantId, cohortIds),
        isNull(piggybank.deletedAt),
        ...(filters.day != null ? [eq(piggybank.forumDay, filters.day)] : []),
      ))
      : Promise.resolve([] as { participantId: number; text: string | null; forumDay: number | null; tags: unknown; source: string | null }[]),
    // Emotion / energy path across the whole shift (not only selected day).
    collectKindAnswerRows('state_check', shiftWideFilters, { includeUnpublished: true }),
    collectKindAnswerRows('after_blocks', shiftWideFilters, { includeUnpublished: true }),
    buildEveningDashboard(shiftWideFilters, req),
    // Piggybank for answer-length series — always all days of the shift.
    cohortIds.length
      ? db.select({
        participantId: piggybank.participantId,
        text: piggybank.text,
        forumDay: piggybank.forumDay,
      }).from(piggybank).where(and(
        inArray(piggybank.participantId, cohortIds),
        isNull(piggybank.deletedAt),
      ))
      : Promise.resolve([] as { participantId: number; text: string | null; forumDay: number | null }[]),
  ]);

  void _program;

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
    questions?: { answers?: {
      participantId: number;
      energy: number | null;
      emotion: string | null;
      emotionZone?: string | null;
      timePoint?: string | null;
      createdAt?: Date | null;
      answer?: string | null;
      day?: number | null;
    }[] }[];
  });

  // Per-participant energy / emotion (participant-level first)
  const energyByPid = new Map<number, number[]>();
  const emotionByPid = new Map<number, Map<string, number>>();
  for (const q of scPulse.questions ?? []) {
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
  const participantEnergyAvgs = [...energyByPid.entries()].map(([, vals]) =>
    vals.reduce((s, n) => s + n, 0) / vals.length,
  );
  const energyStats: NumericSummary = numericSummary(participantEnergyAvgs);
  const avgEnergyFor = (pid: number): number | null => {
    const vals = energyByPid.get(pid);
    if (!vals?.length) return null;
    return vals.reduce((s, n) => s + n, 0) / vals.length;
  };

  const pulseFeeling = scPulse.emotionalPulse ?? {};

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
  const stateAct = scPulse.activity ?? {};

  const eveningFillPct = eveningAct.fillRatePct ?? pct(eveningAct.submitted ?? 0, denominator);
  const stateFillPct = stateAct.fillRatePct ?? pct(stateAct.uniqueParticipants ?? stateAct.submitted ?? 0, denominator);
  const afterFillPct = afterAct.fillRatePct ?? pct(afterAct.uniqueParticipants ?? afterAct.submitted ?? 0, denominator);

  // Tasks per participant (approved)
  const approvedTasksByPid = new Map<number, number>();
  let tasksApproved = 0;
  let tasksRejected = 0;
  let tasksPending = 0;
  for (const r of approvedTaskRows) {
    const st = String(r.status || '');
    if (st === 'approved') {
      tasksApproved += 1;
      approvedTasksByPid.set(r.participantId, (approvedTasksByPid.get(r.participantId) || 0) + 1);
    } else if (st === 'rejected') tasksRejected += 1;
    else if (st === 'pending' || st === 'pending_team') tasksPending += 1;
  }
  const tasksTotal = tasksApproved + tasksRejected + tasksPending;
  const taskApprovalPct = tasksApproved + tasksRejected
    ? Math.round((tasksApproved / (tasksApproved + tasksRejected)) * 1000) / 10
    : null;
  const participantsWithTasks = approvedTasksByPid.size;
  const avgPoints = (() => {
    const totalPts = (activity.pointsByDay ?? []).reduce((s: number, d: { points: number }) => s + d.points, 0);
    return denominator ? Math.round((totalPts / denominator) * 10) / 10 : null;
  })();

  const exchangeParticipants = exchange.kpi?.uniqueAskers ?? 0;
  const piggyEntriesCount = piggyRows.length;
  const nothingDoneCount = engagement.scores.filter(s => s.avgCompleted === 0 && !approvedTasksByPid.has(s.participantId)).length;

  // Program scales + medians from evening
  const scaleRows = (evening.scaleAverages ?? []).map((q: {
    key: string; label: string; avg: number; median?: number | null; answered: number; max: number; type: string;
  }) => ({
    ...q,
    median: q.median ?? null,
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
    byQuestion: { avg: number; median?: number | null; answered: number; max: number; label: string; key: string }[];
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

  const scaleByDirectionDay = (evening.scaleByDirectionDay ?? []).map((d: {
    direction: string;
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
      ...d,
      overallPct: n ? Math.round((sum / n) * 10) / 10 : null,
      byQuestion: (d.byQuestion ?? []).map(q => ({
        ...q,
        avgPct: normalizeScaleToPct(q.avg, q.max),
      })),
    };
  });

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
      median: q.median,
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

  const programPctByPid = new Map<number, number>(
    ((evening as { participantProgramPct?: { participantId: number; avgPct: number }[] }).participantProgramPct ?? [])
      .map(r => [r.participantId, r.avgPct]),
  );

  // Segments
  const segmentBuckets = new Map<EngagementSegmentId, typeof engagement.scores>();
  for (const id of Object.keys(SEGMENT_LABELS) as EngagementSegmentId[]) {
    segmentBuckets.set(id, []);
  }
  for (const s of engagement.scores) {
    const seg = s.hasData ? engagementSegment(s.activityPct) : 'insufficient_data';
    segmentBuckets.get(seg)!.push(s);
  }

  const emotionMode = modeLabel(pulseFeeling.emotions ?? []);
  const zoneModeLabel = zoneMode(pulseFeeling.zonesPercent, pulseFeeling.zoneLabels);

  const segments = (Object.keys(SEGMENT_LABELS) as EngagementSegmentId[]).map(id => {
    const list = segmentBuckets.get(id) ?? [];
    const dirCounts = new Map<string, number>();
    for (const s of list) dirCounts.set(s.direction, (dirCounts.get(s.direction) || 0) + 1);
    const topDirections = [...dirCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([direction, count]) => ({ direction, count }));
    const energies = list.map(s => avgEnergyFor(s.participantId)).filter((v): v is number => v != null);
    const programPcts = list.map(s => programPctByPid.get(s.participantId)).filter((v): v is number => v != null);
    const taskCounts = list.map(s => approvedTasksByPid.get(s.participantId) ?? 0);
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
      avgProgramPct: numericSummary(programPcts).avg,
      tasksApprox: numericSummary(taskCounts).avg,
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
    const tasks = list.reduce((s, p) => s + (approvedTasksByPid.get(p.participantId) || 0), 0);
    return {
      direction,
      participants: list.length,
      avgTouchpoints: stats.avg,
      medianTouchpoints: stats.median,
      all7,
      tasks,
      eveningFillPct: ev?.fillRatePct ?? null,
      coveragePct: coverage,
    };
  }).sort((a, b) => (a.coveragePct ?? 0) - (b.coveragePct ?? 0) || a.direction.localeCompare(b.direction, 'ru'));

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
  // Filled from shift-wide state-check answers below (all days, not only filter day).
  let energyByDay = pulseFeeling.energyByDay ?? [];
  let energyPrev: number | null = null;
  let energyLatest: number | null = energyStats.avg;

  const pathAnswers: PathAnswerInput[] = [];
  for (const q of scPulse.questions ?? []) {
    for (const a of q.answers ?? []) {
      pathAnswers.push({
        participantId: a.participantId,
        energy: a.energy,
        emotion: a.emotion,
        emotionZone: a.emotionZone ?? null,
        timePoint: a.timePoint ?? null,
        createdAt: a.createdAt ?? null,
        day: a.day ?? null,
      });
    }
  }
  const cohortIdSet = new Set(cohortIds);
  const shiftPathAnswers: PathAnswerInput[] = shiftStateCollected.rows
    .filter(r => cohortIdSet.has(r.participantId))
    .map(r => ({
      participantId: r.participantId,
      energy: r.energy,
      emotion: r.emotion,
      emotionZone: r.emotionZone ?? null,
      timePoint: r.timePoint ?? null,
      createdAt: r.createdAt ?? null,
      day: r.day ?? null,
    }));
  const dayFilterForPath = filters.mode === 'day' && filters.day != null ? filters.day : null;
  // Intra-day comparison stays on the selected day; path panel / dynamics use the whole shift.
  const participantPath = buildParticipantPathSeries(pathAnswers, { dayFilter: dayFilterForPath });
  const participantPathShift = buildParticipantPathAcrossDays(shiftPathAnswers, { maxDay: totalDays });
  const emotionDynamics = buildEmotionDayPhaseDynamics(shiftPathAnswers, { maxDay: totalDays });
  emotionDynamics.note = 'Доля эмоции по фазам утро / день / вечер за все дни смены (не зависит от фильтра «день»).';
  const energyDynamics = buildEnergyDayPhaseDynamics(shiftPathAnswers, { maxDay: totalDays });

  // Daily energy + risk/fatigue across the whole shift (for «День / энергия / риск»).
  const energyRiskByDay = new Map<number, { risk: number; total: number; energies: number[] }>();
  for (let d = 1; d <= totalDays; d += 1) {
    energyRiskByDay.set(d, { risk: 0, total: 0, energies: [] });
  }
  for (const a of shiftPathAnswers) {
    if (a.day == null || a.day < 1 || a.day > totalDays) continue;
    const bucket = energyRiskByDay.get(a.day)!;
    bucket.total += 1;
    const zone = (a.emotionZone || '').toLowerCase();
    if (zone === 'risk' || zone === 'fatigue') bucket.risk += 1;
    if (a.energy != null && Number.isFinite(a.energy)) bucket.energies.push(a.energy);
  }
  energyByDay = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const bucket = energyRiskByDay.get(day)!;
    const stats = numericSummary(bucket.energies);
    return {
      day,
      avg: stats.avg,
      median: stats.median,
      responses: bucket.energies.length,
      riskFatiguePct: bucket.total
        ? Math.round((bucket.risk / bucket.total) * 1000) / 10
        : null,
    };
  });
  const energyWithData = energyByDay.filter(d => d.responses > 0);
  energyPrev = energyWithData.length >= 2
    ? energyWithData[energyWithData.length - 2]?.avg ?? null
    : null;
  energyLatest = energyWithData.length
    ? energyWithData[energyWithData.length - 1]?.avg ?? energyStats.avg
    : energyStats.avg;

  const highEnergyLowReflection = (
    energyStats.avg != null
    && energyStats.avg >= PROFILE_RULE_THRESHOLDS.highEnergy
    && (afterFillPct == null || afterFillPct < PROFILE_RULE_THRESHOLDS.lowReflectionFillPct)
  );

  const recommendations = buildProfileRecommendations({
    sampleSize,
    riskFatiguePct: pulseFeeling.riskFatiguePct ?? null,
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

  // Meanings with proper uniqueParticipants
  const interestBag = new Map<string, { count: number; pids: Set<number> }>();
  const goalBag = new Map<string, { count: number; pids: Set<number> }>();
  const pointBBag = new Map<string, { count: number; pids: Set<number> }>();
  const roleBag = new Map<string, { count: number; pids: Set<number> }>();
  const goalQuoteSamples: string[] = [];
  const pointBQuoteSamples: string[] = [];
  for (const p of registered) {
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    for (const tag of ints) accumulateThemeMention(interestBag, String(tag), p.id);
    const g = p.goalAnswers;
    const goalTexts: string[] = [];
    if (Array.isArray(g)) goalTexts.push(...g.map(String));
    else if (g && typeof g === 'object') goalTexts.push(...Object.values(g as Record<string, unknown>).map(String));
    for (const text of goalTexts) {
      const trimmed = text.trim();
      if (trimmed.length >= 12 && goalQuoteSamples.length < 40) goalQuoteSamples.push(trimmed.slice(0, 220));
      for (const token of topReasonTokens([text], 14)) {
        accumulateThemeMention(goalBag, token.token, p.id);
      }
    }
    const pb = p.pointBAnswers;
    const pointBTexts: string[] = [];
    if (Array.isArray(pb)) pointBTexts.push(...pb.map(String));
    else if (pb && typeof pb === 'object') pointBTexts.push(...Object.values(pb as Record<string, unknown>).map(String));
    for (const text of pointBTexts) {
      const trimmed = text.trim();
      if (trimmed.length >= 12 && pointBQuoteSamples.length < 40) pointBQuoteSamples.push(trimmed.slice(0, 220));
      for (const token of topReasonTokens([text], 14)) {
        accumulateThemeMention(pointBBag, token.token, p.id);
      }
    }
    const roleKey = p.pedagogicalRole || 'none';
    const roleLabel = getRoleMeta(roleKey)?.name ?? roleKey;
    accumulateThemeMention(roleBag, roleLabel, p.id);
  }

  const piggyBag = new Map<string, { count: number; pids: Set<number> }>();
  const piggyByDayBag = new Map<number, Map<string, { count: number; pids: Set<number> }>>();
  const vRabotaTexts: string[] = [];
  const piggyQuoteSamples: string[] = [];
  for (const e of piggyRows) {
    const raw = (e.text || '').trim();
    if (raw.length >= 12 && piggyQuoteSamples.length < 40) piggyQuoteSamples.push(raw.slice(0, 220));
    for (const token of topReasonTokens([e.text || ''], 12)) {
      accumulateThemeMention(piggyBag, token.token, e.participantId);
      const day = e.forumDay ?? 0;
      if (!piggyByDayBag.has(day)) piggyByDayBag.set(day, new Map());
      accumulateThemeMention(piggyByDayBag.get(day)!, token.token, e.participantId);
    }
    if (entryTags(e as never).includes('в работу') && e.text?.trim()) {
      vRabotaTexts.push(e.text.trim());
    }
  }

  // Reflection themes from after-blocks answers
  const reflectionBag = new Map<string, { count: number; pids: Set<number> }>();
  const reflectionByDayBag = new Map<number, Map<string, { count: number; pids: Set<number> }>>();
  const reflectionQuoteSamples: string[] = [];
  for (const q of (afterBlocks as {
    questions?: { day?: number | null; answers?: { participantId: number; answer?: string | null }[] }[];
  }).questions ?? []) {
    const day = q.day ?? 0;
    for (const a of q.answers ?? []) {
      const text = (a.answer || '').trim();
      if (!text) continue;
      if (text.length >= 12 && reflectionQuoteSamples.length < 40) reflectionQuoteSamples.push(text.slice(0, 220));
      for (const token of topReasonTokens([text], 12)) {
        accumulateThemeMention(reflectionBag, token.token, a.participantId);
        if (!reflectionByDayBag.has(day)) reflectionByDayBag.set(day, new Map());
        accumulateThemeMention(reflectionByDayBag.get(day)!, token.token, a.participantId);
      }
    }
  }

  // Reasons from state-check free text
  const reasonBag = new Map<string, { count: number; pids: Set<number> }>();
  for (const q of scPulse.questions ?? []) {
    for (const a of q.answers ?? []) {
      const text = (a.answer || '').trim();
      if (!text) continue;
      for (const token of topReasonTokens([text], 10)) {
        accumulateThemeMention(reasonBag, token.token, a.participantId);
      }
    }
  }

  // Character length of free-text answers — always for the whole shift.
  const answerLengthItems: {
    day: number | null;
    text: string;
    participantId: number;
  }[] = [];
  for (const r of shiftStateCollected.rows) {
    if (!cohortIdSet.has(r.participantId)) continue;
    const text = (r.answer || '').trim();
    if (!text) continue;
    answerLengthItems.push({
      day: r.day ?? null,
      text,
      participantId: r.participantId,
    });
  }
  for (const r of shiftAfterBlocksCollected.rows) {
    if (!cohortIdSet.has(r.participantId)) continue;
    const text = (r.answer || '').trim();
    if (!text) continue;
    answerLengthItems.push({
      day: r.day ?? null,
      text,
      participantId: r.participantId,
    });
  }
  for (const e of piggyRowsAllDays) {
    if (!cohortIdSet.has(e.participantId)) continue;
    const text = (e.text || '').trim();
    if (!text) continue;
    answerLengthItems.push({
      day: e.forumDay ?? null,
      text,
      participantId: e.participantId,
    });
  }
  for (const q of ((eveningShift as {
    questions?: {
      type?: string;
      answers?: { participantId: number; day?: number; answer?: string | number }[];
    }[];
  }).questions ?? [])) {
    if (q.type === 'scale_1_5' || q.type === 'scale_1_10' || q.type === 'yes_no') continue;
    for (const a of q.answers ?? []) {
      if (!cohortIdSet.has(a.participantId)) continue;
      if (typeof a.answer !== 'string') continue;
      const text = a.answer.trim();
      if (!text) continue;
      answerLengthItems.push({
        day: a.day ?? null,
        text,
        participantId: a.participantId,
      });
    }
  }
  const answerLengths = {
    byDay: buildAnswerLengthByDay(answerLengthItems, totalDays),
    totalResponses: answerLengthItems.length,
    note: 'Длина в символах по текстовым ответам за все дни смены: проверка состояния, после блоков, копилка, открытые поля evening. Шкалы и да/нет не входят. Не зависит от фильтра «день».',
  };

  const interests = themesFromBag(interestBag, sampleSize, 40);
  const goals = themesFromBag(goalBag, sampleSize, 40);
  const pointBThemes = themesFromBag(pointBBag, sampleSize, 40);
  const piggyThemes = themesFromBag(piggyBag, sampleSize, 40);
  const reflectionThemes = themesFromBag(reflectionBag, sampleSize, 40);
  const stateReasons = themesFromBag(reasonBag, sampleSize, 40);
  const rolesOnEntry = themesFromBag(roleBag, sampleSize, 20);

  const themesByDay = [...new Set([...piggyByDayBag.keys(), ...reflectionByDayBag.keys()])]
    .filter(d => d > 0)
    .sort((a, b) => a - b)
    .map(day => ({
      day,
      piggy: themesFromBag(piggyByDayBag.get(day) ?? new Map(), sampleSize, 20),
      reflections: themesFromBag(reflectionByDayBag.get(day) ?? new Map(), sampleSize, 20),
    }));

  const topInterestLabels = interests.slice(0, 3).map(i => i.label).filter(Boolean);
  const activityPctTypical = touchpointStats.avg != null && slotsTotal
    ? Math.round((touchpointStats.avg / slotsTotal) * 1000) / 10
    : null;
  const insufficientSample = sampleSize < PROFILE_RULE_THRESHOLDS.minSample;

  let typicalSummary: string | null = null;
  if (!insufficientSample) {
    const bits: string[] = [];
    if (touchpointStats.avg != null) bits.push(`активен в ${touchpointStats.avg} из ${slotsTotal} точек дня`);
    if (energyStats.avg != null) bits.push(`имеет среднюю энергию ${energyStats.avg}`);
    if (zoneModeLabel) bits.push(`чаще находится в зоне «${zoneModeLabel}»`);
    if (activityPctTypical != null) bits.push(`выполняет ${activityPctTypical}% доступных активностей (по точкам)`);
    if (programScore.scale5?.avg != null) bits.push(`оценивает программу на ${programScore.scale5.avg} из 5`);
    else if (programScore.overallPct != null) bits.push(`оценивает программу на ${programScore.overallPct}% от максимума шкалы`);
    if (topInterestLabels.length) bits.push(`чаще всего интересуется темами ${topInterestLabels.join(', ')}`);
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
    return Math.round((signals.filter(Boolean).length / signals.length) * 1000) / 10;
  })();

  const activeParticipants = pulse.activity?.activeToday
    ?? activity.participants?.activeToday
    ?? scoresWithData.filter(s => s.avgCompleted >= 1).length;

  const vRabota = (piggybankDash as { vRabota?: { total?: number; sample?: { text?: string }[]; byDirection?: unknown[] } }).vRabota;

  const meanings = {
    goals,
    interests,
    reflectionThemes,
    piggyThemes,
    pointBThemes,
    stateReasons,
    themesByDay,
    vRabota: {
      total: vRabota?.total ?? vRabotaTexts.length,
      byDirection: vRabota?.byDirection ?? [],
      sample: [
        ...(vRabota?.sample ?? []).map((e: { text?: string }) => e.text).filter(Boolean),
        ...vRabotaTexts,
      ].filter((t, i, arr) => t && arr.indexOf(t) === i).slice(0, 40) as string[],
    },
    exchangeTopQuestions: (exchange.topQuestions ?? []).slice(0, 30).map((q: {
      id?: number; text?: string; title?: string; answers?: number; answerCount?: number; engagement?: number;
    }) => ({
      id: q.id,
      text: q.text ?? q.title ?? '—',
      answers: q.answers ?? q.answerCount ?? 0,
      engagement: q.engagement ?? null,
    })),
    rolesOnEntry,
    roleChanges: portrait.roleDynamics?.roleExitSummary ?? { changed: 0, same: 0 },
    pointAB: {
      completedBoth: portrait.departure?.completedBoth ?? 0,
      withPointA: (portrait.departure?.participants ?? []).filter((p: { hasPointA: boolean }) => p.hasPointA).length,
      withPointB: (portrait.departure?.participants ?? []).filter((p: { hasPointB: boolean }) => p.hasPointB).length,
      byDirection: portrait.departure?.byDirection ?? [],
    },
    quotes: {
      goals: goalQuoteSamples.slice(0, 20),
      pointB: pointBQuoteSamples.slice(0, 20),
      reflections: reflectionQuoteSamples.slice(0, 20),
      piggy: piggyQuoteSamples.slice(0, 20),
      vRabota: vRabotaTexts.slice(0, 20),
    },
  };

  return {
    filters,
    currentForumDay: currentDay,
    title: sampleTitle({ currentDay, filters, sampleSize }),
    subtitle: 'Целостный портрет выбранной группы: состояние, вовлечённость, обучение и интересы',
    methodology: {
      energy: 'Средняя/медиана по участникам: сначала среднее энергии участника, затем агрегат когорты.',
      touchpoints: 'Слоты точек осмысления 0–7 на участника×день, затем avg/median по когорте.',
      coverage: 'Охват считается по уникальным participantId.',
      program: 'Шкалы 1–5 и 1–10 сравниваются только через % от максимума; черновики evening исключены.',
      themes: 'pct тем = uniqueParticipants / размер выборки; count = упоминания.',
      segments: `Пороги вовлечённости: ≥${ENGAGEMENT_THRESHOLDS.leaders}% / ≥${ENGAGEMENT_THRESHOLDS.stable}% / ≥${ENGAGEMENT_THRESHOLDS.selective}%.`,
    },
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
      energyByDirectionDay: pulseFeeling.energyByDirectionDay ?? [],
      emotions: pulseFeeling.emotions ?? [],
      zonesPercent: pulseFeeling.zonesPercent ?? {},
      zoneLabels: pulseFeeling.zoneLabels ?? {},
      riskFatiguePct: pulseFeeling.riskFatiguePct ?? null,
      mostFrequentEmotion: emotionMode,
      mostFrequentZone: zoneModeLabel,
      byPhase: pulseFeeling.byPhase ?? {},
      phaseCounts: pulseFeeling.phaseCounts ?? {},
      topReasons: pulseFeeling.topReasons ?? [],
      coveragePct: stateFillPct,
      path: participantPath,
      pathShift: participantPathShift,
      emotionDynamics,
      energyDynamics,
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
        pending: tasksPending,
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
      answerLengths,
    },
    programPerception: {
      questions: questionTable,
      overall: programScore,
      byDay: scaleByDay,
      byDirectionDay: scaleByDirectionDay,
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
    exportPath: '/exports/participant-profile',
    exportHints: {
      fullPortrait: '/exports/participant-profile',
      participants: '/exports/participants',
      stateChecks: '/exports/state-checks',
      evening: '/exports/evening-summary',
      reflections: '/exports/reflections',
      piggybank: '/exports/piggybank',
    },
  };
}
