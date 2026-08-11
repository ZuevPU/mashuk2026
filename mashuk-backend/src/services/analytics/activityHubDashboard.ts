import { inArray } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import { answers, participantDayState, participants, questions } from '../../db/schema.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import { isPublishedStatus } from '../publishStatus.js';
import { getMoscowParts } from '../timePhase.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from '../touchpointTemplates.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  SEGMENT_ORDER,
  type ActivityPerson,
  buildSegments,
  expBuckets,
  gini,
  lastActiveBucket,
  median,
  mskHour,
  pointsHistogram,
  round1,
  segmentOf,
  topShare,
} from './activityHubMetrics.js';

function isDropped(lastActiveAt: Date | null | undefined, nowKey: string): boolean {
  const b = lastActiveBucket(lastActiveAt, nowKey);
  return b === 'old' || b === 'never';
}

async function loadTouchpointCounts(
  ids: number[],
  throughDay: number,
): Promise<{ byPid: Map<number, number>; maxExpected: number }> {
  const byPid = new Map<number, number>();
  if (!ids.length) return { byPid, maxExpected: throughDay * TOUCHPOINT_SLOTS.length };

  const published = (await db.select().from(questions))
    .filter(q => isPublishedStatus(q.status));

  const dayQsCache = new Map<number, typeof published>();
  let maxExpected = 0;
  for (let d = 1; d <= throughDay; d++) {
    const dayQs = published.filter(q => isTouchpointQuestionForForumDay(q, d));
    dayQsCache.set(d, dayQs);
    // ожидаемый максимум — число слотов шаблона на день (как в touchpointCompletionRatio)
    maxExpected += TOUCHPOINT_SLOTS.length;
  }

  const ans = await db.select({
    participantId: answers.participantId,
    questionId: answers.questionId,
  }).from(answers).where(inArray(answers.participantId, ids));

  const answersByPid = new Map<number, Set<number>>();
  for (const a of ans) {
    let set = answersByPid.get(a.participantId);
    if (!set) {
      set = new Set();
      answersByPid.set(a.participantId, set);
    }
    set.add(a.questionId);
  }

  const eveningStates = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
  }).from(participantDayState).where(inArray(participantDayState.participantId, ids));

  const eveningDoneByPid = new Map<number, Set<number>>();
  for (const s of eveningStates) {
    if (s.dayNumber < 1 || s.dayNumber > throughDay) continue;
    if (s.eveningRatings == null || typeof s.eveningRatings !== 'object') continue;
    let set = eveningDoneByPid.get(s.participantId);
    if (!set) {
      set = new Set();
      eveningDoneByPid.set(s.participantId, set);
    }
    set.add(s.dayNumber);
  }

  for (const id of ids) {
    const answeredIds = answersByPid.get(id) ?? new Set<number>();
    const eveningDays = eveningDoneByPid.get(id) ?? new Set<number>();
    let tp = 0;
    for (let d = 1; d <= throughDay; d++) {
      const dayQs = dayQsCache.get(d) ?? [];
      tp += touchpointCompletionRatio(dayQs, answeredIds, d, {
        eveningDone: eveningDays.has(d),
      }).completed;
    }
    byPid.set(id, tp);
  }

  return { byPid, maxExpected };
}

export async function buildActivityHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings();
  const currentDay = settings.currentDay ?? 1;
  const throughDay = Math.min(8, Math.max(1, filters.day ?? currentDay));

  const cohort = await loadCohortParticipants(filters, req);
  const registered = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  );
  const ids = registered.map(p => p.id);

  const scoreRows = ids.length
    ? await db.select({
      id: participants.id,
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
      lastActiveAt: participants.lastActiveAt,
    }).from(participants).where(inArray(participants.id, ids))
    : [];
  const scoreById = new Map(scoreRows.map(r => [r.id, r]));

  const { byPid: tpByPid, maxExpected } = await loadTouchpointCounts(ids, throughDay);

  const nowKey = getMoscowParts().dateKey;
  const people: ActivityPerson[] = registered.map(p => {
    const sc = scoreById.get(p.id);
    return {
      id: p.id,
      direction: (p.direction || '—').trim() || '—',
      group: (p.groupName || '').trim() || '—',
      points: tpByPid.get(p.id) ?? 0,
      exp: sc?.experiencePoints ?? 0,
      lastActiveAt: sc?.lastActiveAt ?? p.lastActiveAt ?? null,
    };
  });

  const pointsArr = people.map(p => p.points);
  const expArr = people.map(p => p.exp);
  const medPoints = median(pointsArr);
  const maxPoints = Math.max(maxExpected, ...pointsArr, 0);

  let today = 0;
  let yest = 0;
  let old = 0;
  let never = 0;
  const hourCounts = new Map<number, number>();
  for (const p of people) {
    const b = lastActiveBucket(p.lastActiveAt, nowKey);
    if (b === 'today') today += 1;
    else if (b === 'yesterday') yest += 1;
    else if (b === 'old') old += 1;
    else never += 1;
    if (p.lastActiveAt) {
      const h = mskHour(p.lastActiveAt);
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    }
  }
  const zeroExp = people.filter(p => p.exp <= 0).length;

  const segments = buildSegments(people, medPoints, nowKey);

  // Directions n ≥ 40
  const dirMap = new Map<string, ActivityPerson[]>();
  for (const p of people) {
    if (isOrganizerDirection(p.direction)) continue;
    if (!dirMap.has(p.direction)) dirMap.set(p.direction, []);
    dirMap.get(p.direction)!.push(p);
  }
  const dirs = [...dirMap.entries()]
    .filter(([, list]) => list.length >= 40)
    .map(([dir, list]) => {
      const segs = SEGMENT_ORDER.map(
        name => list.filter(p => segmentOf(p.points, p.exp, medPoints) === name).length,
      );
      const todayN = list.filter(p => lastActiveBucket(p.lastActiveAt, nowKey) === 'today').length;
      const oldN = list.filter(p => isDropped(p.lastActiveAt, nowKey)).length;
      const zero = list.filter(p => p.exp <= 0).length;
      const pts = list.map(p => p.points);
      return {
        dir,
        n: list.length,
        points: round1(pts.reduce((a, b) => a + b, 0) / list.length),
        old: oldN,
        today: round1((todayN / list.length) * 100),
        zeroExp: round1((zero / list.length) * 100),
        segs,
      };
    })
    .sort((a, b) => b.points - a.points || a.dir.localeCompare(b.dir, 'ru'));

  // Groups n ≥ 15
  const groupMap = new Map<string, ActivityPerson[]>();
  for (const p of people) {
    if (!p.group || p.group === '—' || p.group === 'без группы') continue;
    if (!groupMap.has(p.group)) groupMap.set(p.group, []);
    groupMap.get(p.group)!.push(p);
  }
  const groupsAll = [...groupMap.entries()]
    .filter(([, list]) => list.length >= 15)
    .map(([group, list]) => {
      const pts = list.map(p => p.points);
      const todayN = list.filter(p => lastActiveBucket(p.lastActiveAt, nowKey) === 'today').length;
      const oldN = list.filter(p => isDropped(p.lastActiveAt, nowKey)).length;
      return {
        group,
        n: list.length,
        dir: list[0].direction,
        points: round1(pts.reduce((a, b) => a + b, 0) / list.length),
        today: round1((todayN / list.length) * 100),
        old: oldN,
      };
    })
    .sort((a, b) => a.points - b.points);

  const groupsLow = groupsAll.slice(0, 6);
  const groupsHigh = [...groupsAll].sort((a, b) => b.points - a.points).slice(0, 4);

  const hours = [...hourCounts.entries()]
    .map(([h, n]) => ({ h, n }))
    .sort((a, b) => a.h - b.h);

  const daySeries = [1, 2, 3, 4, 5, 6, 7, 8].map(day => ({
    day,
    todayPct: day === throughDay
      ? round1((today / Math.max(1, people.length)) * 100)
      : null,
    old: day === throughDay ? old : null,
    zeroExpPct: day === throughDay
      ? round1((zeroExp / Math.max(1, people.length)) * 100)
      : null,
  }));

  const pathArr = scoreRows.map(r => r.pathPoints ?? 0);
  const corrNote = pathArr.length && pointsArr.length
    ? 'Баллы «Путь» и точки осмысления сильно связаны — в панели остаются точки.'
    : null;

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day: throughDay,
      people: people.length,
      now: new Date().toISOString(),
      today,
      yest,
      old: old + never,
      zeroExp,
      maxPoints,
      medPoints: Math.round(medPoints),
      todayPct: round1((today / Math.max(1, people.length)) * 100),
      zeroExpPct: round1((zeroExp / Math.max(1, people.length)) * 100),
    },
    segments,
    pointsDist: pointsHistogram(pointsArr, maxPoints),
    expDist: expBuckets(expArr),
    gini: {
      path: gini(pathArr),
      exp: gini(expArr),
      points: gini(pointsArr),
    },
    expTop: {
      top10: topShare(expArr, 0.1),
      top25: topShare(expArr, 0.25),
    },
    dirs,
    groupsLow,
    groupsHigh,
    hours,
    daySeries,
    limits: [
      {
        title: 'Не рейтингует людей',
        text: 'Баллы отражают доступ к активностям не меньше, чем усилие. Публичный топ по этим данным будет несправедлив.',
      },
      {
        title: 'Не сравнивает средние',
        text: 'У «Опыта» высокая концентрация: среднее описывает несуществующего участника. Считается доля участвующих и состав сегментов.',
      },
      {
        title: 'Не считает «вчера» выпадением',
        text: `Жёсткий сигнал — два дня и больше. Сейчас таких ${old + never}.`,
      },
      {
        title: 'Не дублирует показатели',
        text: corrNote || '«Путь» и точки осмысления — одна величина. В панели остаются точки.',
      },
    ],
    exportPath: '/exports/activity?format=xlsx',
  };
}
