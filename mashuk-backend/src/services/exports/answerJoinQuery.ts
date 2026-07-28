import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { answers, participants, questions } from '../../db/schema.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  filterAnswersByTouchpoint,
  type AnswerJoinRow,
} from './exportCommon.js';
import {
  normalizeExportTouchpointFilter,
  type ExportTouchpointFilter,
} from './touchpointFilter.js';

export type AnswerJoinFilters = {
  day?: number | null;
  direction?: string;
  group?: string;
  participantId?: number;
  shiftId?: number | null;
  /** When set, only these question ids (e.g. published day questions). */
  questionIds?: number[];
  /** Apply after SQL; default 'all'. */
  touchpoint?: ExportTouchpointFilter | string;
  /** Require published question status (default true). */
  publishedOnly?: boolean;
};

/**
 * Load answer∩participant∩question with SQL filters for day/cohort/ids.
 * Touchpoint type stays in-memory (derived from question fields).
 */
export async function queryAnswerJoinRows(filters: AnswerJoinFilters = {}): Promise<AnswerJoinRow[]> {
  const conditions: SQL[] = [];

  if (filters.day != null && !Number.isNaN(filters.day)) {
    conditions.push(eq(questions.dayNumber, filters.day));
  }
  if (filters.direction?.trim()) {
    conditions.push(eq(participants.direction, filters.direction.trim()));
  }
  if (filters.group?.trim()) {
    conditions.push(eq(participants.groupName, filters.group.trim()));
  }
  if (filters.participantId != null && !Number.isNaN(filters.participantId)) {
    conditions.push(eq(answers.participantId, filters.participantId));
  }
  if (filters.shiftId != null && !Number.isNaN(filters.shiftId)) {
    conditions.push(eq(participants.shiftId, filters.shiftId));
  }
  if (filters.questionIds?.length) {
    conditions.push(inArray(answers.questionId, filters.questionIds));
  } else if (filters.questionIds && filters.questionIds.length === 0) {
    return [];
  }

  let q = db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .leftJoin(participants, eq(answers.participantId, participants.id));

  if (conditions.length) {
    q = q.where(and(...conditions)) as typeof q;
  }

  let rows = await q as AnswerJoinRow[];

  const publishedOnly = filters.publishedOnly !== false;
  if (publishedOnly) {
    rows = rows.filter(r => r.q && isPublishedStatus(r.q.status));
  }

  const tp = normalizeExportTouchpointFilter(
    typeof filters.touchpoint === 'string' ? filters.touchpoint : filters.touchpoint,
  );
  if (tp !== 'all') {
    rows = filterAnswersByTouchpoint(rows, tp);
  }

  return rows;
}
