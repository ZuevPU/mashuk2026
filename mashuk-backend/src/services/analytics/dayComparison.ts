import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, participantDayState, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  EXPORT_TOUCHPOINT_FILTERS,
  touchpointTypeForQuestion,
} from '../exports/touchpointFilter.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import {
  accumulateZoneFromAnswer,
  emptyZoneDistribution,
  zonesToPercent,
} from './zoneDistribution.js';

export type KindDashboardMode = 'after_blocks' | 'state_check';

function isStateCheckQuestion(q: typeof questions.$inferSelect): boolean {
  if (q.questionKind === 'state_check' || q.reflectionKind === 'state_check') return true;
  if (q.type === 'checkin') return true;
  if (reflectionKindFromQuestion(q) === 'state_check') return true;
  const block = (q.block || '').toLowerCase();
  return block.includes('проверк');
}

function isAfterBlocksQuestion(q: typeof questions.$inferSelect): boolean {
  if (q.questionKind === 'after_blocks') return true;
  const linked = Array.isArray(q.linkedEventIds) ? q.linkedEventIds : [];
  if (linked.length > 0 && q.type !== 'checkin') return true;
  const block = (q.block || '').toLowerCase();
  if (block.includes('точки осмысления') || block.includes('точек осмысления')) return true;
  return false;
}

function matchesKind(q: typeof questions.$inferSelect, mode: KindDashboardMode): boolean {
  if (mode === 'after_blocks') return isAfterBlocksQuestion(q) && !isStateCheckQuestion(q);
  return isStateCheckQuestion(q);
}

export type DayKpiPoint = {
  day: number;
  active: number;
  registered: number;
  coveragePct: number;
  eveningCompleted: number;
  touchpoints: number;
  answers: number;
};

export type DirectionDayPoint = {
  direction: string;
  day: number;
  active: number;
  registered: number;
  coveragePct: number;
  eveningCompleted: number;
  touchpoints: number;
  answers: number;
  submitted?: number;
  fillRatePct?: number;
  drafts?: number;
  answerCount?: number;
  riskFatiguePct?: number;
};

export type QuestionnaireDayPoint = {
  day: number;
  submitted: number;
  registered: number;
  fillRatePct: number;
  drafts?: number;
  answerCount?: number;
  riskFatiguePct?: number;
};

export type GroupDayPoint = {
  group: string;
  day: number;
  submitted: number;
  registered: number;
  fillRatePct: number;
  drafts: number;
};

type CohortP = {
  id: number;
  direction?: string | null;
  groupName?: string | null;
  onboardingCompletedAt?: Date | null;
};

/** Days D1…Dcurrent (cap 8) for always-on comparison charts. */
export function forumSeriesDays(currentForumDay: number): number[] {
  const n = Math.min(Math.max(1, currentForumDay || 1), 8);
  return Array.from({ length: n }, (_, i) => i + 1);
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function dirOf(p: CohortP): string {
  return (p.direction || '—').trim() || '—';
}

function groupOf(p: CohortP): string {
  return (p.groupName || 'без группы').trim() || 'без группы';
}

function questionDaysOf(q: { dayNumber?: number | null; dayNumbers?: number[] | null }): number[] {
  const out: number[] = [];
  if (q.dayNumber != null && q.dayNumber >= 1) out.push(q.dayNumber);
  if (Array.isArray(q.dayNumbers)) {
    for (const d of q.dayNumbers) {
      if (typeof d === 'number' && d >= 1 && !out.includes(d)) out.push(d);
    }
  }
  return out;
}

async function loadPublishedQuestions(dayNumbers: number[], shiftId?: number | null) {
  if (!dayNumbers.length) return [];
  const conditions = [];
  if (shiftId != null) conditions.push(eq(questions.shiftId, shiftId));
  const rows = conditions.length
    ? await db.select().from(questions).where(and(...conditions))
    : await db.select().from(questions);
  return rows.filter(q =>
    isPublishedStatus(q.status)
    && questionDaysOf(q).some(d => dayNumbers.includes(d)),
  );
}

async function loadCohortAnswers(participantIds: number[], questionIds: number[]) {
  if (!participantIds.length || !questionIds.length) return [];
  return db.select({
    participantId: answers.participantId,
    questionId: answers.questionId,
    answerData: answers.answerData,
  }).from(answers).where(and(
    inArray(answers.participantId, participantIds),
    inArray(answers.questionId, questionIds),
  ));
}

/**
 * Forum-day KPI series for pulse / overview / direction:
 * active = unique participants with ≥1 answer that day; coverage = active/registered.
 */
export async function buildForumDayKpiSeries(
  cohort: CohortP[],
  days: number[],
  shiftId?: number | null,
): Promise<{ daySeries: DayKpiPoint[]; byDirectionDaySeries: DirectionDayPoint[] }> {
  const registered = cohort.filter(p => p.onboardingCompletedAt).length;
  const ids = cohort.map(p => p.id);
  const emptyDay = (day: number): DayKpiPoint => ({
    day,
    active: 0,
    registered,
    coveragePct: 0,
    eveningCompleted: 0,
    touchpoints: 0,
    answers: 0,
  });

  if (!days.length) {
    return { daySeries: [], byDirectionDaySeries: [] };
  }
  if (!ids.length) {
    return {
      daySeries: days.map(emptyDay),
      byDirectionDaySeries: [],
    };
  }

  const allQs = await loadPublishedQuestions(days, shiftId);
  const qIdsByDay = new Map<number, Set<number>>();
  const qByTypeByDay = new Map<number, Map<string, Set<number>>>();
  for (const q of allQs) {
    const d = q.dayNumber
      ?? questionDaysOf(q).find(n => days.includes(n))
      ?? null;
    if (d == null || !days.includes(d)) continue;
    if (!qIdsByDay.has(d)) qIdsByDay.set(d, new Set());
    qIdsByDay.get(d)!.add(q.id);
    if (!qByTypeByDay.has(d)) {
      const m = new Map<string, Set<number>>();
      for (const f of EXPORT_TOUCHPOINT_FILTERS) {
        if (f !== 'all') m.set(f, new Set());
      }
      qByTypeByDay.set(d, m);
    }
    const tp = touchpointTypeForQuestion(q);
    qByTypeByDay.get(d)!.get(tp)?.add(q.id);
  }

  const qIdToDay = new Map<number, number>();
  for (const [day, set] of qIdsByDay) {
    for (const qid of set) qIdToDay.set(qid, day);
  }

  const ans = await loadCohortAnswers(ids, allQs.map(q => q.id));
  const answered = new Set(ans.map(a => `${a.participantId}:${a.questionId}`));

  const activeByDay = new Map<number, Set<number>>();
  const answersByDay = new Map<number, number>();
  for (const a of ans) {
    const day = qIdToDay.get(a.questionId);
    if (day == null) continue;
    if (!activeByDay.has(day)) activeByDay.set(day, new Set());
    activeByDay.get(day)!.add(a.participantId);
    answersByDay.set(day, (answersByDay.get(day) || 0) + 1);
  }

  const states = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
  }).from(participantDayState).where(inArray(participantDayState.participantId, ids));

  const eveningByDay = new Map<number, Set<number>>();
  for (const s of states) {
    if (!days.includes(s.dayNumber)) continue;
    if (s.eveningRatings == null || typeof s.eveningRatings !== 'object') continue;
    if (!eveningByDay.has(s.dayNumber)) eveningByDay.set(s.dayNumber, new Set());
    eveningByDay.get(s.dayNumber)!.add(s.participantId);
  }

  const daySeries: DayKpiPoint[] = days.map(day => {
    const active = activeByDay.get(day)?.size ?? 0;
    let touchpoints = 0;
    const byType = qByTypeByDay.get(day);
    if (byType) {
      for (const set of byType.values()) {
        for (const pid of ids) {
          for (const qid of set) {
            if (answered.has(`${pid}:${qid}`)) touchpoints += 1;
          }
        }
      }
    }
    return {
      day,
      active,
      registered,
      coveragePct: pct(active, registered),
      eveningCompleted: eveningByDay.get(day)?.size ?? 0,
      touchpoints,
      answers: answersByDay.get(day) || 0,
    };
  });

  const byDir = new Map<string, CohortP[]>();
  for (const p of cohort) {
    const d = dirOf(p);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(p);
  }

  const byDirectionDaySeries: DirectionDayPoint[] = [];
  for (const [direction, list] of byDir) {
    const reg = list.filter(p => p.onboardingCompletedAt).length;
    const pids = new Set(list.map(p => p.id));
    for (const day of days) {
      const activeSet = activeByDay.get(day);
      let active = 0;
      if (activeSet) {
        for (const pid of activeSet) {
          if (pids.has(pid)) active += 1;
        }
      }
      let eveningCompleted = 0;
      const eve = eveningByDay.get(day);
      if (eve) {
        for (const pid of eve) {
          if (pids.has(pid)) eveningCompleted += 1;
        }
      }
      let answersCount = 0;
      let touchpoints = 0;
      const qSet = qIdsByDay.get(day);
      const byType = qByTypeByDay.get(day);
      if (qSet) {
        for (const a of ans) {
          if (!pids.has(a.participantId) || !qSet.has(a.questionId)) continue;
          answersCount += 1;
        }
      }
      if (byType) {
        for (const set of byType.values()) {
          for (const pid of pids) {
            for (const qid of set) {
              if (answered.has(`${pid}:${qid}`)) touchpoints += 1;
            }
          }
        }
      }
      byDirectionDaySeries.push({
        direction,
        day,
        active,
        registered: reg,
        coveragePct: pct(active, reg),
        eveningCompleted,
        touchpoints,
        answers: answersCount,
        submitted: eveningCompleted,
        fillRatePct: pct(eveningCompleted, reg),
      });
    }
  }

  byDirectionDaySeries.sort((a, b) =>
    a.day - b.day || a.direction.localeCompare(b.direction, 'ru'));

  return { daySeries, byDirectionDaySeries };
}

/** Evening questionnaire: submitted / drafts / fillRate by forum day (+ by direction / group). */
export async function buildEveningDaySeries(
  cohort: CohortP[],
  days: number[],
): Promise<{
  daySeries: QuestionnaireDayPoint[];
  byDirectionDaySeries: DirectionDayPoint[];
  byGroupDaySeries: GroupDayPoint[];
}> {
  const registered = cohort.filter(p => p.onboardingCompletedAt).length;
  const ids = cohort.map(p => p.id);
  const empty = (day: number): QuestionnaireDayPoint => ({
    day,
    submitted: 0,
    registered,
    fillRatePct: 0,
    drafts: 0,
  });

  if (!days.length) {
    return { daySeries: [], byDirectionDaySeries: [], byGroupDaySeries: [] };
  }
  if (!ids.length) {
    return { daySeries: days.map(empty), byDirectionDaySeries: [], byGroupDaySeries: [] };
  }

  const states = await db.select({
    participantId: participantDayState.participantId,
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
    eveningDraft: participantDayState.eveningDraft,
  }).from(participantDayState).where(inArray(participantDayState.participantId, ids));

  const submittedByDay = new Map<number, Set<number>>();
  const draftsByDay = new Map<number, Set<number>>();
  for (const s of states) {
    if (!days.includes(s.dayNumber)) continue;
    const hasRatings = s.eveningRatings != null && typeof s.eveningRatings === 'object';
    const hasDraft = s.eveningDraft != null && typeof s.eveningDraft === 'object';
    if (hasRatings) {
      if (!submittedByDay.has(s.dayNumber)) submittedByDay.set(s.dayNumber, new Set());
      submittedByDay.get(s.dayNumber)!.add(s.participantId);
    } else if (hasDraft) {
      if (!draftsByDay.has(s.dayNumber)) draftsByDay.set(s.dayNumber, new Set());
      draftsByDay.get(s.dayNumber)!.add(s.participantId);
    }
  }

  const daySeries = days.map(day => {
    const submitted = submittedByDay.get(day)?.size ?? 0;
    const drafts = draftsByDay.get(day)?.size ?? 0;
    return {
      day,
      submitted,
      registered,
      fillRatePct: pct(submitted, registered),
      drafts,
    };
  });

  const byDir = new Map<string, CohortP[]>();
  for (const p of cohort) {
    const d = dirOf(p);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(p);
  }

  const byDirectionDaySeries: DirectionDayPoint[] = [];
  for (const [direction, list] of byDir) {
    const reg = list.filter(p => p.onboardingCompletedAt).length;
    const pids = new Set(list.map(p => p.id));
    for (const day of days) {
      let submitted = 0;
      let drafts = 0;
      const sub = submittedByDay.get(day);
      const dr = draftsByDay.get(day);
      if (sub) for (const pid of sub) if (pids.has(pid)) submitted += 1;
      if (dr) for (const pid of dr) if (pids.has(pid)) drafts += 1;
      byDirectionDaySeries.push({
        direction,
        day,
        active: submitted,
        registered: reg,
        coveragePct: pct(submitted, reg),
        eveningCompleted: submitted,
        touchpoints: 0,
        answers: 0,
        submitted,
        fillRatePct: pct(submitted, reg),
        drafts,
      });
    }
  }
  byDirectionDaySeries.sort((a, b) =>
    a.day - b.day || a.direction.localeCompare(b.direction, 'ru'));

  const byGroup = new Map<string, CohortP[]>();
  for (const p of cohort) {
    const g = groupOf(p);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(p);
  }

  const byGroupDaySeries: GroupDayPoint[] = [];
  for (const [group, list] of byGroup) {
    const reg = list.filter(p => p.onboardingCompletedAt).length;
    const pids = new Set(list.map(p => p.id));
    for (const day of days) {
      let submitted = 0;
      let drafts = 0;
      const sub = submittedByDay.get(day);
      const dr = draftsByDay.get(day);
      if (sub) for (const pid of sub) if (pids.has(pid)) submitted += 1;
      if (dr) for (const pid of dr) if (pids.has(pid)) drafts += 1;
      byGroupDaySeries.push({
        group,
        day,
        submitted,
        registered: reg,
        fillRatePct: pct(submitted, reg),
        drafts,
      });
    }
  }
  byGroupDaySeries.sort((a, b) =>
    a.day - b.day || a.group.localeCompare(b.group, 'ru'));

  return { daySeries, byDirectionDaySeries, byGroupDaySeries };
}

/** After-blocks / state-checks: unique submitters & answers by forum day. */
export async function buildKindDaySeries(
  mode: KindDashboardMode,
  cohort: CohortP[],
  days: number[],
  shiftId?: number | null,
): Promise<{ daySeries: QuestionnaireDayPoint[]; byDirectionDaySeries: DirectionDayPoint[] }> {
  const registered = cohort.filter(p => p.onboardingCompletedAt).length;
  const ids = cohort.map(p => p.id);
  const idSet = new Set(ids);
  const empty = (day: number): QuestionnaireDayPoint => ({
    day,
    submitted: 0,
    registered,
    fillRatePct: 0,
    answerCount: 0,
    riskFatiguePct: mode === 'state_check' ? 0 : undefined,
  });

  if (!days.length) return { daySeries: [], byDirectionDaySeries: [] };
  if (!ids.length) {
    return { daySeries: days.map(empty), byDirectionDaySeries: [] };
  }

  const allQs = await loadPublishedQuestions(days, shiftId);
  const kindQs = allQs.filter(q => matchesKind(q, mode));
  const qIdToDay = new Map(kindQs.map(q => [q.id, q.dayNumber!]));
  const ans = await loadCohortAnswers(ids, kindQs.map(q => q.id));

  const submittedByDay = new Map<number, Set<number>>();
  const answersByDay = new Map<number, number>();
  const zonesByDay = new Map<number, ReturnType<typeof emptyZoneDistribution>>();

  for (const a of ans) {
    if (!idSet.has(a.participantId)) continue;
    const day = qIdToDay.get(a.questionId);
    if (day == null) continue;
    if (!submittedByDay.has(day)) submittedByDay.set(day, new Set());
    submittedByDay.get(day)!.add(a.participantId);
    answersByDay.set(day, (answersByDay.get(day) || 0) + 1);
    if (mode === 'state_check') {
      if (!zonesByDay.has(day)) zonesByDay.set(day, emptyZoneDistribution());
      accumulateZoneFromAnswer(zonesByDay.get(day)!, a.answerData);
    }
  }

  const daySeries = days.map(day => {
    const submitted = submittedByDay.get(day)?.size ?? 0;
    const answerCount = answersByDay.get(day) || 0;
    let riskFatiguePct: number | undefined;
    if (mode === 'state_check') {
      const z = zonesToPercent(zonesByDay.get(day) ?? emptyZoneDistribution());
      riskFatiguePct = Math.round(((z.risk || 0) + (z.fatigue || 0)) * 10) / 10;
    }
    return {
      day,
      submitted,
      registered,
      fillRatePct: pct(submitted, registered),
      answerCount,
      riskFatiguePct,
    };
  });

  const byDir = new Map<string, CohortP[]>();
  for (const p of cohort) {
    const d = dirOf(p);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(p);
  }

  const pidToDir = new Map(cohort.map(p => [p.id, dirOf(p)]));
  const submittedByDirDay = new Map<string, Set<number>>();
  const answersByDirDay = new Map<string, number>();

  for (const a of ans) {
    if (!idSet.has(a.participantId)) continue;
    const day = qIdToDay.get(a.questionId);
    if (day == null) continue;
    const direction = pidToDir.get(a.participantId) || '—';
    const key = `${direction}::${day}`;
    if (!submittedByDirDay.has(key)) submittedByDirDay.set(key, new Set());
    submittedByDirDay.get(key)!.add(a.participantId);
    answersByDirDay.set(key, (answersByDirDay.get(key) || 0) + 1);
  }

  const byDirectionDaySeries: DirectionDayPoint[] = [];
  for (const [direction, list] of byDir) {
    const reg = list.filter(p => p.onboardingCompletedAt).length;
    for (const day of days) {
      const key = `${direction}::${day}`;
      const submitted = submittedByDirDay.get(key)?.size ?? 0;
      const answerCount = answersByDirDay.get(key) || 0;
      byDirectionDaySeries.push({
        direction,
        day,
        active: submitted,
        registered: reg,
        coveragePct: pct(submitted, reg),
        eveningCompleted: 0,
        touchpoints: 0,
        answers: answerCount,
        submitted,
        fillRatePct: pct(submitted, reg),
        answerCount,
      });
    }
  }
  byDirectionDaySeries.sort((a, b) =>
    a.day - b.day || a.direction.localeCompare(b.direction, 'ru'));

  return { daySeries, byDirectionDaySeries };
}
