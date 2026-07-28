import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  accumulateZoneFromAnswer,
  emptyZoneDistribution,
  parseCheckinPayload,
  topReasonTokens,
  zonesToPercent,
  EMOTION_ZONE_LABELS,
} from './zoneDistribution.js';
import {
  activityByDaySeries,
  countEveningCompleted,
  countStateChecksByPhase,
  stateCheckPhaseForAnswer,
  touchpointCompletionByType,
} from './touchpointMetrics.js';
import { semanticV2Enabled } from './refreshScheduler.js';

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function buildPulseDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = cohort.map(p => p.id);

  const registered = cohort.filter(p => p.onboardingCompletedAt).length;
  const todayStart = startOfTodayUtc();
  const activeToday = cohort.filter(p => p.lastActiveAt && p.lastActiveAt >= todayStart).length;

  const touchpoints = await touchpointCompletionByType(ids, days);
  const stateChecks = await countStateChecksByPhase(ids, days);
  const eveningDone = await countEveningCompleted(ids, days);
  const activitySeries = await activityByDaySeries(ids, days.length > 1 ? days : [1, 2, 3, 4, 5, 6, 7]);

  const publishedQ = (await db.select().from(questions)).filter(q => isPublishedStatus(q.status));
  const checkQIds = new Set(
    publishedQ.filter(q => reflectionKindFromQuestion(q) === 'state_check' && (q.dayNumber == null || days.includes(q.dayNumber ?? 0))).map(q => q.id),
  );
  const allAns = ids.length
    ? await db.select().from(answers).where(inArray(answers.participantId, ids))
    : [];

  const zonesOverall = emptyZoneDistribution();
  const zonesByPhase: Record<'morning' | 'day' | 'evening', ReturnType<typeof emptyZoneDistribution>> = {
    morning: emptyZoneDistribution(),
    day: emptyZoneDistribution(),
    evening: emptyZoneDistribution(),
  };
  const reasons: string[] = [];

  for (const a of allAns) {
    if (!checkQIds.has(a.questionId)) continue;
    accumulateZoneFromAnswer(zonesOverall, a.answerData);
    const phase = stateCheckPhaseForAnswer(a.createdAt);
    accumulateZoneFromAnswer(zonesByPhase[phase], a.answerData);
    const p = parseCheckinPayload(a.answerData);
    if (p.reason?.trim()) reasons.push(p.reason.trim());
  }

  const zoneByDay: { day: number; zones: Record<string, number> }[] = [];
  if (filters.mode === 'shift' || filters.mode === 'compare') {
    for (const d of days) {
      const z = emptyZoneDistribution();
      const dayCheckIds = new Set(
        publishedQ.filter(q => q.dayNumber === d && reflectionKindFromQuestion(q) === 'state_check').map(q => q.id),
      );
      for (const a of allAns) {
        if (!dayCheckIds.has(a.questionId)) continue;
        accumulateZoneFromAnswer(z, a.answerData);
      }
      zoneByDay.push({ day: d, zones: zonesToPercent(z) });
    }
  }

  const byDirection: { direction: string; zones: Record<string, number> }[] = [];
  if (!filters.direction) {
    const dirMap = new Map<string, typeof cohort>();
    for (const p of cohort) {
      const d = p.direction || '—';
      if (!dirMap.has(d)) dirMap.set(d, []);
      dirMap.get(d)!.push(p);
    }
    for (const [direction, list] of dirMap) {
      const z = emptyZoneDistribution();
      const pids = new Set(list.map(p => p.id));
      for (const a of allAns) {
        if (!pids.has(a.participantId) || !checkQIds.has(a.questionId)) continue;
        accumulateZoneFromAnswer(z, a.answerData);
      }
      byDirection.push({ direction, zones: zonesToPercent(z) });
    }
  }

  return {
    filters,
    currentForumDay: currentDay,
    activity: {
      registered,
      activeToday,
      touchpoints,
      stateChecks,
      eveningCompleted: eveningDone,
      activitySeries,
    },
    emotionalPulse: {
      zoneLabels: EMOTION_ZONE_LABELS,
      zonesPercent: zonesToPercent(zonesOverall),
      byPhase: {
        morning: zonesToPercent(zonesByPhase.morning),
        day: zonesToPercent(zonesByPhase.day),
        evening: zonesToPercent(zonesByPhase.evening),
      },
      byDay: zoneByDay,
      byDirection,
      note: 'Показываем распределение по 5 зонам, не среднее значение энергии.',
    },
    stateReasons: {
      topTokens: topReasonTokens(reasons),
      v2Placeholder: !semanticV2Enabled() ? 'LLM-кластеризация причин — этап 2' : null,
    },
    cohortSize: cohort.length,
  };
}
