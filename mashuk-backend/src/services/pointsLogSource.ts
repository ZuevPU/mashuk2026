import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, pointsLog, questions, taskSubmissions, tasks } from '../db/schema.js';

export type PointsLogSource = {
  sourceKind: 'task' | 'question' | null;
  sourceId: number | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
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

type LogLike = {
  id: number;
  submissionId?: number | null;
};

/**
 * Resolve human-readable task/question source for points_log rows.
 * Links via submissionId and via answers.points_log_id.
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
      });
    }
  }

  // Fallback / questions: answers that store points_log_id
  const answerRows = await db.select({
    pointsLogId: answers.pointsLogId,
    questionId: questions.id,
    title: questions.title,
    text: questions.text,
    subtitle: questions.subtitle,
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
    const desc = [row.subtitle, row.text].filter(Boolean).join('\n').trim();
    out.set(row.pointsLogId, {
      sourceKind: 'question',
      sourceId: row.questionId ?? null,
      sourceTitle: row.title || null,
      sourceDescription: desc || null,
    });
  }

  // Submissions that reference log via points_log_id (older rows without log.submissionId)
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
      });
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
    }),
  }));
}

/** Keep import of pointsLog type-friendly for callers. */
export type PointsLogRow = typeof pointsLog.$inferSelect;
