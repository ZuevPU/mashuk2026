import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, participantDayState, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import {
  EXPORT_TOUCHPOINT_FILTERS,
  touchpointTypeForQuestion,
} from '../exports/touchpointFilter.js';
import { getMoscowPhase } from '../timePhase.js';
import { TOUCHPOINT_SLOTS } from '../touchpointTemplates.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../touchpointProgress.js';

type QuestionRow = typeof questions.$inferSelect;

async function loadPublishedQuestions(dayNumbers: number[], shiftId?: number | null): Promise<QuestionRow[]> {
  const conditions = [];
  if (shiftId != null) conditions.push(eq(questions.shiftId, shiftId));
  if (dayNumbers.length) conditions.push(inArray(questions.dayNumber, dayNumbers));
  const rows = conditions.length
    ? await db.select().from(questions).where(and(...conditions))
    : await db.select().from(questions);
  return rows.filter(q => isPublishedStatus(q.status) && q.dayNumber != null && dayNumbers.includes(q.dayNumber));
}

async function loadCohortAnswers(participantIds: number[], questionIds?: number[]) {
  if (!participantIds.length) return [];
  if (questionIds && questionIds.length === 0) return [];
  const conditions = [inArray(answers.participantId, participantIds)];
  if (questionIds?.length) conditions.push(inArray(answers.questionId, questionIds));
  return db.select().from(answers).where(and(...conditions));
}

export async function touchpointCompletionByType(
  participantIds: number[],
  dayNumbers: number[],
  shiftId?: number | null,
): Promise<Record<string, number>> {
  if (participantIds.length === 0) return {};
  const dayQs = await loadPublishedQuestions(dayNumbers, shiftId);
  const qByType = new Map<string, Set<number>>();
  for (const f of EXPORT_TOUCHPOINT_FILTERS) {
    if (f === 'all') continue;
    qByType.set(f, new Set());
  }
  for (const q of dayQs) {
    const tp = touchpointTypeForQuestion(q);
    qByType.get(tp)?.add(q.id);
  }
  const qIds = dayQs.map(q => q.id);
  const ans = await loadCohortAnswers(participantIds, qIds);
  const answered = new Set(ans.map(a => `${a.participantId}:${a.questionId}`));
  const out: Record<string, number> = {};
  for (const [tp, set] of qByType) {
    let c = 0;
    for (const pid of participantIds) {
      for (const qid of set) {
        if (answered.has(`${pid}:${qid}`)) c += 1;
      }
    }
    out[tp] = c;
  }
  out.total = Object.values(out).reduce((s, n) => s + n, 0);
  return out;
}

export function stateCheckPhaseForAnswer(createdAt: Date | null): 'morning' | 'day' | 'evening' {
  if (!createdAt) return getMoscowPhase();
  return getMoscowPhase(createdAt);
}

export async function countStateChecksByPhase(
  participantIds: number[],
  dayNumbers: number[],
  shiftId?: number | null,
): Promise<Record<'morning' | 'day' | 'evening', number>> {
  const counts = { morning: 0, day: 0, evening: 0 };
  if (!participantIds.length) return counts;
  const dayQs = (await loadPublishedQuestions(dayNumbers, shiftId))
    .filter(q => reflectionKindFromQuestion(q) === 'state_check');
  const qIds = dayQs.map(q => q.id);
  const ans = await loadCohortAnswers(participantIds, qIds);
  for (const a of ans) {
    const phase = stateCheckPhaseForAnswer(a.createdAt);
    counts[phase] += 1;
  }
  return counts;
}

export async function countEveningCompleted(participantIds: number[], dayNumbers: number[]): Promise<number> {
  if (!participantIds.length) return 0;
  const states = await db.select().from(participantDayState)
    .where(inArray(participantDayState.participantId, participantIds));
  return states.filter(s =>
    dayNumbers.includes(s.dayNumber)
    && s.eveningRatings != null
    && typeof s.eveningRatings === 'object',
  ).length;
}

export type TouchpointThresholdPoint = {
  day: number;
  registered: number;
  /** Сколько человек закрыли ≥ k слотов (k = 1…7) */
  atLeast: Record<string, number>;
};

export type TouchpointThresholdDirectionPoint = TouchpointThresholdPoint & {
  direction: string;
};

/**
 * Охват 7 точек осмысления: по дням и по направлениям×день.
 * atLeast[k] = число зарегистрированных с completed ≥ k (канонический счётчик слотов).
 */
export async function buildTouchpointThresholdCoverage(
  cohort: { id: number; direction?: string | null; onboardingCompletedAt?: Date | null }[],
  days: number[],
  shiftId?: number | null,
): Promise<{
  slotsTotal: number;
  byDay: TouchpointThresholdPoint[];
  byDirectionDay: TouchpointThresholdDirectionPoint[];
}> {
  const slotsTotal = TOUCHPOINT_SLOTS.length;
  const emptyAtLeast = (): Record<string, number> => {
    const o: Record<string, number> = {};
    for (let k = 1; k <= slotsTotal; k++) o[String(k)] = 0;
    return o;
  };
  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const ids = cohort.map(p => p.id);

  if (!days.length || !registered.length) {
    return {
      slotsTotal,
      byDay: days.map(day => ({ day, registered: registered.length, atLeast: emptyAtLeast() })),
      byDirectionDay: [],
    };
  }

  const qRows = shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, shiftId))
    : await db.select().from(questions);
  const published = qRows.filter(q => isPublishedStatus(q.status));
  const tpQs = published.filter(q => days.some(d => isTouchpointQuestionForForumDay(q, d)));
  const tpQIds = tpQs.map(q => q.id);

  const ans = ids.length && tpQIds.length
    ? await db.select({
      participantId: answers.participantId,
      questionId: answers.questionId,
    }).from(answers).where(and(
      inArray(answers.participantId, ids),
      inArray(answers.questionId, tpQIds),
    ))
    : [];

  const answeredByPid = new Map<number, Set<number>>();
  for (const a of ans) {
    if (!answeredByPid.has(a.participantId)) answeredByPid.set(a.participantId, new Set());
    answeredByPid.get(a.participantId)!.add(a.questionId);
  }

  /** completed slots for registered participant on day */
  const completedByKey = new Map<string, number>();
  for (const p of registered) {
    const answeredIds = answeredByPid.get(p.id) ?? new Set<number>();
    for (const day of days) {
      const { completed } = touchpointCompletionRatio(tpQs, answeredIds, day);
      completedByKey.set(`${p.id}:${day}`, completed);
    }
  }

  const tally = (list: typeof registered, day: number) => {
    const atLeast = emptyAtLeast();
    for (const p of list) {
      const done = completedByKey.get(`${p.id}:${day}`) ?? 0;
      for (let k = 1; k <= slotsTotal; k++) {
        if (done >= k) atLeast[String(k)] += 1;
      }
    }
    return { day, registered: list.length, atLeast };
  };

  const byDay = days.map(day => tally(registered, day));

  const byDir = new Map<string, typeof registered>();
  for (const p of registered) {
    const d = (p.direction || '—').trim() || '—';
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(p);
  }

  const byDirectionDay: TouchpointThresholdDirectionPoint[] = [];
  for (const [direction, list] of byDir) {
    for (const day of days) {
      byDirectionDay.push({ direction, ...tally(list, day) });
    }
  }
  byDirectionDay.sort((a, b) => a.day - b.day || a.direction.localeCompare(b.direction, 'ru'));

  return { slotsTotal, byDay, byDirectionDay };
}

export type ParticipantTouchpointScore = {
  participantId: number;
  direction: string;
  /** Среднее число закрытых слотов за дни среза */
  avgCompleted: number;
  /** Доля от 7 слотов, 0–100 */
  activityPct: number;
  /** Есть ли хоть один день с ответами по точкам / зарегистрирован */
  hasData: boolean;
  dayScores: { day: number; completed: number }[];
};

/**
 * Уровень участника: сколько из 7 точек закрыто по дням среза (без N+1).
 */
export async function buildParticipantTouchpointEngagement(
  cohort: { id: number; direction?: string | null; onboardingCompletedAt?: Date | null }[],
  days: number[],
  shiftId?: number | null,
): Promise<{ slotsTotal: number; scores: ParticipantTouchpointScore[] }> {
  const slotsTotal = TOUCHPOINT_SLOTS.length;
  const registered = cohort.filter(p => p.onboardingCompletedAt);
  const ids = registered.map(p => p.id);

  if (!days.length || !ids.length) {
    return {
      slotsTotal,
      scores: registered.map(p => ({
        participantId: p.id,
        direction: (p.direction || '—').trim() || '—',
        avgCompleted: 0,
        activityPct: 0,
        hasData: false,
        dayScores: days.map(day => ({ day, completed: 0 })),
      })),
    };
  }

  const qRows = shiftId != null
    ? await db.select().from(questions).where(eq(questions.shiftId, shiftId))
    : await db.select().from(questions);
  const published = qRows.filter(q => isPublishedStatus(q.status));
  const tpQs = published.filter(q => days.some(d => isTouchpointQuestionForForumDay(q, d)));
  const tpQIds = tpQs.map(q => q.id);

  const ans = tpQIds.length
    ? await db.select({
      participantId: answers.participantId,
      questionId: answers.questionId,
    }).from(answers).where(and(
      inArray(answers.participantId, ids),
      inArray(answers.questionId, tpQIds),
    ))
    : [];

  const answeredByPid = new Map<number, Set<number>>();
  for (const a of ans) {
    if (!answeredByPid.has(a.participantId)) answeredByPid.set(a.participantId, new Set());
    answeredByPid.get(a.participantId)!.add(a.questionId);
  }

  const scores: ParticipantTouchpointScore[] = registered.map(p => {
    const answeredIds = answeredByPid.get(p.id) ?? new Set<number>();
    const dayScores = days.map(day => {
      const { completed } = touchpointCompletionRatio(tpQs, answeredIds, day);
      return { day, completed };
    });
    const sum = dayScores.reduce((s, d) => s + d.completed, 0);
    const avgCompleted = days.length ? Math.round((sum / days.length) * 10) / 10 : 0;
    const activityPct = slotsTotal
      ? Math.round((avgCompleted / slotsTotal) * 1000) / 10
      : 0;
    const hasData = dayScores.some(d => d.completed > 0) || answeredIds.size > 0;
    return {
      participantId: p.id,
      direction: (p.direction || '—').trim() || '—',
      avgCompleted,
      activityPct,
      hasData,
      dayScores,
    };
  });

  return { slotsTotal, scores };
}

export async function activityByDaySeries(
  participantIds: number[],
  days: number[],
  shiftId?: number | null,
) {
  if (!participantIds.length || !days.length) {
    return days.map(day => ({ day, answers: 0, touchpoints: 0 }));
  }
  const allQs = await loadPublishedQuestions(days, shiftId);
  const qIdsByDay = new Map<number, Set<number>>();
  const qByTypeByDay = new Map<number, Map<string, Set<number>>>();
  for (const q of allQs) {
    const d = q.dayNumber!;
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
  const allQIds = allQs.map(q => q.id);
  const ans = await loadCohortAnswers(participantIds, allQIds);
  const answered = new Set(ans.map(a => `${a.participantId}:${a.questionId}`));
  const ansByDay = new Map<number, number>();
  for (const a of ans) {
    for (const [day, qSet] of qIdsByDay) {
      if (qSet.has(a.questionId)) {
        ansByDay.set(day, (ansByDay.get(day) || 0) + 1);
        break;
      }
    }
  }
  return days.map(d => {
    let touchpoints = 0;
    const byType = qByTypeByDay.get(d);
    if (byType) {
      for (const set of byType.values()) {
        for (const pid of participantIds) {
          for (const qid of set) {
            if (answered.has(`${pid}:${qid}`)) touchpoints += 1;
          }
        }
      }
    }
    return { day: d, answers: ansByDay.get(d) || 0, touchpoints };
  });
}
