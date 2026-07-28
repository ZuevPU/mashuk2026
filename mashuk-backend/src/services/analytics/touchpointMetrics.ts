import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, participantDayState, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';
import {
  EXPORT_TOUCHPOINT_FILTERS,
  touchpointTypeForQuestion,
  type ExportTouchpointFilter,
} from '../exports/touchpointFilter.js';
import { getMoscowPhase } from '../timePhase.js';

export async function touchpointCompletionByType(
  participantIds: number[],
  dayNumbers: number[],
): Promise<Record<string, number>> {
  if (participantIds.length === 0) return {};
  const dayQs = (await db.select().from(questions))
    .filter(q => isPublishedStatus(q.status) && q.dayNumber != null && dayNumbers.includes(q.dayNumber));
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
  const ans = qIds.length
    ? await db.select().from(answers).where(inArray(answers.participantId, participantIds))
    : [];
  const answered = new Set(ans.filter(a => qIds.includes(a.questionId)).map(a => `${a.participantId}:${a.questionId}`));
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
): Promise<Record<'morning' | 'day' | 'evening', number>> {
  const counts = { morning: 0, day: 0, evening: 0 };
  if (!participantIds.length) return counts;
  const dayQs = (await db.select().from(questions))
    .filter(q => isPublishedStatus(q.status) && q.dayNumber != null && dayNumbers.includes(q.dayNumber))
    .filter(q => reflectionKindFromQuestion(q) === 'state_check');
  const qIds = new Set(dayQs.map(q => q.id));
  const ans = await db.select().from(answers).where(inArray(answers.participantId, participantIds));
  for (const a of ans) {
    if (!qIds.has(a.questionId)) continue;
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

export async function activityByDaySeries(participantIds: number[], days: number[]) {
  const series: { day: number; answers: number; touchpoints: number }[] = [];
  for (const d of days) {
    const dayQs = (await db.select().from(questions))
      .filter(q => isPublishedStatus(q.status) && q.dayNumber === d);
    const qIds = new Set(dayQs.map(q => q.id));
    const ans = participantIds.length
      ? await db.select().from(answers).where(inArray(answers.participantId, participantIds))
      : [];
    const dayAns = ans.filter(a => qIds.has(a.questionId));
    const tp = await touchpointCompletionByType(participantIds, [d]);
    series.push({ day: d, answers: dayAns.length, touchpoints: tp.total ?? 0 });
  }
  return series;
}
