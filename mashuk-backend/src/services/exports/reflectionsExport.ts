import { and, eq, isNull } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { answers, participants, piggybank, questions } from '../../db/schema.js';
import { inferReflectionDepth } from '../reflectionDepth.js';
import { isPublishedStatus } from '../publishStatus.js';
import {
  ANSWER_ROW_HEADERS_RU, addReadmeSheet, answerText, buildAnswerRow, fullName,

} from './exportCommon.js';
import { queryAnswerJoinRows } from './answerJoinQuery.js';
import { touchpointTypeForQuestion } from './touchpointFilter.js';
import { createWorkbook, sendWorkbook, sendCsv } from './workbook.js';

export async function loadReflectionRows(filters: {
  shiftId?: number;
  day?: number;
  direction?: string;
  group?: string;
} = {}) {
  return queryAnswerJoinRows({
    shiftId: filters.shiftId,
    day: filters.day,
    direction: filters.direction,
    group: filters.group,
    publishedOnly: true,
    touchpoint: 'all',
  });
}

export async function writeReflectionsExport(
  res: Response,
  format: string,
  filters: {
    shiftId?: number;
    day?: number;
    direction?: string;
    group?: string;
  } = {},
): Promise<void> {
  const rows = await loadReflectionRows(filters);
  const extraHeadersRu = ['ID вопроса', 'Тип точки', 'Блок', 'Слов', 'Глубина'];

  if (format === 'xlsx') {
    const wb = await createWorkbook();
    addReadmeSheet(wb, ['Сквозная выгрузка текстовых ответов рефлексии за смену.']);
    const ws = wb.addWorksheet('Рефлексия');
    ws.addRow([...ANSWER_ROW_HEADERS_RU, ...extraHeadersRu]);
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
    [...ANSWER_ROW_HEADERS_RU, ...extraHeadersRu].join(','),
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
    const {
      collectEveningExportRows,
      formatEveningFieldValue,
    } = await import('./eveningExportData.js');
    const evening = await collectEveningExportRows({
      shiftId: p.shiftId,
      participantId,
    });
    const eveningRows = evening.rows;

    const { roleLabel } = await import('./exportLabels.js');
    const { entryTags } = await import('../piggybankDict.js');
    const piggyRows = await db.select().from(piggybank).where(and(
      eq(piggybank.participantId, participantId),
      isNull(piggybank.deletedAt),
    ));

    const wb = await createWorkbook();
    const sheetProfile = wb.addWorksheet('Профиль');
    sheetProfile.addRow(['Поле', 'Значение']);
    for (const [k, v] of [
      ['ID', p.id],
      ['ФИО', fullName(p)],
      ['Направление', p.direction || ''],
      ['Группа', p.groupName || ''],
      ['Регион', p.region || ''],
      ['Место работы', p.workplace || ''],
      ['Должность', p.position || ''],
      ['Стартовая роль', roleLabel(p.strongRole) || p.strongRole || ''],
      ['Роль роста', roleLabel(p.growthRole) || p.growthRole || ''],
      ['Путь', p.pathPoints ?? 0],
      ['Опыт', p.experiencePoints ?? 0],
    ] as Array<[string, string | number]>) {
      sheetProfile.addRow([k, v]);
    }

    const ws = wb.addWorksheet('Ответы');
    ws.addRow([...ANSWER_ROW_HEADERS_RU, 'ID вопроса']);
    for (const r of rows) {
      ws.addRow([...buildAnswerRow(r, { source: 'question' }), r.q?.id]);
    }
    const sheetEve = wb.addWorksheet('Итоговая анкета');
    sheetEve.addRow([
      'День', 'Время заполнения', 'Роль на завтра',
      ...evening.fields.map(f => f.label || f.key),
    ]);
    for (const r of eveningRows) {
      sheetEve.addRow([
        r.dayNumber,
        r.filledAt?.toISOString?.() ?? '',
        r.tomorrowRoleKey ?? '',
        ...evening.fields.map(f => formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey)),
      ]);
    }
    const sheetPiggy = wb.addWorksheet('Копилка');
    sheetPiggy.addRow(['День', 'Источник', 'Теги', 'Текст', 'Создано']);
    for (const row of piggyRows) {
      sheetPiggy.addRow([
        row.forumDay ?? '',
        row.source || '',
        entryTags(row).join(', '),
        row.text || '',
        row.createdAt?.toISOString?.() ?? '',
      ]);
    }
    await sendWorkbook(res, wb, `${fname}.xlsx`);
    return;
  }

  sendCsv(
    res,
    `${fname}.csv`,
    [...ANSWER_ROW_HEADERS_RU, 'ID вопроса'].join(','),
    rows.map(r => [...buildAnswerRow(r, { source: 'question' }).map(String), String(r.q?.id ?? '')]),
  );
}
