import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, participantDayState, questions } from '../../db/schema.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import { questionMatchesDay } from '../questionAdminHelpers.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import {
  isQuestionLiveForAnalytics,
  stateCheckPhaseFromQuestion,
} from './analyticsQuestionLive.js';
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
  buildEmotionDistribution,
  CHECKIN_EMOTION_IDS,
  CHECKIN_EMOTION_LABELS,
  type EmotionZoneKey,
} from '../emotionZones.js';
import {
  activityByDaySeries,
  buildTouchpointSlotCoverage,
  buildTouchpointThresholdCoverage,
  countEveningCompleted,
  countStateChecksByPhase,
  touchpointCompletionByType,
} from './touchpointMetrics.js';
import { buildForumDayKpiSeries, forumSeriesDays } from './dayComparison.js';
import { getMoscowPhase } from '../timePhase.js';

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

type CohortRow = Awaited<ReturnType<typeof loadCohortParticipants>>[number];
type PhaseKey = 'morning' | 'day' | 'evening';

function emptyEmotionPhaseMaps(): Record<PhaseKey, Map<string, number>> {
  return { morning: new Map(), day: new Map(), evening: new Map() };
}

function emptyPhaseAnswerN(): Record<PhaseKey, number> {
  return { morning: 0, day: 0, evening: 0 };
}

function buildEmotionSeriesRows(
  emotionCountsByPhase: Record<PhaseKey, Map<string, number>>,
  phaseAnswerN: Record<PhaseKey, number>,
) {
  const pct = (n: number, total: number) =>
    total ? Math.round((n / total) * 1000) / 10 : 0;
  return CHECKIN_EMOTION_IDS.map(id => {
    const m = emotionCountsByPhase.morning.get(id) || 0;
    const d = emotionCountsByPhase.day.get(id) || 0;
    const e = emotionCountsByPhase.evening.get(id) || 0;
    return {
      emotion: id,
      label: CHECKIN_EMOTION_LABELS[id],
      morningPct: pct(m, phaseAnswerN.morning),
      dayPct: pct(d, phaseAnswerN.day),
      eveningPct: pct(e, phaseAnswerN.evening),
      morningCount: m,
      dayCount: d,
      eveningCount: e,
    };
  });
}

function accumulateEmotionCounts(
  rows: { questionId: number; answerData: unknown; createdAt: Date | null }[],
  checkQById: Map<number, { timePoint?: string | null; title?: string | null; dayNumber?: number | null }>,
) {
  const emotionCounts = new Map<string, number>();
  const emotionCountsByPhase = emptyEmotionPhaseMaps();
  const phaseAnswerN = emptyPhaseAnswerN();
  let answerN = 0;
  for (const a of rows) {
    answerN += 1;
    const q = checkQById.get(a.questionId);
    const phase = stateCheckPhaseFromQuestion(q ?? {}, a.createdAt);
    phaseAnswerN[phase] += 1;
    const p = parseCheckinPayload(a.answerData);
    if (!p.emotion) continue;
    const emo = String(p.emotion).trim().toLowerCase();
    if (!emo) continue;
    emotionCounts.set(emo, (emotionCounts.get(emo) || 0) + 1);
    emotionCountsByPhase[phase].set(emo, (emotionCountsByPhase[phase].get(emo) || 0) + 1);
  }
  return { emotionCounts, emotionCountsByPhase, phaseAnswerN, answerN };
}

type DirectionSignal = {
  direction: string;
  registered: number;
  /** Участники, выполнившие хотя бы одну активность среза */
  activeParticipants: number;
  /** Охват слотов: ответы на вопросы + сданные вечерние анкеты / ожидаемое */
  activityRatePct: number;
  completedSlots: number;
  expectedSlots: number;
};

/**
 * Сигнал направления: насколько зарегистрированные справляются с активностями среза.
 * Слот = опубликованный вопрос дня (кроме точки А/Б и evening_summary)
 *        или сданная вечерняя анкета дня.
 * activityRatePct = completedSlots / (registered × slotsPerPerson).
 */
function buildDirectionSignals(
  cohort: CohortRow[],
  activityQIdSet: Set<number>,
  answeredPairs: Set<string>,
  eveningDonePairs: Set<string>,
  eveningDayCount: number,
): { byDirection: DirectionSignal[]; byGroup: (DirectionSignal & { group: string })[] } {
  const slotsPerPerson = activityQIdSet.size + eveningDayCount;
  const byDirection: DirectionSignal[] = [];
  const byGroup: (DirectionSignal & { group: string })[] = [];

  const qDoneByPid = new Map<number, number>();
  const eveningDoneByPid = new Map<number, number>();
  for (const pair of answeredPairs) {
    const [pidStr, qidStr] = pair.split(':');
    const pid = Number(pidStr);
    const qid = Number(qidStr);
    if (!activityQIdSet.has(qid)) continue;
    qDoneByPid.set(pid, (qDoneByPid.get(pid) || 0) + 1);
  }
  for (const pair of eveningDonePairs) {
    const pid = Number(pair.split(':')[0]);
    if (!Number.isFinite(pid)) continue;
    eveningDoneByPid.set(pid, (eveningDoneByPid.get(pid) || 0) + 1);
  }

  const score = (list: CohortRow[]) => {
    const registeredList = list.filter(p => p.onboardingCompletedAt);
    const reg = registeredList.length;
    let completedSlots = 0;
    let activeParticipants = 0;
    for (const p of registeredList) {
      const done = (qDoneByPid.get(p.id) || 0) + (eveningDoneByPid.get(p.id) || 0);
      completedSlots += done;
      if (done > 0) activeParticipants += 1;
    }
    const expectedSlots = reg * slotsPerPerson;
    return {
      registered: reg,
      activeParticipants,
      completedSlots,
      expectedSlots,
      activityRatePct: expectedSlots
        ? Math.round((completedSlots / expectedSlots) * 100)
        : 0,
    };
  };

  const dirMap = new Map<string, CohortRow[]>();
  for (const p of cohort) {
    const d = p.direction || '—';
    if (!dirMap.has(d)) dirMap.set(d, []);
    dirMap.get(d)!.push(p);
  }

  for (const [direction, list] of dirMap) {
    byDirection.push({ direction, ...score(list) });
    if (slotsPerPerson === 0) continue;
    const grpMap = new Map<string, CohortRow[]>();
    for (const p of list) {
      const g = p.groupName || 'без группы';
      if (!grpMap.has(g)) grpMap.set(g, []);
      grpMap.get(g)!.push(p);
    }
    for (const [group, gList] of grpMap) {
      byGroup.push({ direction, group, ...score(gList) });
    }
  }

  byDirection.sort((a, b) => a.activityRatePct - b.activityRatePct
    || a.direction.localeCompare(b.direction, 'ru'));
  byGroup.sort((a, b) => a.activityRatePct - b.activityRatePct
    || a.direction.localeCompare(b.direction, 'ru')
    || a.group.localeCompare(b.group, 'ru'));

  return { byDirection, byGroup };
}

export type PulseDashboardOptions = {
  /** Штаб · Форум: без тяжёлых панелей охвата точек (грузятся отдельно). */
  skipTouchpointPanels?: boolean;
  /** Пропустить activityByDaySeries, если UI использует только daySeries KPI. */
  skipActivitySeries?: boolean;
};

export async function buildPulseDashboard(
  filters: AnalyticsFilters,
  req?: AdminRequest,
  opts?: PulseDashboardOptions,
) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const days = resolveDayRange(filters, currentDay);
  const cohort = await loadCohortParticipants(filters, req);
  const ids = cohort.map(p => p.id);

  const registered = cohort.filter(p => p.onboardingCompletedAt).length;
  const todayStart = startOfTodayUtc();
  const activeToday = cohort.filter(p => p.lastActiveAt && p.lastActiveAt >= todayStart).length;

  const seriesDays = forumSeriesDays(currentDay);
  const [
    touchpoints,
    stateChecks,
    eveningDone,
    activitySeries,
    dayKpi,
    touchpointThreshold,
    touchpointSlotCoverage,
  ] = await Promise.all([
    touchpointCompletionByType(ids, days, filters.shiftId),
    countStateChecksByPhase(ids, days, filters.shiftId),
    countEveningCompleted(ids, days),
    opts?.skipActivitySeries
      ? Promise.resolve([])
      : activityByDaySeries(
        ids,
        days.length > 1 ? days : seriesDays,
        filters.shiftId,
      ),
    buildForumDayKpiSeries(cohort, seriesDays, filters.shiftId),
    opts?.skipTouchpointPanels
      ? Promise.resolve(null)
      : buildTouchpointThresholdCoverage(cohort, seriesDays, filters.shiftId),
    opts?.skipTouchpointPanels
      ? Promise.resolve(null)
      : buildTouchpointSlotCoverage(cohort, seriesDays, filters.shiftId),
  ]);
  const { daySeries, byDirectionDaySeries } = dayKpi;

  const now = new Date();
  const qRows = filters.shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, filters.shiftId))
    : await db.select().from(questions);
  // Только «в эфире»: status=published и publishTime уже наступил (сеяные окна в будущем не считаем).
  const publishedQ = qRows.filter(q => isQuestionLiveForAnalytics(q, now));
  /** Вопросы среза для сигнала: live по дням, кроме точки А/Б и evening (вечер — отдельно через day_state). */
  const activityQs = publishedQ.filter(q => {
    if (!days.some(d => questionMatchesDay(q, d))) return false;
    const kind = reflectionKindFromQuestion(q);
    return kind !== 'point_a' && kind !== 'point_b' && kind !== 'evening_summary';
  });
  const activityQIdSet = new Set(activityQs.map(q => q.id));
  const checkQs = activityQs.filter(q => reflectionKindFromQuestion(q) === 'state_check');
  const checkQIds = checkQs.map(q => q.id);
  const checkQById = new Map(checkQs.map(q => [q.id, q]));
  const loadQIds = [...activityQIdSet];
  const activityAns = ids.length && loadQIds.length
    ? await db.select().from(answers).where(and(
      inArray(answers.participantId, ids),
      inArray(answers.questionId, loadQIds),
    ))
    : [];
  const checkQIdSet = new Set(checkQIds);
  const checkAns = activityAns.filter(a => checkQIdSet.has(a.questionId));
  const answeredPairs = new Set(
    activityAns.map(a => `${a.participantId}:${a.questionId}`),
  );
  const eveningDoneAll = new Set<string>();
  if (ids.length && days.length) {
    const states = await db.select({
      participantId: participantDayState.participantId,
      dayNumber: participantDayState.dayNumber,
      eveningRatings: participantDayState.eveningRatings,
    }).from(participantDayState).where(inArray(participantDayState.participantId, ids));
    for (const s of states) {
      if (!days.includes(s.dayNumber)) continue;
      if (s.eveningRatings != null && typeof s.eveningRatings === 'object') {
        eveningDoneAll.add(`${s.participantId}:${s.dayNumber}`);
      }
    }
  }
  /** Вечер ждём только за прошлые дни, либо когда анкета уже открыта/есть сдачи. */
  const eveningDaysWithSubmit = new Set(
    [...eveningDoneAll].map(k => Number(k.split(':')[1])).filter(Number.isFinite),
  );
  const phaseNow = getMoscowPhase();
  const eveningDaysExpected = new Set(
    days.filter(d =>
      d < currentDay
      || eveningDaysWithSubmit.has(d)
      || (d === currentDay && phaseNow === 'evening')),
  );
  const eveningDonePairs = new Set(
    [...eveningDoneAll].filter(k => eveningDaysExpected.has(Number(k.split(':')[1]))),
  );
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
    const q = checkQById.get(a.questionId);
    const phase = stateCheckPhaseFromQuestion(q ?? {}, a.createdAt);
    accumulateZoneFromAnswer(zonesByPhase[phase], a.answerData);
    const p = parseCheckinPayload(a.answerData);
    if (p.reason?.trim()) {
      reasons.push(p.reason.trim());
      const qDay = q?.dayNumber ?? filters.day ?? currentDay;
      const d = qDay && qDay >= 1 ? qDay : currentDay;
      if (!reasonByDay.has(d)) reasonByDay.set(d, []);
      reasonByDay.get(d)!.push(p.reason.trim());
    }
  }

  const {
    emotionCounts,
    emotionCountsByPhase,
    phaseAnswerN,
  } = accumulateEmotionCounts(checkAns, checkQById);

  /** Эмоции за весь форум (дни 1…currentDay) — даже если выбран один день. */
  let forumCheckAns = checkAns;
  let forumCheckQById: Map<number, (typeof checkQs)[number]> = checkQById;
  const daysCoverSeries = days.length === seriesDays.length
    && seriesDays.every(d => days.includes(d));
  if (!daysCoverSeries) {
    const forumCheckQs = publishedQ.filter(q => {
      if (!seriesDays.some(d => questionMatchesDay(q, d))) return false;
      return reflectionKindFromQuestion(q) === 'state_check';
    });
    forumCheckQById = new Map(forumCheckQs.map(q => [q.id, q]));
    const forumCheckQIds = forumCheckQs.map(q => q.id);
    const missingIds = forumCheckQIds.filter(id => !checkQIdSet.has(id));
    const extraAns = ids.length && missingIds.length
      ? await db.select().from(answers).where(and(
        inArray(answers.participantId, ids),
        inArray(answers.questionId, missingIds),
      ))
      : [];
    forumCheckAns = [
      ...checkAns,
      ...extraAns.filter(a => forumCheckQById.has(a.questionId)),
    ];
  }
  const forumEmotionsAcc = daysCoverSeries
    ? { emotionCounts, emotionCountsByPhase, phaseAnswerN, answerN: checkAns.length }
    : accumulateEmotionCounts(forumCheckAns, forumCheckQById);

  const zoneByDay: { day: number; zones: Record<string, number> }[] = [];
  if (filters.mode === 'shift' || filters.mode === 'compare') {
    for (const d of days) {
      const z = emptyZoneDistribution();
      const dayCheckIds = new Set(
        publishedQ
          .filter(q => questionMatchesDay(q, d) && reflectionKindFromQuestion(q) === 'state_check')
          .map(q => q.id),
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
  type PhaseBucket = {
    zones: ReturnType<typeof emptyZoneDistribution>;
    emotions: Map<string, number>;
    n: number;
  };
  const emptyPhaseBucket = (): PhaseBucket => ({
    zones: emptyZoneDistribution(),
    emotions: new Map(),
    n: 0,
  });
  type DirectionPhaseRow = {
    direction: string;
    byPhase: Record<PhaseKey, {
      zones: Record<EmotionZoneKey, number>;
      emotions: Record<string, number>;
      n: number;
    }>;
  };
  const buildByDirectionPhase = (
    ansRows: typeof checkAns,
    qById: Map<number, (typeof checkQs)[number]>,
  ): DirectionPhaseRow[] => {
    const out: DirectionPhaseRow[] = [];
    const dirMap = new Map<string, typeof cohort>();
    for (const p of cohort) {
      const d = p.direction || '—';
      if (!dirMap.has(d)) dirMap.set(d, []);
      dirMap.get(d)!.push(p);
    }
    for (const [direction, list] of dirMap) {
      const pids = new Set(list.map(p => p.id));
      const phaseBuckets: Record<PhaseKey, PhaseBucket> = {
        morning: emptyPhaseBucket(),
        day: emptyPhaseBucket(),
        evening: emptyPhaseBucket(),
      };
      for (const a of ansRows) {
        if (!pids.has(a.participantId)) continue;
        const q = qById.get(a.questionId);
        const phase = stateCheckPhaseFromQuestion(q ?? {}, a.createdAt);
        const bucket = phaseBuckets[phase];
        accumulateZoneFromAnswer(bucket.zones, a.answerData);
        bucket.n += 1;
        const payload = parseCheckinPayload(a.answerData);
        const emo = payload.emotion ? String(payload.emotion).trim().toLowerCase() : '';
        if (emo) bucket.emotions.set(emo, (bucket.emotions.get(emo) || 0) + 1);
      }
      const phaseOut = {} as DirectionPhaseRow['byPhase'];
      for (const phase of ['morning', 'day', 'evening'] as PhaseKey[]) {
        const bucket = phaseBuckets[phase];
        const emotionPct: Record<string, number> = {};
        for (const id of CHECKIN_EMOTION_IDS) {
          emotionPct[id] = bucket.n
            ? Math.round(((bucket.emotions.get(id) || 0) / bucket.n) * 1000) / 10
            : 0;
        }
        for (const [id, count] of bucket.emotions) {
          if (id in emotionPct) continue;
          emotionPct[id] = bucket.n ? Math.round((count / bucket.n) * 1000) / 10 : 0;
        }
        phaseOut[phase] = {
          zones: zonesToPercent(bucket.zones),
          emotions: emotionPct,
          n: bucket.n,
        };
      }
      out.push({ direction, byPhase: phaseOut });
    }
    out.sort((a, b) => a.direction.localeCompare(b.direction, 'ru'));
    return out;
  };

  const byDirectionPhase: DirectionPhaseRow[] = [];
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
      const phaseBuckets: Record<PhaseKey, PhaseBucket> = {
        morning: emptyPhaseBucket(),
        day: emptyPhaseBucket(),
        evening: emptyPhaseBucket(),
      };
      for (const a of checkAns) {
        if (!pids.has(a.participantId)) continue;
        accumulateZoneFromAnswer(z, a.answerData);
        const q = checkQById.get(a.questionId);
        const phase = stateCheckPhaseFromQuestion(q ?? {}, a.createdAt);
        const bucket = phaseBuckets[phase];
        accumulateZoneFromAnswer(bucket.zones, a.answerData);
        bucket.n += 1;
        const payload = parseCheckinPayload(a.answerData);
        const emo = payload.emotion ? String(payload.emotion).trim().toLowerCase() : '';
        if (emo) bucket.emotions.set(emo, (bucket.emotions.get(emo) || 0) + 1);
      }
      byDirection.push({ direction, zones: zonesToPercent(z) });
      const phaseOut = {} as DirectionPhaseRow['byPhase'];
      for (const phase of ['morning', 'day', 'evening'] as PhaseKey[]) {
        const bucket = phaseBuckets[phase];
        const emotionPct: Record<string, number> = {};
        for (const id of CHECKIN_EMOTION_IDS) {
          emotionPct[id] = bucket.n
            ? Math.round(((bucket.emotions.get(id) || 0) / bucket.n) * 1000) / 10
            : 0;
        }
        for (const [id, count] of bucket.emotions) {
          if (id in emotionPct) continue;
          emotionPct[id] = bucket.n ? Math.round((count / bucket.n) * 1000) / 10 : 0;
        }
        phaseOut[phase] = {
          zones: zonesToPercent(bucket.zones),
          emotions: emotionPct,
          n: bucket.n,
        };
      }
      byDirectionPhase.push({ direction, byPhase: phaseOut });
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
    byDirectionPhase.sort((a, b) => a.direction.localeCompare(b.direction, 'ru'));
  }

  const byDirectionPhaseForum = !filters.direction
    ? (daysCoverSeries
      ? byDirectionPhase
      : buildByDirectionPhase(forumCheckAns, forumCheckQById))
    : [];

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

  const { byDirection: completionByDirection, byGroup: completionByGroup } = !filters.direction
    ? buildDirectionSignals(
      cohort,
      activityQIdSet,
      answeredPairs,
      eveningDonePairs,
      eveningDaysExpected.size,
    )
    : { byDirection: [] as DirectionSignal[], byGroup: [] as (DirectionSignal & { group: string })[] };

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
      daySeries,
      byDirectionDaySeries,
      touchpointThreshold,
      touchpointSlotCoverage,
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
      byDirectionPhase,
      byGroup,
      compareZones,
      emotions: buildEmotionDistribution(emotionCounts, checkAns.length),
      /** Доля каждой эмоции внутри фазы — для графика «в течение дня». */
      emotionsByPhase: {
        morning: buildEmotionDistribution(emotionCountsByPhase.morning, phaseAnswerN.morning),
        day: buildEmotionDistribution(emotionCountsByPhase.day, phaseAnswerN.day),
        evening: buildEmotionDistribution(emotionCountsByPhase.evening, phaseAnswerN.evening),
      },
      /** Строки 11 эмоций × утро/день/вечер — удобно для линий. */
      emotionSeries: buildEmotionSeriesRows(emotionCountsByPhase, phaseAnswerN),
      /** Среднее и серии за весь форум (дни 1…текущий), независимо от фильтра дня. */
      emotionsForum: buildEmotionDistribution(
        forumEmotionsAcc.emotionCounts,
        forumEmotionsAcc.answerN,
      ),
      emotionSeriesForum: buildEmotionSeriesRows(
        forumEmotionsAcc.emotionCountsByPhase,
        forumEmotionsAcc.phaseAnswerN,
      ),
      byDirectionPhaseForum,
      note: '5 зон эмоций и 11 эмоций проверки состояния (как у участника).',
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
