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
