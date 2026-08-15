import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { db } from '../../db/index.js';
import {
  exchangeAnswers,
  exchangeCategories,
  exchangeQuestions,
  participants,
  piggybank,
  questions,
  answers,
  participantDayState,
} from '../../db/schema.js';
import {
  CHECKIN_EMOTION_IDS,
  CHECKIN_EMOTION_LABELS,
  emotionIdToZone,
  type EmotionZoneKey,
} from '../emotionZones.js';
import { getForumSettings } from '../helpers.js';
import { hideOrganizerName } from '../leaderboardQuery.js';
import { entryTags } from '../piggybankDict.js';
import { getCalendarForumDay, getMoscowParts } from '../timePhase.js';
import {
  isTouchpointQuestionForForumDay,
  questionMatchesTouchpointSlot,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';
import {
  EVENING_SCALE_KEYS,
  EVENING_SCALE_LABELS,
  TOUCHPOINT_SLOTS,
} from '../touchpointTemplates.js';
import { collectEveningExportRows, type EveningExportRow } from '../exports/eveningExportData.js';
import { roleLabel } from '../exports/exportLabels.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import { collectKindAnswerRows, type KindAnswerRow } from './questionKindDashboard.js';
import {
  appropriationPct,
  classifyReflection,
} from './afterBlocksHubMetrics.js';
import {
  SEGMENT_ORDER,
  buildSegments,
  lastActiveBucket,
  type ActivityPerson,
} from './activityHubMetrics.js';
import { hasActionTag, isAutoBookmark, TAG_ORDER } from './piggybankHubMetrics.js';
import {
  PHASE_ORDER,
  PHASE_RU,
  REASON_THEMES,
  ZONE_ORDER,
  ZONE_RU,
  countThemes,
  isNegZone,
  median as stateMedian,
  zoneDistCounts,
  type PhaseKey,
  type ZoneKey,
} from './stateDashboardMetrics.js';
import {
  isQuestionLiveForAnalytics,
  stateCheckPhaseFromQuestion,
} from './analyticsQuestionLive.js';
import {
  DIR_MIN_REG,
  GROUP_MIN_N,
  PHASE_CELL_MIN,
  PROFILE_METRICS,
  deviationPct,
  mean,
  numScale,
  pct,
  rankOf,
  rankTone,
  round1,
  type ProfileMetricKey,
} from './directionHubMetrics.js';

type Person = {
  id: number;
  direction: string;
  group: string;
  onboardingCompletedAt: Date | null;
};

function dirName(raw: string | null | undefined): string {
  return (raw || '—').trim() || '—';
}

function resolvePhase(r: KindAnswerRow): PhaseKey {
  return stateCheckPhaseFromQuestion(
    { timePoint: r.timePoint, title: r.questionTitle },
    r.createdAt,
  );
}

function zoneOf(r: KindAnswerRow): ZoneKey | null {
  const z = (r.emotionZone as EmotionZoneKey | null) ?? emotionIdToZone(r.emotion);
  if (!z) return null;
  if ((ZONE_ORDER as readonly string[]).includes(z)) return z as ZoneKey;
  return null;
}

function eveningDir(r: EveningExportRow): string {
  return dirName(r.directionName || r.p.direction);
}

function eveningGroup(r: EveningExportRow): string {
  return (r.p.groupName || '—').trim() || '—';
}

function scaleMean(rows: EveningExportRow[], key: string): number | null {
  const vals: number[] = [];
  for (const r of rows) {
    const n = numScale(r.ratings[key], 5);
    if (n != null) vals.push(n);
  }
  return mean(vals);
}

function scaleLowPct(rows: EveningExportRow[], key: string): number {
  let tot = 0;
  let low = 0;
  for (const r of rows) {
    const n = numScale(r.ratings[key], 5);
    if (n == null) continue;
    tot += 1;
    if (n < 4) low += 1;
  }
  return pct(low, tot);
}

function dayIndex(rows: EveningExportRow[]): number | null {
  if (!rows.length) return null;
  const per: number[] = [];
  for (const r of rows) {
    const vals: number[] = [];
    for (const k of EVENING_SCALE_KEYS) {
      const n = numScale(r.ratings[k], 5);
      if (n != null) vals.push(n);
    }
    if (vals.length) per.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return mean(per);
}

async function loadTouchpointBundle(ids: number[], throughDay: number) {
  const byPid = new Map<number, number>();
  const empty = {
    byPid,
    published: [] as typeof questions.$inferSelect[],
    answeredByPid: new Map<number, Set<number>>(),
    eveningDays: new Map<number, Set<number>>(),
  };
  if (!ids.length) return empty;
  const qRows = await db.select().from(questions);
  const published = qRows.filter(q => isQuestionLiveForAnalytics(q));
  const eveningStates = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
  }).from(participantDayState).where(inArray(participantDayState.participantId, ids));
  const eveningDays = new Map<number, Set<number>>();
  for (const s of eveningStates) {
    if (s.eveningRatings == null || typeof s.eveningRatings !== 'object') continue;
    if (!eveningDays.has(s.participantId)) eveningDays.set(s.participantId, new Set());
    eveningDays.get(s.participantId)!.add(s.dayNumber);
  }
  const ans = await db.select({
    participantId: answers.participantId,
    questionId: answers.questionId,
  }).from(answers).where(inArray(answers.participantId, ids));
  const answeredByPid = new Map<number, Set<number>>();
  for (const a of ans) {
    if (!answeredByPid.has(a.participantId)) answeredByPid.set(a.participantId, new Set());
    answeredByPid.get(a.participantId)!.add(a.questionId);
  }
  for (const id of ids) {
    let tp = 0;
    const answeredIds = answeredByPid.get(id) ?? new Set();
    const eDays = eveningDays.get(id) ?? new Set();
    for (let d = 1; d <= throughDay; d++) {
      const dayQs = published.filter(q => isTouchpointQuestionForForumDay(q, d));
      tp += touchpointCompletionRatio(dayQs, answeredIds, d, {
        eveningDone: eDays.has(d),
      }).completed;
    }
    byPid.set(id, tp);
  }
  return { byPid, published, answeredByPid, eveningDays };
}

const SLOT_SHORT: Record<number, string> = {
  1: 'Утро',
  2: 'Направление',
  3: 'День',
  4: 'Уроки о важном',
  5: 'Открытые уроки',
  6: 'Вечер',
  7: 'Итоги дня',
};

const SLOT_KIND: Record<number, string> = {
  1: 'состояние',
  2: 'осмысление',
  3: 'состояние',
  4: 'осмысление',
  5: 'осмысление',
  6: 'состояние',
  7: 'итоги',
};

function buildStateSlice(rows: KindAnswerRow[], registered: number) {
  const people = new Set(rows.map(r => r.participantId));
  const zones = rows.map(zoneOf);
  const distAll = zoneDistCounts(zones);
  const tot = distAll.reduce((a, b) => a + b, 0);
  const neg = tot >= PHASE_CELL_MIN
    ? pct((distAll[3] ?? 0) + (distAll[4] ?? 0), tot)
    : 0;

  const byPhase = PHASE_ORDER.map(phase => {
    const slice = rows.filter(r => resolvePhase(r) === phase);
    const dist = zoneDistCounts(slice.map(zoneOf));
    const n = dist.reduce((a, b) => a + b, 0);
    const energies = slice.map(r => r.energy).filter((e): e is number => e != null && Number.isFinite(e));
    const phaseNeg = n >= PHASE_CELL_MIN
      ? pct((dist[3] ?? 0) + (dist[4] ?? 0), n)
      : null;
    return {
      phase: PHASE_RU[phase],
      phaseKey: phase,
      n,
      dist,
      energy: stateMedian(energies),
      neg: phaseNeg,
    };
  });

  const emoMap = new Map<string, number>();
  const emoPhaseMap = new Map<string, [number, number, number]>();
  for (const id of CHECKIN_EMOTION_IDS) {
    const label = CHECKIN_EMOTION_LABELS[id];
    emoPhaseMap.set(label, [0, 0, 0]);
  }
  for (const r of rows) {
    const id = (r.emotion || '').trim().toLowerCase();
    if (!id) continue;
    const label = CHECKIN_EMOTION_LABELS[id as keyof typeof CHECKIN_EMOTION_LABELS] || r.emotion!;
    emoMap.set(label, (emoMap.get(label) || 0) + 1);
    const phase = resolvePhase(r);
    const phaseIdx = PHASE_ORDER.indexOf(phase);
    if (phaseIdx < 0) continue;
    const cur = emoPhaseMap.get(label) ?? [0, 0, 0];
    cur[phaseIdx] += 1;
    emoPhaseMap.set(label, cur);
  }
  const emotions = [...emoMap.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
  const emoPhase = [...emoPhaseMap.entries()]
    .map(([emo, v]) => ({ emo, v }))
    .filter(e => e.v.some(n => n > 0))
    .sort((a, b) => (b.v[0]! + b.v[1]! + b.v[2]!) - (a.v[0]! + a.v[1]! + a.v[2]!));

  const reasons = rows.map(r => (r.answer || '').trim()).filter(Boolean);
  const noText = Math.max(0, rows.length - reasons.length);
  const themes = countThemes(reasons).map(t => ({ name: t.name, n: t.n }));
  if (noText > 0) themes.push({ name: 'Без пояснения', n: noText });

  return {
    n: rows.length,
    people: people.size,
    cov: pct(people.size, registered),
    neg,
    byPhase,
    emotions,
    emoPhase,
    reasons: reasons.length,
    noText,
    themes,
  };
}

function buildReflSlice(rows: KindAnswerRow[], registered: number) {
  const items = rows
    .map(r => {
      const text = (r.answer || '').trim();
      if (!text || text.startsWith('(ответ без')) return null;
      const parent = (r.parentEventTitle || '').trim();
      const leaf = (r.eventTitle || '').trim();
      const event = parent || leaf || 'Без события';
      return { r, level: classifyReflection(text), event, len: text.length };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const levels = ['Перенос в практику', 'Связь с собой', 'Тезис', 'Реакция'] as const;
  const dist = levels.map(l => items.filter(i => i.level === l).length);
  const people = new Set(items.map(i => i.r.participantId));
  const own = appropriationPct(items.map(i => i.level));

  const evMap = new Map<string, typeof items>();
  for (const it of items) {
    if (!evMap.has(it.event)) evMap.set(it.event, []);
    evMap.get(it.event)!.push(it);
  }
  const byEvent = [...evMap.entries()]
    .map(([ev, list]) => ({
      ev,
      n: list.length,
      own: appropriationPct(list.map(i => i.level)),
    }))
    .filter(e => e.n >= 5)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  return {
    n: items.length,
    people: people.size,
    cov: pct(people.size, registered),
    dist: [...dist],
    own,
    med: Math.round(stateMedian(items.map(i => i.len)) ?? 0),
    byEvent,
  };
}

export async function buildDirectionHubDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const day = Math.min(8, Math.max(1, filters.day ?? currentDay));
  const startDate = settings.startDate ? new Date(settings.startDate) : null;
  const totalDays = settings.totalDays ?? 8;
  const now = new Date();
  const nowKey = getMoscowParts(now).dateKey;

  const cohortFilters: AnalyticsFilters = { ...filters };
  cohortFilters.direction = null;
  cohortFilters.group = null;
  const cohort = await loadCohortParticipants(cohortFilters, req);
  const people: Person[] = cohort
    .filter(p => p.onboardingCompletedAt && !hideOrganizerName(filters.organizers, p.direction))
    .map(p => ({
      id: p.id,
      direction: dirName(p.direction),
      group: (p.groupName || '—').trim() || '—',
      onboardingCompletedAt: p.onboardingCompletedAt,
    }));

  const regByDir = new Map<string, number>();
  const peopleByDir = new Map<string, Person[]>();
  for (const p of people) {
    regByDir.set(p.direction, (regByDir.get(p.direction) || 0) + 1);
    if (!peopleByDir.has(p.direction)) peopleByDir.set(p.direction, []);
    peopleByDir.get(p.direction)!.push(p);
  }

  const dirs = [...regByDir.entries()]
    .filter(([, n]) => n >= DIR_MIN_REG)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);

  const selectedDir = filters.direction && !hideOrganizerName(filters.organizers, filters.direction)
    ? dirName(filters.direction)
    : (dirs[0] ?? null);

  const cohortIds = people.map(p => p.id);
  const allowed = new Set(cohortIds);
  const byId = new Map(people.map(p => [p.id, p]));

  const shiftFilters: AnalyticsFilters = { ...filters };
  shiftFilters.day = null;
  shiftFilters.mode = 'shift';
  shiftFilters.direction = null;
  shiftFilters.group = null;
  shiftFilters.compareDays = [];

  const [
    { rows: stateAll },
    { rows: afterAll },
    eveningPack,
    tpBundle,
    scoreRows,
    pigRows,
    exQ,
    exA,
    cats,
  ] = await Promise.all([
    collectKindAnswerRows('state_check', shiftFilters),
    collectKindAnswerRows('after_blocks', shiftFilters),
    collectEveningExportRows({
      shiftId: filters.shiftId,
      day: null,
      includeDrafts: true,
    }),
    loadTouchpointBundle(cohortIds, day),
    cohortIds.length
      ? db.select({
        id: participants.id,
        pathPoints: participants.pathPoints,
        experiencePoints: participants.experiencePoints,
        lastActiveAt: participants.lastActiveAt,
      }).from(participants).where(inArray(participants.id, cohortIds))
      : Promise.resolve([] as Array<{
        id: number;
        pathPoints: number | null;
        experiencePoints: number | null;
        lastActiveAt: Date | null;
      }>),
    cohortIds.length
      ? db.select({
        id: piggybank.id,
        participantId: piggybank.participantId,
        text: piggybank.text,
        source: piggybank.source,
        forumDay: piggybank.forumDay,
        tags: piggybank.tags,
        createdAt: piggybank.createdAt,
      }).from(piggybank).where(and(
        inArray(piggybank.participantId, cohortIds),
        isNull(piggybank.deletedAt),
      ))
      : Promise.resolve([]),
    db.select({
      id: exchangeQuestions.id,
      participantId: exchangeQuestions.participantId,
      categoryId: exchangeQuestions.categoryId,
      moderationStatus: exchangeQuestions.moderationStatus,
      createdAt: exchangeQuestions.createdAt,
    }).from(exchangeQuestions),
    db.select({
      id: exchangeAnswers.id,
      participantId: exchangeAnswers.participantId,
      questionId: exchangeAnswers.questionId,
      text: exchangeAnswers.text,
      createdAt: exchangeAnswers.createdAt,
    }).from(exchangeAnswers),
    db.select().from(exchangeCategories),
  ]);

  const stateRows = stateAll.filter(r => allowed.has(r.participantId) && !hideOrganizerName(filters.organizers, r.direction));
  const afterRows = afterAll.filter(r => allowed.has(r.participantId) && !hideOrganizerName(filters.organizers, r.direction));
  const eveningRows = eveningPack.rows.filter(r => allowed.has(r.p.id) && !hideOrganizerName(filters.organizers, eveningDir(r)));
  const submittedAll = eveningRows.filter(r => r.status === 'сдано');
  const draftsAll = eveningRows.filter(r => r.status !== 'сдано');

  const tpByPid = tpBundle.byPid;
  const scoreById = new Map(scoreRows.map(r => [r.id, r]));
  const catById = new Map(cats.map(c => [c.id, c]));

  const forumDayOf = (createdAt: Date | null | undefined): number | null => {
    if (!createdAt || !startDate) return null;
    return getCalendarForumDay(startDate, createdAt, totalDays);
  };

  const exQScoped = exQ.filter(q => allowed.has(q.participantId));
  const exAScoped = exA.filter(a => allowed.has(a.participantId));

  function sliceFor(dir: string | null, forDay: number) {
    const reg = dir
      ? (regByDir.get(dir) || 0)
      : people.length;
    const ids = new Set(
      (dir ? (peopleByDir.get(dir) ?? []) : people).map(p => p.id),
    );

    const st = stateRows.filter(r => r.day === forDay && ids.has(r.participantId));
    const rf = afterRows.filter(r => r.day === forDay && ids.has(r.participantId));
    const evSub = submittedAll.filter(r => r.dayNumber === forDay && ids.has(r.p.id));
    const evDraft = draftsAll.filter(r => r.dayNumber === forDay && ids.has(r.p.id));
    const evTot = evSub.length + evDraft.length;

    const state = buildStateSlice(st, reg);
    const refl = buildReflSlice(rf, reg);
    const idx = dayIndex(evSub);
    const drafts = pct(evDraft.length, evTot || 1);

    const blocks = EVENING_SCALE_KEYS.map(key => ({
      key,
      label: EVENING_SCALE_LABELS[key] || key,
      mean: scaleMean(evSub, key),
      low: scaleLowPct(evSub, key),
      n: evSub.filter(r => numScale(r.ratings[key], 5) != null).length,
    })).filter(b => b.n > 0);

    // Roles & experiment
    const roleMap = new Map<string, number>();
    for (const r of evSub) {
      const name = roleLabel(r.tomorrowRoleKey);
      if (!name) continue;
      roleMap.set(name, (roleMap.get(name) || 0) + 1);
    }
    const roles = [...roleMap.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n);

    const expMap = new Map<string, number>();
    for (const r of evSub) {
      const raw = r.ratings?.experimentResult ?? r.ratings?.experiment_text;
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name) continue;
      expMap.set(name, (expMap.get(name) || 0) + 1);
    }
    const experiment = [...expMap.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

    // Piggybank
    const pig = pigRows.filter(r =>
      ids.has(r.participantId) && (r.forumDay == null || r.forumDay === forDay),
    );
    const pigManual = pig.filter(r => !isAutoBookmark(r.text));
    const pigAuto = pig.length - pigManual.length;
    const pigPeople = new Set(pig.map(r => r.participantId));
    const tagCounts = Object.fromEntries(TAG_ORDER.map(t => [t, 0])) as Record<string, number>;
    const srcMap = new Map<string, number>();
    let actN = 0;
    for (const r of pigManual) {
      const tags = entryTags(r);
      if (hasActionTag(tags)) actN += 1;
      for (const t of tags) {
        if (t in tagCounts) tagCounts[t] += 1;
      }
      const src = (r.source || 'не указан').trim() || 'не указан';
      srcMap.set(src, (srcMap.get(src) || 0) + 1);
    }
    const kop = {
      n: pigManual.length,
      auto: pigAuto,
      people: pigPeople.size,
      cov: pct(pigPeople.size, reg),
      act: pct(actN, pigManual.length || 1),
      tags: TAG_ORDER.map(tag => ({ tag, n: tagCounts[tag] })),
      sources: [...srcMap.entries()]
        .map(([name, n]) => ({ name, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
    };

    // Exchange
    const qDay = exQScoped.filter(q => {
      if (!ids.has(q.participantId)) return false;
      const d = forumDayOf(q.createdAt);
      return d === forDay;
    });
    const aDay = exAScoped.filter(a => {
      if (!ids.has(a.participantId)) return false;
      const d = forumDayOf(a.createdAt);
      return d === forDay;
    });
    const exPeople = new Set([...qDay.map(q => q.participantId), ...aDay.map(a => a.participantId)]);
    const catCounts = new Map<string, number>();
    for (const q of qDay) {
      const c = q.categoryId != null ? catById.get(q.categoryId) : null;
      const name = c?.title || 'Не размечено';
      catCounts.set(name, (catCounts.get(name) || 0) + 1);
    }
    const lens = aDay.map(a => (a.text || '').trim().length);
    const short = pct(lens.filter(l => l > 0 && l < 20).length, lens.filter(l => l > 0).length || 1);
    const exch = {
      q: qDay.length,
      a: aDay.length,
      people: exPeople.size,
      cov: pct(exPeople.size, reg),
      cats: [...catCounts.entries()]
        .map(([name, n]) => ({ name, n }))
        .sort((a, b) => b.n - a.n),
      medA: Math.round(stateMedian(lens.filter(l => l > 0)) ?? 0),
      short,
    };

    // Activity
    const dirPeople = dir ? (peopleByDir.get(dir) ?? []) : people;
    const actPeople: ActivityPerson[] = dirPeople.map(p => {
      const sc = scoreById.get(p.id);
      return {
        id: p.id,
        direction: p.direction,
        group: p.group,
        points: tpByPid.get(p.id) ?? 0,
        exp: sc?.experiencePoints ?? 0,
        lastActiveAt: sc?.lastActiveAt ?? null,
      };
    });
    const pointsAvg = mean(actPeople.map(p => p.points)) ?? 0;
    const pathAvg = round1(mean(dirPeople.map(p => scoreById.get(p.id)?.pathPoints ?? 0)) ?? 0);
    const expAvg = round1(mean(actPeople.map(p => p.exp)) ?? 0);
    const exp0 = pct(actPeople.filter(p => p.exp <= 0).length, actPeople.length || 1);
    let today = 0;
    let old = 0;
    for (const p of actPeople) {
      const b = lastActiveBucket(p.lastActiveAt, nowKey);
      if (b === 'today') today += 1;
      if (b === 'old' || b === 'never') old += 1;
    }
    const medPts = stateMedian(actPeople.map(p => p.points)) ?? 0;
    const segsBuilt = buildSegments(actPeople, medPts, nowKey);
    const segCounts = SEGMENT_ORDER.map(name => ({
      name,
      n: segsBuilt.find(s => s.name === name)?.n ?? 0,
    }));

    // Groups (≥8)
    const gMap = new Map<string, Person[]>();
    for (const p of dirPeople) {
      if (!gMap.has(p.group)) gMap.set(p.group, []);
      gMap.get(p.group)!.push(p);
    }
    const groups = [...gMap.entries()]
      .filter(([, list]) => list.length >= GROUP_MIN_N)
      .map(([g, list]) => {
        const gIds = new Set(list.map(p => p.id));
        const gEv = evSub.filter(r => gIds.has(r.p.id));
        const gSt = st.filter(r => gIds.has(r.participantId));
        const gNegDist = zoneDistCounts(gSt.map(zoneOf));
        const gNegTot = gNegDist.reduce((a, b) => a + b, 0);
        const gNeg = gNegTot >= PHASE_CELL_MIN
          ? pct((gNegDist[3] ?? 0) + (gNegDist[4] ?? 0), gNegTot)
          : null;
        const gPts = mean(list.map(p => tpByPid.get(p.id) ?? 0));
        return {
          g,
          n: list.length,
          idx: dayIndex(gEv),
          neg: gNeg,
          pts: gPts,
        };
      })
      .sort((a, b) => (a.pts ?? 99) - (b.pts ?? 99) || a.g.localeCompare(b.g, 'ru'));

    const metrics: Record<ProfileMetricKey, number | null> = {
      idx,
      neg: state.neg,
      stCov: state.cov,
      own: refl.own,
      rfCov: refl.cov,
      points: round1(pointsAvg),
      exp0,
      exCov: exch.cov,
      kopCov: kop.cov,
      drafts: evTot ? drafts : null,
    };

    return {
      registered: reg,
      evening: {
        n: evSub.length,
        idx,
        drafts,
        blocks,
        roles,
        experiment,
      },
      state,
      refl,
      kop,
      exch,
      act: {
        n: actPeople.length,
        points: round1(pointsAvg),
        path: pathAvg,
        exp: expAvg,
        exp0,
        today: pct(today, actPeople.length || 1),
        old,
        segs: segCounts,
      },
      groups,
      metrics,
    };
  }

  const sliceCache = new Map<string, ReturnType<typeof sliceFor>>();
  const getSlice = (dir: string | null, forDay: number) => {
    const key = `${dir ?? '__all'}|${forDay}`;
    let s = sliceCache.get(key);
    if (!s) {
      s = sliceFor(dir, forDay);
      sliceCache.set(key, s);
    }
    return s;
  };

  const forum = getSlice(null, day);
  const byDir: Record<string, ReturnType<typeof sliceFor>> = {};
  for (const d of dirs) byDir[d] = getSlice(d, day);

  // Day series for selected / all dirs
  const daySeries: Array<{
    day: number;
    idx: number | null;
    neg: number | null;
    own: number | null;
    points: number | null;
    exQ: number | null;
    stCov: number | null;
    kopCov: number | null;
  }> = [];
  for (let d = 1; d <= 8; d++) {
    if (d > currentDay) {
      daySeries.push({
        day: d, idx: null, neg: null, own: null, points: null, exQ: null, stCov: null, kopCov: null,
      });
      continue;
    }
    const s = getSlice(selectedDir, d);
    daySeries.push({
      day: d,
      idx: s.evening.idx,
      neg: s.state.n ? s.state.neg : null,
      own: s.refl.n ? s.refl.own : null,
      points: d === day ? s.act.points : null,
      exQ: s.exch.q,
      stCov: s.state.n ? s.state.cov : null,
      kopCov: s.kop.n || s.kop.auto ? s.kop.cov : null,
    });
  }

  // Series for interactive dynamics (instrument → metric → day)
  type SeriesDef = { key: string; name: string; inst: string; unit: string; up: boolean };
  const seriesDefs: SeriesDef[] = [
    { key: 'st_neg', name: 'Усталость и риск', inst: 'Состояние', unit: '%', up: false },
    { key: 'st_cov', name: 'Охват проверок состояния', inst: 'Состояние', unit: '%', up: true },
    { key: 'ev_idx', name: 'Индекс дня', inst: 'Итоги дня', unit: '', up: true },
    { key: 'ev_crit', name: 'Оценок ниже 4', inst: 'Итоги дня', unit: '%', up: false },
    { key: 'ev_draft', name: 'Черновики анкеты', inst: 'Итоги дня', unit: '%', up: false },
    { key: 'rf_own', name: 'Присвоение', inst: 'После блоков', unit: '%', up: true },
    { key: 'rf_cov', name: 'Охват осмысления', inst: 'После блоков', unit: '%', up: true },
    { key: 'kp_cov', name: 'Охват копилки', inst: 'Копилка', unit: '%', up: true },
    { key: 'kp_act', name: 'Заметок с действием', inst: 'Копилка', unit: '%', up: true },
    { key: 'ac_pts', name: 'Точки осмысления (среднее)', inst: 'Активность', unit: '', up: true },
    { key: 'ac_exp0', name: 'Ни разу не в обмене опытом', inst: 'Активность', unit: '%', up: false },
    { key: 'ac_today', name: 'Заходили в день среза', inst: 'Активность', unit: '%', up: true },
    { key: 'ac_old', name: 'Выпали на 2+ дня', inst: 'Активность', unit: 'чел.', up: false },
    { key: 'ex_sent', name: 'Подано вопросов', inst: 'Обмен опытом', unit: '', up: true },
    { key: 'ex_ans', name: 'Написано ответов', inst: 'Обмен опытом', unit: '', up: true },
  ];
  const seriesKeys = ['all', ...dirs];
  const series = seriesDefs.map(def => {
    const data: Record<string, Record<string, number>> = {};
    for (const k of seriesKeys) data[k] = {};
    for (let d = 1; d <= currentDay; d++) {
      for (const k of seriesKeys) {
        const s = getSlice(k === 'all' ? null : k, d);
        let v: number | null = null;
        if (def.key === 'st_neg' && s.state.n) v = s.state.neg;
        else if (def.key === 'st_cov' && s.state.n) v = s.state.cov;
        else if (def.key === 'ev_idx') v = s.evening.idx;
        else if (def.key === 'ev_crit' && s.evening.blocks.length) {
          v = round1(s.evening.blocks.reduce((a, b) => a + b.low, 0) / s.evening.blocks.length);
        } else if (def.key === 'ev_draft' && s.evening.n + (s.metrics.drafts ?? 0) >= 0 && s.evening.n > 0) {
          v = s.metrics.drafts;
        } else if (def.key === 'rf_own' && s.refl.n) v = s.refl.own;
        else if (def.key === 'rf_cov' && s.refl.n) v = s.refl.cov;
        else if (def.key === 'kp_cov' && (s.kop.n || s.kop.auto)) v = s.kop.cov;
        else if (def.key === 'kp_act' && s.kop.n) v = s.kop.act;
        else if (def.key === 'ac_pts' && d === day) v = s.act.points;
        else if (def.key === 'ac_exp0' && d === day) v = s.act.exp0;
        else if (def.key === 'ac_today' && d === day) v = s.act.today;
        else if (def.key === 'ac_old' && d === day) v = s.act.old;
        else if (def.key === 'ex_sent' && (s.exch.q || s.exch.a)) v = s.exch.q;
        else if (def.key === 'ex_ans' && (s.exch.q || s.exch.a)) v = s.exch.a;
        if (v != null) data[k][String(d)] = v;
      }
    }
    return { ...def, data };
  });
  const instruments = [...new Set(seriesDefs.map(s => s.inst))];

  // Comparison matrix ranks
  const matrixKeys = PROFILE_METRICS;
  const matrix = dirs.map(d => {
    const cells = matrixKeys.map(m => {
      const vals: Record<string, number | null> = {};
      for (const dd of dirs) vals[dd] = byDir[dd].metrics[m.key];
      const v = byDir[d].metrics[m.key];
      const rank = rankOf(dirs, vals, d, m.up);
      return {
        key: m.key,
        v,
        rank,
        tone: rankTone(rank, dirs.length),
      };
    });
    return { dir: d, registered: regByDir.get(d) || 0, cells };
  });

  // Profile for selected
  const cur = selectedDir && byDir[selectedDir] ? byDir[selectedDir] : forum;
  const profile = PROFILE_METRICS.map(m => {
    const v = cur.metrics[m.key];
    const f = forum.metrics[m.key];
    const dev = deviationPct(v, f);
    return {
      key: m.key,
      name: m.name,
      unit: m.unit,
      up: m.up,
      v,
      forum: f,
      dev,
      good: dev == null ? null : (m.up ? dev > 0 : dev < 0),
    };
  });

  const forumEmoTot = forum.state.emotions.reduce((a, e) => a + e.n, 0) || 1;
  const emotions = cur.state.emotions.map(e => {
    const p = pct(e.n, cur.state.n || 1);
    const fp = pct(
      forum.state.emotions.find(x => x.name === e.name)?.n ?? 0,
      forumEmoTot,
    );
    return { name: e.name, n: e.n, pct: p, forumPct: fp, deltaPp: round1(p - fp) };
  });

  // Timeline cards for all dirs
  const timelines = dirs.map(d => {
    const cards = [1, 2, 3, 4, 5, 6, 7, 8].map(dd => {
      if (dd > currentDay) return { day: dd, main: null as null | { v: number | string; label: string }, tools: [] as string[] };
      const s = getSlice(d, dd);
      const tools: string[] = [];
      let main: { v: number | string; label: string } | null = null;
      if (s.evening.idx != null) {
        tools.push('итоги');
        main = { v: s.evening.idx, label: 'индекс дня' };
      }
      if (s.state.n) {
        tools.push('состояние');
        if (!main) main = { v: `${s.state.neg}%`, label: 'усталость и риск' };
      }
      if (s.refl.n) {
        tools.push('осмысление');
        if (!main) main = { v: `${s.refl.own}%`, label: 'присвоение' };
      }
      if (s.kop.n || s.kop.auto) tools.push('копилка');
      if (s.exch.q || s.exch.a) {
        tools.push('обмен');
        if (!main) main = { v: s.exch.q, label: 'вопросов в обмене' };
      }
      if (dd === day) {
        tools.push('активность');
        if (!main) main = { v: s.act.points, label: 'точки осмысления' };
      }
      return { day: dd, main, tools };
    });
    return { dir: d, registered: regByDir.get(d) || 0, cards };
  });

  const levels = ['Перенос в практику', 'Связь с собой', 'Тезис', 'Реакция'];
  const zones = ZONE_ORDER.map(k => ZONE_RU[k]);
  const smallDirs = dirs.filter(d => (regByDir.get(d) || 0) < 60);

  // Заполняемость 7 точек осмысления × направления (за выбранный день)
  const dayQs = tpBundle.published.filter(q => isTouchpointQuestionForForumDay(q, day));
  const touchpoints = TOUCHPOINT_SLOTS.map(slot => {
    const matched = dayQs.filter(q => questionMatchesTouchpointSlot(q, slot));
    const qIds = new Set(matched.map(q => q.id));
    const byDirPct: Record<string, number> = {};
    const countFor = (list: Person[]) => {
      if (!list.length) return 0;
      let done = 0;
      for (const p of list) {
        const answered = tpBundle.answeredByPid.get(p.id) ?? new Set();
        const hit = [...qIds].some(id => answered.has(id));
        const eve = slot.index === 7 && (tpBundle.eveningDays.get(p.id)?.has(day) ?? false);
        if (hit || eve) done += 1;
      }
      return pct(done, list.length);
    };
    byDirPct.all = countFor(people);
    for (const d of dirs) byDirPct[d] = countFor(peopleByDir.get(d) ?? []);
    return {
      index: slot.index,
      name: slot.title,
      short: SLOT_SHORT[slot.index] ?? slot.title,
      kind: SLOT_KIND[slot.index] ?? 'точка',
      day,
      all: byDirPct.all,
      byDir: Object.fromEntries(dirs.map(d => [d, byDirPct[d]])),
    };
  });

  // Анкета: матрица блоков × направлений + карточки fill/idx/crit по дням
  const anketaBlocks = {
    blocks: forum.evening.blocks.map(b => ({
      key: b.key,
      label: b.label,
      forumMean: b.mean,
      forumLow: b.low,
    })),
    forumIdx: forum.evening.idx,
    rows: dirs.map(d => ({
      dir: d,
      idx: byDir[d].evening.idx,
      means: byDir[d].evening.blocks.map(b => ({
        key: b.key,
        mean: b.mean,
        low: b.low,
      })),
    })),
  };

  const anketaCards = dirs.map(d => {
    const byDay: Record<string, { fill: number; idx: number | null; crit: number | null }> = {};
    for (let dd = 1; dd <= currentDay; dd++) {
      const s = getSlice(d, dd);
      const reg = regByDir.get(d) || 1;
      const fill = pct(s.evening.n, reg);
      const crit = s.evening.blocks.length
        ? round1(s.evening.blocks.reduce((a, b) => a + b.low, 0) / s.evening.blocks.length)
        : null;
      if (s.evening.n > 0 || s.metrics.drafts != null) {
        byDay[String(dd)] = { fill, idx: s.evening.idx, crit };
      }
    }
    return { dir: d, byDay };
  });
  const anketaForumByDay: Record<string, { fill: number; idx: number | null; crit: number | null }> = {};
  for (let dd = 1; dd <= currentDay; dd++) {
    const s = getSlice(null, dd);
    const fill = pct(s.evening.n, people.length || 1);
    const crit = s.evening.blocks.length
      ? round1(s.evening.blocks.reduce((a, b) => a + b.low, 0) / s.evening.blocks.length)
      : null;
    if (s.evening.n > 0) {
      anketaForumByDay[String(dd)] = { fill, idx: s.evening.idx, crit };
    }
  }

  const dirColors: Record<string, string> = {};
  const palette = ['#e6ae4a', '#79b8c9', '#57bd9c', '#e2685e', '#c98fb0', '#8fb98a', '#b0a0d0', '#6f7d95'];
  dirs.forEach((d, i) => { dirColors[d] = palette[i % palette.length]; });

  /** Слой сравнения направлений для штаба (narrative + матрицы). */
  const overview = dirs.map(d => {
    const s = byDir[d];
    const reg = regByDir.get(d) || 0;
    const morn = s.state.byPhase.find(p => p.phaseKey === 'morning');
    const dayP = s.state.byPhase.find(p => p.phaseKey === 'day');
    const topEmo = (() => {
      const dayIdx = 1;
      let best: { emo: string; n: number } | null = null;
      for (const e of s.state.emoPhase) {
        const n = e.v[dayIdx] ?? 0;
        if (!best || n > best.n) best = { emo: e.emo, n };
      }
      return best?.n ? best.emo : (s.state.emotions[0]?.name ?? null);
    })();
    // fbDist ≈ HTML: [эмоц+, пустые, содержательные, сложность]
    const dist = s.refl.dist;
    const fbDist = [
      dist[1] ?? 0, // Связь с собой
      (dist[2] ?? 0) + (dist[3] ?? 0), // Тезис + Реакция
      dist[0] ?? 0, // Перенос в практику
      0,
    ];
    const kopSorted = [...s.kop.tags].filter(t => t.n > 0).sort((a, b) => b.n - a.n);
    const kopTop = kopSorted[0]?.tag ?? null;
    const unmarked = s.exch.cats.find(c => c.name === 'Не размечено')?.n ?? 0;
    const qOther = s.exch.q ? pct(unmarked, s.exch.q) : 0;
    return {
      dir: d,
      reg,
      state: s.state.n,
      fb: s.refl.n,
      kop: s.kop.n,
      q: s.exch.q,
      ans: s.exch.a,
      eMorn: morn?.energy ?? null,
      eDay: dayP?.energy ?? null,
      negDay: dayP?.neg ?? s.state.neg,
      topEmoDay: topEmo,
      points: s.act.points,
      path: s.act.path,
      exp: s.act.exp,
      fbDist,
      kopTop,
      kopTopN: kopSorted[0]?.n ?? 0,
      qOther,
    };
  });

  const stateCmp = dirs.map(d => {
    const s = byDir[d];
    const morn = s.state.byPhase.find(p => p.phaseKey === 'morning');
    const dayP = s.state.byPhase.find(p => p.phaseKey === 'day');
    const topDay = overview.find(o => o.dir === d)?.topEmoDay ?? null;
    return {
      dir: d,
      m: morn?.energy ?? null,
      d: dayP?.energy ?? null,
      neg: dayP?.neg ?? s.state.neg,
      emo: topDay,
    };
  });

  const actCmp = dirs.map(d => {
    const s = byDir[d];
    return {
      dir: d,
      n: regByDir.get(d) || 0,
      path: s.act.path,
      exp: s.act.exp,
      pts: s.act.points,
    };
  });

  const forumFbDist = overview.reduce(
    (acc, r) => acc.map((v, i) => v + (r.fbDist[i] ?? 0)),
    [0, 0, 0, 0],
  );
  const forumNegDay = (() => {
    const dayP = forum.state.byPhase.find(p => p.phaseKey === 'day');
    return dayP?.neg ?? forum.state.neg;
  })();

  const forumLayer = {
    overview,
    stateCmp,
    actCmp,
    forum: {
      reg: people.length,
      state: forum.state.n,
      fb: forum.refl.n,
      kop: forum.kop.n,
      q: forum.exch.q,
      fbDist: forumFbDist,
      negDay: forumNegDay,
      points: forum.act.points,
      path: forum.act.path,
      exp: forum.act.exp,
    },
    fbCats: [
      'Эмоционально-положительный',
      'Нейтральный / несодержательный',
      'Содержательный по работе',
      'Сложность / требует внимания',
    ] as const,
  };

  return {
    filters: { ...filters, day },
    currentForumDay: currentDay,
    meta: {
      day,
      now: now.toISOString(),
      selectedDir,
      registered: cur.registered,
      dirs: dirs.length,
      forumRegistered: people.length,
      smallNote: smallDirs.length
        ? `Малые направления (${smallDirs.join(', ')}) двигаются в ряду от нескольких ответов.`
        : null,
    },
    dirs: dirs.map(d => ({ dir: d, registered: regByDir.get(d) || 0 })),
    zones,
    levels,
    themes: REASON_THEMES.map(t => t.name),
    forum: {
      idx: forum.evening.idx,
      neg: forum.state.neg,
      own: forum.refl.own,
      points: forum.act.points,
      kopCov: forum.kop.cov,
      exCov: forum.exch.cov,
      stCov: forum.state.cov,
      rfCov: forum.refl.cov,
      blocks: forum.evening.blocks.map(b => ({
        key: b.key, label: b.label, mean: b.mean, low: b.low,
      })),
    },
    profile,
    kpis: [
      {
        label: 'Индекс дня',
        value: cur.evening.idx != null ? String(cur.evening.idx) : '—',
        sub: selectedDir
          ? `место ${rankOf(dirs, Object.fromEntries(dirs.map(d => [d, byDir[d].metrics.idx])), selectedDir, true)} из ${dirs.length}`
          : 'по форуму',
      },
      {
        label: 'Усталость и риск',
        value: `${cur.state.neg}%`,
        sub: `по форуму ${forum.state.neg}%`,
      },
      {
        label: 'Присвоение',
        value: `${cur.refl.own}%`,
        sub: `по форуму ${forum.refl.own}%`,
      },
      {
        label: 'Выпали 2+ дня',
        value: String(cur.act.old),
        sub: `из ${cur.act.n} участников`,
      },
    ],
    state: cur.state,
    emotions,
    evening: cur.evening,
    refl: cur.refl,
    exch: cur.exch,
    kop: cur.kop,
    act: cur.act,
    groups: cur.groups,
    matrix: {
      keys: matrixKeys,
      rows: matrix,
    },
    daySeries,
    timelines,
    instruments,
    series,
    touchpoints,
    anketaBlocks,
    anketaCards,
    anketaForumByDay,
    dirColors,
    forumLayer,
    exportPath: selectedDir
      ? `/exports/direction?format=xlsx&direction=${encodeURIComponent(selectedDir)}&day=${day}`
      : undefined,
  };
}
