import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, eventAttendance, events, exchangeAnswers, exchangeQuestions, piggybank,
  pointsLog, questions, taskSubmissions, tasks,
} from '../db/schema.js';
import { participantAnswerSummary } from './participantAnswerFormat.js';
import { pointsTrackForAction, type PointTrack } from './pointsService.js';

export type PointsLogSource = {
  sourceKind: 'task' | 'question' | 'exchange_question' | 'exchange_answer' | 'piggybank' | 'attendance' | null;
  sourceId: number | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  answerPreview: string | null;
  track: PointTrack | 'bonus';
  awardReason?: string | null;
  isReflectionBonus?: boolean;
};

export const REFLECTION_BONUS_REASON =
  'Бонус за развёрнутый ответ (личный вывод или перенос в практику). Это не отдельный вопрос, а надбавка к той же проверке состояния.';

const QUESTION_ACTIONS = new Set([
  'question_answer',
  'state_check_morning',
  'state_check_day',
  'state_check_evening',
  'point_b_complete',
]);

const PIGGY_ACTIONS = new Set([
  'piggybank_idea',
  'piggybank_thought',
  'piggybank_question',
  'piggybank_entry',
]);

function actionBase(actionType: string | null | undefined): string {
  return (actionType || '').replace(/_revoke$/i, '');
}

function formatPiggyTags(tags: unknown, tag: string | null | undefined): string {
  const list = Array.isArray(tags)
    ? tags.map(t => String(t).trim()).filter(Boolean)
    : [];
  if (!list.length && tag) list.push(tag);
  return list.join(', ');
}

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
  points?: number | null;
  relatedLogId?: number | null;
};

function emptySource(actionType: string | null | undefined): PointsLogSource {
  return {
    sourceKind: null,
    sourceId: null,
    sourceTitle: null,
    sourceDescription: null,
    answerPreview: null,
    track: pointsTrackForAction(actionType || ''),
    awardReason: null,
    isReflectionBonus: false,
  };
}

export function isReflectionBonusLog(log: { actionType?: string | null; points?: number | null }): boolean {
  return actionBase(log.actionType) === 'question_answer' && Number(log.points) === 3;
}

/** Attach +3 depth-bonus rows to the same question as the primary award. */
export function attachReflectionBonusSources(
  logs: LogLike[],
  sources: Map<number, PointsLogSource>,
): void {
  const WINDOW_MS = 15_000;
  for (const log of logs) {
    if (!isReflectionBonusLog(log)) continue;
    const current = sources.get(log.id);

    let parent = log.relatedLogId != null ? sources.get(log.relatedLogId) : undefined;
    if (!parent?.sourceKind) {
      const at = ts(log.createdAt);
      const pid = log.participantId;
      let best: PointsLogSource | undefined;
      let bestDelta = Infinity;
      for (const other of logs) {
        if (other.id === log.id) continue;
        if (isReflectionBonusLog(other)) continue;
        if (pid != null && other.participantId != null && other.participantId !== pid) continue;
        const src = sources.get(other.id);
        if (src?.sourceKind !== 'question') continue;
        const delta = Math.abs(ts(other.createdAt) - at);
        if (delta > WINDOW_MS) continue;
        if (delta < bestDelta) {
          best = src;
          bestDelta = delta;
        }
      }
      parent = best;
    }
    const src = parent?.sourceKind ? parent : current;
    if (!src?.sourceKind) continue;
    sources.set(log.id, {
      ...src,
      track: pointsTrackForAction(log.actionType || 'question_answer'),
      awardReason: REFLECTION_BONUS_REASON,
      isReflectionBonus: true,
    });
  }
}

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
    out.set(log.id, emptySource(log.actionType));
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
    questionType: questions.type,
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
    const preview = participantAnswerSummary(row.answerData, row.questionType);
    out.set(row.pointsLogId, {
      sourceKind: 'question',
      sourceId: row.questionId ?? null,
      sourceTitle: row.title || null,
      sourceDescription: desc || null,
      answerPreview: preview ? clip(preview, 400) : null,
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

  // Piggybank via points_log_id, then nearest createdAt for leftover piggy actions.
  const unresolvedIds = () => logs.filter(l => !out.get(l.id)?.sourceKind).map(l => l.id);
  const piggyLogIds = unresolvedIds();
  if (piggyLogIds.length) {
    const piggyRows = await db.select({
      id: piggybank.id,
      pointsLogId: piggybank.pointsLogId,
      text: piggybank.text,
      tag: piggybank.tag,
      tags: piggybank.tags,
      source: piggybank.source,
      forumDay: piggybank.forumDay,
      participantId: piggybank.participantId,
      createdAt: piggybank.createdAt,
    }).from(piggybank).where(and(
      inArray(piggybank.pointsLogId, piggyLogIds),
      isNotNull(piggybank.pointsLogId),
    ));

    for (const row of piggyRows) {
      if (row.pointsLogId == null) continue;
      const tags = formatPiggyTags(row.tags, row.tag);
      const meta = [
        row.forumDay != null ? `День ${row.forumDay}` : null,
        tags ? `Теги: ${tags}` : null,
        row.source ? `Источник: ${row.source}` : null,
      ].filter(Boolean).join(' · ');
      out.set(row.pointsLogId, {
        sourceKind: 'piggybank',
        sourceId: row.id,
        sourceTitle: tags ? `Копилка · ${tags}` : 'Копилка',
        sourceDescription: meta || null,
        answerPreview: row.text ? clip(row.text, 400) : null,
        track: pointsTrackForAction(
          logs.find(l => l.id === row.pointsLogId)?.actionType || 'piggybank_entry',
        ),
      });
    }
  }

  const piggyFallbackLogs = logs.filter(l =>
    PIGGY_ACTIONS.has(actionBase(l.actionType)) && !out.get(l.id)?.sourceKind,
  );
  if (piggyFallbackLogs.length) {
    const participantIds = [...new Set(
      piggyFallbackLogs.map(l => l.participantId).filter((id): id is number => id != null && id > 0),
    )];
    if (participantIds.length) {
      const piggyPool = await db.select({
        id: piggybank.id,
        text: piggybank.text,
        tag: piggybank.tag,
        tags: piggybank.tags,
        source: piggybank.source,
        forumDay: piggybank.forumDay,
        participantId: piggybank.participantId,
        createdAt: piggybank.createdAt,
        pointsLogId: piggybank.pointsLogId,
      }).from(piggybank).where(inArray(piggybank.participantId, participantIds));

      const usedPiggy = new Set<number>();
      const WINDOW_MS = 15 * 60 * 1000;
      for (const log of piggyFallbackLogs) {
        const pid = log.participantId;
        if (pid == null) continue;
        const at = ts(log.createdAt);
        let best: (typeof piggyPool)[number] | null = null;
        let bestDelta = Infinity;
        for (const row of piggyPool) {
          if (row.participantId !== pid || usedPiggy.has(row.id)) continue;
          if (row.pointsLogId != null && row.pointsLogId !== log.id) continue;
          const delta = Math.abs(ts(row.createdAt) - at);
          if (delta > WINDOW_MS) continue;
          if (delta < bestDelta) {
            best = row;
            bestDelta = delta;
          }
        }
        if (!best) continue;
        usedPiggy.add(best.id);
        const tags = formatPiggyTags(best.tags, best.tag);
        const meta = [
          best.forumDay != null ? `День ${best.forumDay}` : null,
          tags ? `Теги: ${tags}` : null,
          best.source ? `Источник: ${best.source}` : null,
        ].filter(Boolean).join(' · ');
        out.set(log.id, {
          sourceKind: 'piggybank',
          sourceId: best.id,
          sourceTitle: tags ? `Копилка · ${tags}` : 'Копилка',
          sourceDescription: meta || null,
          answerPreview: best.text ? clip(best.text, 400) : null,
          track: pointsTrackForAction(log.actionType || 'piggybank_entry'),
        });
      }
    }
  }

  // Attendance: nearest event check-in (±10 min).
  const attendanceLogs = logs.filter(l =>
    actionBase(l.actionType) === 'attendance' && !out.get(l.id)?.sourceKind,
  );
  if (attendanceLogs.length) {
    const participantIds = [...new Set(
      attendanceLogs.map(l => l.participantId).filter((id): id is number => id != null && id > 0),
    )];
    if (participantIds.length) {
      const attRows = await db.select({
        id: eventAttendance.id,
        participantId: eventAttendance.participantId,
        createdAt: eventAttendance.createdAt,
        eventId: events.id,
        eventTitle: events.title,
        eventDay: events.dayNumber,
      }).from(eventAttendance)
        .leftJoin(events, eq(eventAttendance.eventId, events.id))
        .where(inArray(eventAttendance.participantId, participantIds));

      const usedAtt = new Set<number>();
      const WINDOW_MS = 10 * 60 * 1000;
      for (const log of attendanceLogs) {
        const pid = log.participantId;
        if (pid == null) continue;
        const at = ts(log.createdAt);
        let best: (typeof attRows)[number] | null = null;
        let bestDelta = Infinity;
        for (const row of attRows) {
          if (row.participantId !== pid || usedAtt.has(row.id)) continue;
          const delta = Math.abs(ts(row.createdAt) - at);
          if (delta > WINDOW_MS) continue;
          if (delta < bestDelta) {
            best = row;
            bestDelta = delta;
          }
        }
        if (!best) continue;
        usedAtt.add(best.id);
        out.set(log.id, {
          sourceKind: 'attendance',
          sourceId: best.eventId ?? best.id,
          sourceTitle: best.eventTitle || `Событие #${best.eventId ?? best.id}`,
          sourceDescription: best.eventDay != null ? `День ${best.eventDay} · отметка присутствия` : 'Отметка присутствия',
          answerPreview: null,
          track: pointsTrackForAction(log.actionType || 'attendance'),
        });
      }
    }
  }

  // Exchange Q/A: no FK on points_log — match by participant + nearest createdAt (±3 min).
  const exchangeLogs = logs.filter(l => {
    const a = actionBase(l.actionType);
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

  // Primary awards without answers.points_log_id: nearest answer in a 15-minute window.
  const unresolvedQuestionLogs = logs.filter(l =>
    QUESTION_ACTIONS.has(actionBase(l.actionType)) && !out.get(l.id)?.sourceKind,
  );
  if (unresolvedQuestionLogs.length) {
    const participantIds = [...new Set(
      unresolvedQuestionLogs.map(l => l.participantId).filter((id): id is number => id != null && id > 0),
    )];
    if (participantIds.length) {
      const answerPool = await db.select({
        answerId: answers.id,
        participantId: answers.participantId,
        createdAt: answers.createdAt,
        pointsLogId: answers.pointsLogId,
        answerData: answers.answerData,
        questionId: questions.id,
        title: questions.title,
        text: questions.text,
        subtitle: questions.subtitle,
        dayNumber: questions.dayNumber,
        questionType: questions.type,
      }).from(answers)
        .leftJoin(questions, eq(answers.questionId, questions.id))
        .where(inArray(answers.participantId, participantIds));

      const usedAnswers = new Set<number>();
      const WINDOW_MS = 15 * 60 * 1000;
      for (const log of unresolvedQuestionLogs) {
        const pid = log.participantId;
        if (pid == null) continue;
        const at = ts(log.createdAt);
        let best: (typeof answerPool)[number] | null = null;
        let bestDelta = Infinity;
        for (const row of answerPool) {
          if (row.participantId !== pid || usedAnswers.has(row.answerId)) continue;
          if (row.pointsLogId != null && row.pointsLogId !== log.id) continue;
          const delta = Math.abs(ts(row.createdAt) - at);
          if (delta > WINDOW_MS) continue;
          if (delta < bestDelta) {
            best = row;
            bestDelta = delta;
          }
        }
        if (!best?.title && !best?.text) continue;
        usedAnswers.add(best.answerId);
        const desc = [
          best.dayNumber != null ? `День ${best.dayNumber}` : null,
          best.subtitle,
          best.text,
        ].filter(Boolean).join(' · ').trim();
        const preview = participantAnswerSummary(best.answerData, best.questionType);
        out.set(log.id, {
          sourceKind: 'question',
          sourceId: best.questionId ?? null,
          sourceTitle: best.title || null,
          sourceDescription: desc || null,
          answerPreview: preview ? clip(preview, 400) : null,
          track: pointsTrackForAction(log.actionType || 'question_answer'),
        });
      }
    }
  }

  attachReflectionBonusSources(logs, out);
  return out;
}

export async function enrichPointsLogRows<T extends LogLike>(
  logs: T[],
): Promise<Array<T & PointsLogSource>> {
  const sources = await resolvePointsLogSources(logs);
  return logs.map(log => ({
    ...log,
    ...(sources.get(log.id) || emptySource(log.actionType)),
  }));
}

/** Keep import of pointsLog type-friendly for callers. */
export type PointsLogRow = typeof pointsLog.$inferSelect;
