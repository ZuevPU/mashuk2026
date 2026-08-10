import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, exchangeAnswers, exchangeQuestions, pointsLog, questions, taskSubmissions, tasks,
} from '../db/schema.js';
import { participantAnswerSummary } from './participantAnswerFormat.js';
import { pointsTrackForAction, type PointTrack } from './pointsService.js';

export type PointsLogSource = {
  sourceKind: 'task' | 'question' | 'exchange_question' | 'exchange_answer' | null;
  sourceId: number | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  answerPreview: string | null;
  track: PointTrack | 'bonus';
};

function plainFromHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function taskDescription(t: {
  descriptionHtml?: string | null;
  description?: string | null;
  shortDescription?: string | null;
}): string {
  return plainFromHtml(t.descriptionHtml) || (t.description || '').trim() || (t.shortDescription || '').trim();
}

function clip(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type LogLike = {
  id: number;
  participantId?: number | null;
  actionType?: string | null;
  submissionId?: number | null;
  createdAt?: Date | string | null;
};

function ts(raw: Date | string | null | undefined): number {
  if (!raw) return 0;
  const n = new Date(raw).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve human-readable task/question/exchange source for points_log rows.
 */
export async function resolvePointsLogSources(
  logs: LogLike[],
): Promise<Map<number, PointsLogSource>> {
  const out = new Map<number, PointsLogSource>();
  for (const log of logs) {
    out.set(log.id, {
      sourceKind: null,
      sourceId: null,
      sourceTitle: null,
      sourceDescription: null,
      answerPreview: null,
      track: pointsTrackForAction(log.actionType || ''),
    });
  }
  if (!logs.length) return out;

  const logIds = logs.map(l => l.id);
  const submissionIds = [...new Set(
    logs.map(l => l.submissionId).filter((id): id is number => id != null && id > 0),
  )];

  if (submissionIds.length) {
    const rows = await db.select({
      submissionId: taskSubmissions.id,
      taskId: tasks.id,
      title: tasks.title,
      description: tasks.description,
      descriptionHtml: tasks.descriptionHtml,
      shortDescription: tasks.shortDescription,
      answerText: taskSubmissions.answerText,
    }).from(taskSubmissions)
      .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(inArray(taskSubmissions.id, submissionIds));

    const bySubmission = new Map(rows.map(r => [r.submissionId, r]));
    for (const log of logs) {
      if (log.submissionId == null) continue;
      const row = bySubmission.get(log.submissionId);
      if (!row?.title) continue;
      out.set(log.id, {
        sourceKind: 'task',
        sourceId: row.taskId ?? null,
        sourceTitle: row.title,
        sourceDescription: taskDescription(row) || null,
        answerPreview: row.answerText ? clip(row.answerText) : null,
        track: pointsTrackForAction(log.actionType || ''),
      });
    }
  }

  // Forum questions via answers.points_log_id
  const answerRows = await db.select({
    pointsLogId: answers.pointsLogId,
    answerId: answers.id,
    answerData: answers.answerData,
    questionId: questions.id,
    title: questions.title,
    text: questions.text,
    subtitle: questions.subtitle,
    dayNumber: questions.dayNumber,
  }).from(answers)
    .leftJoin(questions, eq(answers.questionId, questions.id))
    .where(and(
      inArray(answers.pointsLogId, logIds),
      isNotNull(answers.pointsLogId),
    ));

  for (const row of answerRows) {
    if (row.pointsLogId == null) continue;
    const prev = out.get(row.pointsLogId);
    if (prev?.sourceKind === 'task') continue;
    const desc = [
      row.dayNumber != null ? `День ${row.dayNumber}` : null,
      row.subtitle,
      row.text,
    ].filter(Boolean).join(' · ').trim();
    const preview = participantAnswerSummary(row.answerData);
    out.set(row.pointsLogId, {
      sourceKind: 'question',
      sourceId: row.questionId ?? null,
      sourceTitle: row.title || null,
      sourceDescription: desc || null,
      answerPreview: preview ? clip(preview) : null,
      track: pointsTrackForAction(
        logs.find(l => l.id === row.pointsLogId)?.actionType || 'question_answer',
      ),
    });
  }

  // Submissions linked via points_log_id
  const orphanLogIds = logs
    .filter(l => !out.get(l.id)?.sourceKind)
    .map(l => l.id);
  if (orphanLogIds.length) {
    const viaSubLog = await db.select({
      pointsLogId: taskSubmissions.pointsLogId,
      taskId: tasks.id,
      title: tasks.title,
      description: tasks.description,
      descriptionHtml: tasks.descriptionHtml,
      shortDescription: tasks.shortDescription,
      answerText: taskSubmissions.answerText,
    }).from(taskSubmissions)
      .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(and(
        inArray(taskSubmissions.pointsLogId, orphanLogIds),
        isNotNull(taskSubmissions.pointsLogId),
      ));

    for (const row of viaSubLog) {
      if (row.pointsLogId == null || !row.title) continue;
      out.set(row.pointsLogId, {
        sourceKind: 'task',
        sourceId: row.taskId ?? null,
        sourceTitle: row.title,
        sourceDescription: taskDescription(row) || null,
        answerPreview: row.answerText ? clip(row.answerText) : null,
        track: pointsTrackForAction(
          logs.find(l => l.id === row.pointsLogId)?.actionType || 'task_complete',
        ),
      });
    }
  }

  // Exchange Q/A: no FK on points_log — match by participant + nearest createdAt (±3 min).
  const exchangeLogs = logs.filter(l => {
    const a = (l.actionType || '').replace(/_revoke$/i, '');
    return (a === 'exchange_answer' || a === 'exchange_question') && !out.get(l.id)?.sourceKind;
  });
  if (exchangeLogs.length) {
    const participantIds = [...new Set(
      exchangeLogs.map(l => l.participantId).filter((id): id is number => id != null && id > 0),
    )];
    if (participantIds.length) {
      const qRows = await db.select({
        id: exchangeQuestions.id,
        participantId: exchangeQuestions.participantId,
        text: exchangeQuestions.text,
        createdAt: exchangeQuestions.createdAt,
      }).from(exchangeQuestions).where(inArray(exchangeQuestions.participantId, participantIds));

      const aRows = await db.select({
        id: exchangeAnswers.id,
        participantId: exchangeAnswers.participantId,
        questionId: exchangeAnswers.questionId,
        text: exchangeAnswers.text,
        createdAt: exchangeAnswers.createdAt,
      }).from(exchangeAnswers).where(inArray(exchangeAnswers.participantId, participantIds));

      const usedQ = new Set<number>();
      const usedA = new Set<number>();
      const WINDOW_MS = 3 * 60 * 1000;

      const pickNearest = <T extends { id: number; participantId: number; createdAt: Date | null }>(
        pool: T[],
        participantId: number,
        at: number,
        used: Set<number>,
      ): T | null => {
        let best: T | null = null;
        let bestDelta = Infinity;
        for (const row of pool) {
          if (row.participantId !== participantId || used.has(row.id)) continue;
          const delta = Math.abs(ts(row.createdAt) - at);
          if (delta > WINDOW_MS) continue;
          if (delta < bestDelta) {
            best = row;
            bestDelta = delta;
          }
        }
        return best;
      };

      for (const log of exchangeLogs) {
        const pid = log.participantId;
        if (pid == null) continue;
        const at = ts(log.createdAt);
        const base = (log.actionType || '').replace(/_revoke$/i, '');
        if (base === 'exchange_question') {
          const hit = pickNearest(qRows, pid, at, usedQ);
          if (!hit) continue;
          usedQ.add(hit.id);
          out.set(log.id, {
            sourceKind: 'exchange_question',
            sourceId: hit.id,
            sourceTitle: `Вопрос в обмене #${hit.id}`,
            sourceDescription: null,
            answerPreview: clip(hit.text),
            track: pointsTrackForAction(log.actionType || 'exchange_question'),
          });
        } else if (base === 'exchange_answer') {
          const hit = pickNearest(aRows, pid, at, usedA);
          if (!hit) continue;
          usedA.add(hit.id);
          const q = qRows.find(x => x.id === hit.questionId);
          out.set(log.id, {
            sourceKind: 'exchange_answer',
            sourceId: hit.id,
            sourceTitle: q
              ? `Ответ на вопрос обмена #${q.id}`
              : `Ответ в обмене #${hit.id}`,
            sourceDescription: q ? clip(`Вопрос: ${q.text}`, 160) : null,
            answerPreview: clip(hit.text),
            track: pointsTrackForAction(log.actionType || 'exchange_answer'),
          });
        }
      }
    }
  }

  return out;
}

export async function enrichPointsLogRows<T extends LogLike>(
  logs: T[],
): Promise<Array<T & PointsLogSource>> {
  const sources = await resolvePointsLogSources(logs);
  return logs.map(log => ({
    ...log,
    ...(sources.get(log.id) || {
      sourceKind: null,
      sourceId: null,
      sourceTitle: null,
      sourceDescription: null,
      answerPreview: null,
      track: pointsTrackForAction(log.actionType || ''),
    }),
  }));
}

/** Keep import of pointsLog type-friendly for callers. */
export type PointsLogRow = typeof pointsLog.$inferSelect;
