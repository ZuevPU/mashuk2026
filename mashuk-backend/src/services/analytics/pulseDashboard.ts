import { and, eq, inArray } from 'drizzle-orm';
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

  const touchpoints = await touchpointCompletionByType(ids, days, filters.shiftId);
  const stateChecks = await countStateChecksByPhase(ids, days, filters.shiftId);
  const eveningDone = await countEveningCompleted(ids, days);
  const activitySeries = await activityByDaySeries(
    ids,
    days.length > 1 ? days : [1, 2, 3, 4, 5, 6, 7],
    filters.shiftId,
  );

  const qRows = filters.shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, filters.shiftId))
    : await db.select().from(questions);
  const publishedQ = qRows.filter(q => isPublishedStatus(q.status));
  const checkQIds = [
    ...publishedQ.filter(q =>
      reflectionKindFromQuestion(q) === 'state_check'
      && (q.dayNumber == null || days.includes(q.dayNumber ?? 0)),
    ).map(q => q.id),
  ];
  const checkAns = ids.length && checkQIds.length
    ? await db.select().from(answers).where(and(
      inArray(answers.participantId, ids),
      inArray(answers.questionId, checkQIds),
    ))
    : [];
  const zonesOverall = emptyZoneDistribution();
  const zonesByPhase: Record<'morning' | 'day' | 'evening', ReturnType<typeof emptyZoneDistribution>> = {
    morning: emptyZoneDistribution(),
    day: emptyZoneDistribution(),
    evening: emptyZoneDistribution(),
  };
  const reasons: string[] = [];
  const reasonByDay = new Map<number, string[]>();
  const pidToParticipant = new Map(cohort.map(p => [p.id, p]));

  for (const a of checkAns) {
    accumulateZoneFromAnswer(zonesOverall, a.answerData);
    const phase = stateCheckPhaseForAnswer(a.createdAt);
    accumulateZoneFromAnswer(zonesByPhase[phase], a.answerData);
    const p = parseCheckinPayload(a.answerData);
    if (p.reason?.trim()) {
      reasons.push(p.reason.trim());
      const qDay = publishedQ.find(q => q.id === a.questionId)?.dayNumber ?? filters.day ?? currentDay;
      const d = qDay && qDay >= 1 ? qDay : currentDay;
      if (!reasonByDay.has(d)) reasonByDay.set(d, []);
      reasonByDay.get(d)!.push(p.reason.trim());
    }
  }

  const zoneByDay: { day: number; zones: Record<string, number> }[] = [];
  if (filters.mode === 'shift' || filters.mode === 'compare') {
    for (const d of days) {
      const z = emptyZoneDistribution();
      const dayCheckIds = new Set(
        publishedQ.filter(q => q.dayNumber === d && reflectionKindFromQuestion(q) === 'state_check').map(q => q.id),
      );
      for (const a of checkAns) {
        if (!dayCheckIds.has(a.questionId)) continue;
        accumulateZoneFromAnswer(z, a.answerData);
      }
      zoneByDay.push({ day: d, zones: zonesToPercent(z) });
    }
  }

  const byDirection: { direction: string; zones: Record<string, number> }[] = [];
  const byGroup: { direction: string; group: string; zones: Record<string, number> }[] = [];
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
      for (const a of checkAns) {
        if (!pids.has(a.participantId)) continue;
        accumulateZoneFromAnswer(z, a.answerData);
      }
      byDirection.push({ direction, zones: zonesToPercent(z) });
      const grpMap = new Map<string, typeof list>();
      for (const p of list) {
        const g = p.groupName || 'без группы';
        if (!grpMap.has(g)) grpMap.set(g, []);
        grpMap.get(g)!.push(p);
      }
      for (const [group, gList] of grpMap) {
        const zg = emptyZoneDistribution();
        const gpids = new Set(gList.map(p => p.id));
        for (const a of checkAns) {
          if (!gpids.has(a.participantId)) continue;
          accumulateZoneFromAnswer(zg, a.answerData);
        }
        byGroup.push({ direction, group, zones: zonesToPercent(zg) });
      }
    }
  }

  const reasonByDirection: { direction: string; topTokens: ReturnType<typeof topReasonTokens> }[] = [];
  const reasonByGroup: { direction: string; group: string; topTokens: ReturnType<typeof topReasonTokens> }[] = [];
  if (reasons.length) {
    const dirReasons = new Map<string, string[]>();
    const grpReasons = new Map<string, string[]>();
    for (const a of checkAns) {
      const payload = parseCheckinPayload(a.answerData);
      if (!payload.reason?.trim()) continue;
      const part = pidToParticipant.get(a.participantId);
      const dir = part?.direction || '—';
      const grp = part?.groupName || 'без группы';
      if (!dirReasons.has(dir)) dirReasons.set(dir, []);
      dirReasons.get(dir)!.push(payload.reason.trim());
      const gk = `${dir}::${grp}`;
      if (!grpReasons.has(gk)) grpReasons.set(gk, []);
      grpReasons.get(gk)!.push(payload.reason.trim());
    }
    for (const [direction, rs] of dirReasons) {
      reasonByDirection.push({ direction, topTokens: topReasonTokens(rs, 10) });
    }
    for (const [gk, rs] of grpReasons) {
      const [direction, group] = gk.split('::');
      reasonByGroup.push({ direction, group, topTokens: topReasonTokens(rs, 8) });
    }
  }

  const compareZones = filters.mode === 'compare' && zoneByDay.length > 1
    ? zoneByDay
    : [];

  function completionSlice(list: typeof cohort) {
    const reg = list.filter(p => p.onboardingCompletedAt).length;
    const withActivity = list.filter(p => p.lastActiveAt).length;
    return {
      registered: reg,
      activeParticipants: withActivity,
      activityRatePct: reg ? Math.round((withActivity / reg) * 100) : 0,
    };
  }

  const completionByDirection: { direction: string; registered: number; activeParticipants: number; activityRatePct: number }[] = [];
  const completionByGroup: { direction: string; group: string; registered: number; activeParticipants: number; activityRatePct: number }[] = [];
  if (!filters.direction) {
    const dirMap = new Map<string, typeof cohort>();
    for (const p of cohort) {
      const d = p.direction || '—';
      if (!dirMap.has(d)) dirMap.set(d, []);
      dirMap.get(d)!.push(p);
    }
    for (const [direction, list] of dirMap) {
      completionByDirection.push({ direction, ...completionSlice(list) });
    }
    for (const [direction, list] of dirMap) {
      const grpMap = new Map<string, typeof cohort>();
      for (const p of list) {
        const g = p.groupName || 'без группы';
        if (!grpMap.has(g)) grpMap.set(g, []);
        grpMap.get(g)!.push(p);
      }
      for (const [group, gList] of grpMap) {
        completionByGroup.push({ direction, group, ...completionSlice(gList) });
      }
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
      completionByDirection,
      completionByGroup,
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
      byGroup,
      compareZones,
      note: 'Показываем распределение по 5 зонам, не среднее значение энергии.',
    },
    stateReasons: {
      topTokens: topReasonTokens(reasons),
      byDay: [...reasonByDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, rs]) => ({
        day,
        topTokens: topReasonTokens(rs, 10),
      })),
      byDirection: reasonByDirection,
      byGroup: reasonByGroup,
    },
    cohortSize: cohort.length,
  };
}
