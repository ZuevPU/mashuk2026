import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { answers, participants, questions } from '../../db/schema.js';
import { inferReflectionDepth } from '../reflectionDepth.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  ANSWER_ROW_HEADERS, addReadmeSheet, answerText, buildAnswerRow, fullName,
} from './exportCommon.js';
import { touchpointTypeForQuestion } from './touchpointFilter.js';
import { createWorkbook, sendWorkbook, sendCsv } from './workbook.js';

export async function loadReflectionRows() {
  const rows = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id));
  return rows.filter(r => r.q && isPublishedStatus(r.q.status));
}

export async function writeReflectionsExport(res: Response, format: string): Promise<void> {
  const rows = await loadReflectionRows();
  const extraHeaders = ['question_id', 'touchpoint_type', 'block_id', 'word_count', 'depth_orientir'];

  if (format === 'xlsx') {
    const wb = await createWorkbook();
    addReadmeSheet(wb, ['Сквозная выгрузка текстовых ответов рефлексии за смену.']);
    const ws = wb.addWorksheet('Рефлексия');
    ws.addRow([...ANSWER_ROW_HEADERS, ...extraHeaders]);
    for (const r of rows) {
      const text = answerText(r.a.answerData);
      ws.addRow([
        ...buildAnswerRow(r, { source: 'question' }),
        r.q?.id, r.q ? touchpointTypeForQuestion(r.q) : '', r.q?.block ?? '',
        r.a.wordCount ?? '', inferReflectionDepth(text) || '',
      ]);
    }
    await sendWorkbook(res, wb, 'reflections.xlsx');
    return;
  }

  sendCsv(
    res,
    'reflections.csv',
    [...ANSWER_ROW_HEADERS, ...extraHeaders].join(','),
    rows.map(r => {
      const text = answerText(r.a.answerData);
      return [
        ...buildAnswerRow(r, { source: 'question' }).map(String),
        String(r.q?.id ?? ''), r.q ? touchpointTypeForQuestion(r.q) : '', r.q?.block ?? '',
        String(r.a.wordCount ?? ''), inferReflectionDepth(text) || '',
      ];
    }),
  );
}

export async function loadParticipantAnswerRows(participantId: number, textOnly: boolean) {
  const rows = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id))
    .where(eq(answers.participantId, participantId));
  let filtered = rows.filter(r => r.q && isPublishedStatus(r.q.status));
  if (textOnly) {
    filtered = filtered.filter(r => {
      const at = (r.q?.answerType || '').toLowerCase();
      return !at || at.includes('text') || at === 'free_text';
    });
  }
  return filtered.sort((a, b) => {
    const da = a.a.createdAt?.getTime() ?? 0;
    const db_ = b.a.createdAt?.getTime() ?? 0;
    return da - db_;
  });
}

export async function writeParticipantAnswersExport(
  res: Response,
  participantId: number,
  textOnly: boolean,
  format: string,
): Promise<void> {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const rows = await loadParticipantAnswerRows(participantId, textOnly);
  const fname = `participant_${participantId}_answers`;

  if (format === 'xlsx') {
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Ответы');
    ws.addRow([...ANSWER_ROW_HEADERS, 'question_id']);
    for (const r of rows) {
      ws.addRow([...buildAnswerRow(r, { source: 'question' }), r.q?.id]);
    }
    await sendWorkbook(res, wb, `${fname}.xlsx`);
    return;
  }

  sendCsv(
    res,
    `${fname}.csv`,
    [...ANSWER_ROW_HEADERS, 'question_id'].join(','),
    rows.map(r => [...buildAnswerRow(r, { source: 'question' }).map(String), String(r.q?.id ?? '')]),
  );
}
