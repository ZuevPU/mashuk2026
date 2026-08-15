import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, pointsLog, questions } from '../db/schema.js';
import {
  pointsActionForQuestion,
  recalculateParticipantTotals,
  revokePointsLogEntry,
} from './pointsService.js';

export type AnswerAwardKind = 'primary' | 'bonus' | 'other';

export type AnswerAward = {
  logId: number;
  actionType: string;
  points: number;
  label: string;
  kind: AnswerAwardKind;
  createdAt: Date | string | null;
};

type LogLike = {
  id: number;
  actionType: string | null;
  points: number;
  revokedAt: Date | null;
  relatedLogId: number | null;
  createdAt: Date | null;
  participantId: number;
};

export function awardLabel(actionType: string, points: number, kind: AnswerAwardKind): string {
  if (kind === 'bonus' || (actionType === 'question_answer' && points === 3)) {
    return 'За развёрнутый ответ';
  }
  if (actionType.startsWith('state_check_')) return 'За ответ на проверку состояния';
  if (actionType === 'question_answer') return 'За ответ на вопрос';
  if (actionType === 'point_b_complete') return 'За Точку Б';
  return 'Начисление';
}

export function classifyAward(
  log: { actionType: string | null; points: number; relatedLogId: number | null },
  questionAction: string,
  primaryLogId: number | null,
): AnswerAwardKind {
  const action = log.actionType || '';
  if (primaryLogId != null && log.relatedLogId === primaryLogId) return 'bonus';
  if (action === 'question_answer' && log.points === 3 && questionAction !== 'question_answer') {
    return 'bonus';
  }
  if (action === questionAction) return 'primary';
  return 'other';
}

function ts(raw: Date | string | null | undefined): number {
  if (!raw) return 0;
  const n = new Date(raw).getTime();
  return Number.isFinite(n) ? n : 0;
}

export function matchAwardsToAnswer(
  logs: LogLike[],
  answer: { participantId: number; pointsLogId: number | null; createdAt: Date | string | null },
  questionAction: string,
): AnswerAward[] {
  const at = ts(answer.createdAt);
  const picked = new Map<number, LogLike>();
  const take = (row: LogLike | undefined) => {
    if (!row || row.revokedAt || row.points <= 0) return;
    if (row.participantId !== answer.participantId) return;
    picked.set(row.id, row);
  };

  if (answer.pointsLogId != null) {
    take(logs.find(l => l.id === answer.pointsLogId));
  }
  if (answer.pointsLogId != null) {
    for (const row of logs) {
      if (row.relatedLogId === answer.pointsLogId) take(row);
    }
  }

  for (const row of logs) {
    if (row.participantId !== answer.participantId || row.revokedAt || row.points <= 0) continue;
    const delta = Math.abs(ts(row.createdAt) - at);
    const action = row.actionType || '';
    if (action === questionAction && delta <= 15 * 60_000) take(row);
    if (
      questionAction !== 'question_answer'
      && action === 'question_answer'
      && row.points === 3
      && delta <= 20_000
    ) {
      take(row);
    }
  }

  return [...picked.values()]
    .sort((a, b) => b.points - a.points || a.id - b.id)
    .map(row => {
      const kind = classifyAward(row, questionAction, answer.pointsLogId);
      return {
        logId: row.id,
        actionType: row.actionType || '',
        points: row.points,
        label: awardLabel(row.actionType || '', row.points, kind),
        kind,
        createdAt: row.createdAt,
      };
    });
}

async function loadQuestionAndAnswer(questionId: number, answerId: number) {
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!question) return { ok: false as const, error: 'Question not found' };
  const [answer] = await db.select().from(answers).where(and(
    eq(answers.id, answerId),
    eq(answers.questionId, questionId),
  )).limit(1);
  if (!answer) return { ok: false as const, error: 'Answer not found' };
  return { ok: true as const, question, answer };
}

async function loadParticipantLogs(participantIds: number[]): Promise<LogLike[]> {
  if (!participantIds.length) return [];
  return db.select({
    id: pointsLog.id,
    actionType: pointsLog.actionType,
    points: pointsLog.points,
    revokedAt: pointsLog.revokedAt,
    relatedLogId: pointsLog.relatedLogId,
    createdAt: pointsLog.createdAt,
    participantId: pointsLog.participantId,
  }).from(pointsLog).where(and(
    inArray(pointsLog.participantId, participantIds),
    isNull(pointsLog.revokedAt),
    sql`${pointsLog.points} > 0`,
  ));
}

export async function awardsForQuestionAnswers(
  questionId: number,
  answerRows: Array<{
    id: number;
    participantId: number;
    pointsLogId: number | null;
    createdAt: Date | string | null;
  }>,
): Promise<Map<number, AnswerAward[]>> {
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  const out = new Map<number, AnswerAward[]>();
  if (!question || !answerRows.length) return out;
  const action = pointsActionForQuestion(question);
  const logs = await loadParticipantLogs([...new Set(answerRows.map(a => a.participantId))]);
  for (const answer of answerRows) {
    out.set(answer.id, matchAwardsToAnswer(logs, answer, action));
  }
  return out;
}

export async function deleteParticipantAnswer(
  questionId: number,
  answerId: number,
  reason: string,
): Promise<{ ok: true; revokedLogs: number; pointsRevoked: number } | { ok: false; error: string }> {
  const loaded = await loadQuestionAndAnswer(questionId, answerId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { question, answer } = loaded;
  const action = pointsActionForQuestion(question);
  const logs = await loadParticipantLogs([answer.participantId]);
  const awards = matchAwardsToAnswer(logs, answer, action);
  let revokedLogs = 0;
  let pointsRevoked = 0;
  for (const award of awards) {
    const result = await revokePointsLogEntry(award.logId, answer.participantId, reason);
    if (result.ok) {
      revokedLogs += 1;
      pointsRevoked += award.points;
    }
  }
  await db.delete(answers).where(eq(answers.id, answer.id));
  await recalculateParticipantTotals(answer.participantId);
  return { ok: true, revokedLogs, pointsRevoked };
}

export async function revokeAwardsForAnswer(
  questionId: number,
  answerId: number,
  reason: string,
  opts?: { kind?: 'all' | 'bonus'; logIds?: number[] },
): Promise<{ ok: true; revokedLogs: number; pointsRevoked: number } | { ok: false; error: string }> {
  const loaded = await loadQuestionAndAnswer(questionId, answerId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { question, answer } = loaded;
  const action = pointsActionForQuestion(question);
  const logs = await loadParticipantLogs([answer.participantId]);
  let awards = matchAwardsToAnswer(logs, answer, action);
  if (opts?.logIds?.length) {
    const allow = new Set(opts.logIds);
    awards = awards.filter(a => allow.has(a.logId));
  } else if (opts?.kind === 'bonus') {
    awards = awards.filter(a => a.kind === 'bonus');
  }
  let revokedLogs = 0;
  let pointsRevoked = 0;
  for (const award of awards) {
    const result = await revokePointsLogEntry(award.logId, answer.participantId, reason);
    if (result.ok) {
      revokedLogs += 1;
      pointsRevoked += award.points;
    }
  }
  const leftover = matchAwardsToAnswer(
    (await loadParticipantLogs([answer.participantId])),
    answer,
    action,
  );
  const leftoverSum = leftover.reduce((s, a) => s + a.points, 0);
  await db.update(answers)
    .set({
      pointsAwarded: leftoverSum,
      pointsLogId: leftover.find(a => a.kind === 'primary')?.logId ?? leftover[0]?.logId ?? null,
    })
    .where(eq(answers.id, answer.id));
  await recalculateParticipantTotals(answer.participantId);
  return { ok: true, revokedLogs, pointsRevoked };
}
