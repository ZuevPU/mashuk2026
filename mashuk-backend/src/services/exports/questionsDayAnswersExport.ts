import { and, asc, eq, ne } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { questions } from '../../db/schema.js';
import { questionMatchesDay } from '../questionAdminHelpers.js';
import { getReflectionTypeLabel } from '../reflectionTypeLabel.js';
import {
  addReadmeSheet,
  answerText,
  formatTs,
  fullName,
  type AnswerJoinRow,
} from './exportCommon.js';
import { queryAnswerJoinRows } from './answerJoinQuery.js';
import {
  isAfterBlocksQuestion,
  parseAfterBlocksPicks,
  type AfterBlocksPick,
} from './nestedPickParse.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type QuestionsDayExportFilters = {
  day: number;
  shiftId?: number | null;
  direction?: string | null;
  group?: string | null;
  /** When set, only this questionKind (e.g. after_blocks). */
  questionKind?: string | null;
};

type FlatAnswerRow = {
  source: AnswerJoinRow;
  pick: AfterBlocksPick | null;
  answerText: string;
};

function displayAnswer(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (Array.isArray(data)) {
    return data.map(v => (typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v))).join('; ');
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
    if (typeof o.reason === 'string' && o.reason.trim()) return o.reason.trim();
    if (typeof o.answer === 'string' && o.answer.trim()) return o.answer.trim();
    if (typeof o.value === 'string' || typeof o.value === 'number') return String(o.value);
    if (Array.isArray(o.values)) return o.values.map(String).join('; ');
    if (Array.isArray(o.selected)) return o.selected.map(String).join('; ');
  }
  return answerText(data);
}

function flattenAnswerRows(answerRows: AnswerJoinRow[]): FlatAnswerRow[] {
  const out: FlatAnswerRow[] = [];
  for (const r of answerRows) {
    if (isAfterBlocksQuestion(r.q)) {
      const picks = parseAfterBlocksPicks(r.a.answerData);
      if (picks.length === 0) {
        out.push({ source: r, pick: null, answerText: displayAnswer(r.a.answerData) });
        continue;
      }
      for (const pick of picks) {
        out.push({ source: r, pick, answerText: pick.text });
      }
      continue;
    }
    out.push({ source: r, pick: null, answerText: displayAnswer(r.a.answerData) });
  }
  return out;
}

function safeSheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/[\\/*?:\[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Лист';
  base = base.slice(0, 31);
  let name = base;
  let i = 2;
  while (used.has(name)) {
    const suffix = `~${i++}`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
  }
  used.add(name);
  return name;
}

const MAIN_HEADERS = [
  'ID ответа',
  'ID участника',
  'ФИО',
  'Направление',
  'Группа',
  'День',
  'ID вопроса',
  'Вопрос',
  'Тип вопроса',
  'ID события',
  'Событие / тема',
  'ID подтемы',
  'Подтема',
  'Путь',
  'Ответ / осмысление',
  'Время',
] as const;

function writeFlatRow(
  ws: { addRow: (values: unknown[]) => unknown },
  flat: FlatAnswerRow,
  day: number,
): void {
  const r = flat.source;
  const pick = flat.pick;
  const parent = (pick?.parentEventTitle || '').trim();
  const topic = (pick?.eventTitle || '').trim();
  const path = pick?.pathLabel || '';
  const parentCol = parent || (topic && !pick?.parentEventId ? topic : '');
  const topicCol = parent && topic && parent !== topic ? topic : (parent ? '' : topic);

  ws.addRow([
    r.a.id,
    r.p?.id ?? r.a.participantId,
    fullName(r.p),
    r.p?.direction ?? '',
    r.p?.groupName ?? '',
    r.q?.dayNumber ?? day,
    r.q?.id ?? '',
    r.q?.title || r.q?.text || '',
    r.q ? (getReflectionTypeLabel(r.q) || r.q.questionKind || '') : '',
    pick?.parentEventId ?? '',
    parentCol,
    pick?.eventId ?? '',
    topicCol,
    path,
    flat.answerText,
    formatTs(r.a.createdAt),
  ]);
}

/**
 * Выгрузка ответов на вопросы за день:
 * — «Все ответы» (после блоков: 1 строка = выбранная подтема),
 * — «После блоков» (только осмысления с темой/подтемой),
 * — «По направлениям», «Сводка вопросов»,
 * — отдельный лист на каждый вопрос.
 */
export async function writeQuestionsDayAnswersExport(
  res: Response,
  filters: QuestionsDayExportFilters,
): Promise<void> {
  const day = filters.day;
  const shiftId = filters.shiftId ?? null;
  const direction = filters.direction?.trim() || null;
  const group = filters.group?.trim() || null;
  const questionKind = filters.questionKind?.trim() || null;

  const qConds = [
    ne(questions.status, 'archived'),
  ];
  if (shiftId != null && !Number.isNaN(shiftId)) {
    qConds.push(eq(questions.shiftId, shiftId));
  }
  if (questionKind) {
    qConds.push(eq(questions.questionKind, questionKind));
  }

  const catalog = await db.select().from(questions)
    .where(and(...qConds))
    .orderBy(asc(questions.id));
  const dayQuestions = catalog.filter(q => questionMatchesDay(q, day));

  const qIds = dayQuestions.map(q => q.id);
  const answerRows = qIds.length
    ? await queryAnswerJoinRows({
      day,
      questionIds: qIds,
      publishedOnly: false,
      shiftId: shiftId ?? undefined,
      direction: direction ?? undefined,
      group: group ?? undefined,
      touchpoint: 'all',
    })
    : [];

  answerRows.sort((a, b) => {
    const qd = (a.q?.id ?? 0) - (b.q?.id ?? 0);
    if (qd !== 0) return qd;
    const nameCmp = fullName(a.p).localeCompare(fullName(b.p), 'ru');
    if (nameCmp !== 0) return nameCmp;
    return (a.a.id ?? 0) - (b.a.id ?? 0);
  });

  const flatRows = flattenAnswerRows(answerRows);
  const afterBlocksFlat = flatRows.filter(f => isAfterBlocksQuestion(f.source.q));
  const extraFlat = flatRows.filter(f => f.source.q?.questionKind === 'extra');

  const byQuestion = new Map<number, FlatAnswerRow[]>();
  for (const q of dayQuestions) byQuestion.set(q.id, []);
  for (const flat of flatRows) {
    const qid = flat.source.q?.id;
    if (qid == null) continue;
    if (!byQuestion.has(qid)) byQuestion.set(qid, []);
    byQuestion.get(qid)!.push(flat);
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    `Выгрузка ответов на вопросы за день ${day}.`,
    'Лист «Все ответы»: кто на какой вопрос ответил. Для «После блоков» — отдельные колонки темы/подтемы; если выбрано несколько подтем, несколько строк с одним ID ответа.',
    'Лист «После блоков»: только осмысления после блоков (событие → подтема → текст).',
    'Лист «Дополнительные»: вопросы типа «Дополнительные» (не после блоков).',
    'Лист «По направлениям»: сколько ответов и участников по направлению × вопросу.',
    'Лист «Сводка вопросов»: охват по каждому вопросу.',
    'Далее — отдельный лист на каждый вопрос.',
    `Вопросов: ${dayQuestions.length}.`,
    `Исходных ответов: ${answerRows.length}.`,
    `Строк после раскрытия подтем: ${flatRows.length}.`,
    `Участников с ответом: ${new Set(answerRows.map(r => r.a.participantId)).size}.`,
    shiftId != null ? `Смена (shiftId): ${shiftId}.` : '',
    direction ? `Фильтр направления: ${direction}.` : 'Направления: все.',
    group ? `Фильтр группы: ${group}.` : '',
    questionKind ? `Тип вопроса: ${questionKind}.` : 'Типы вопросов: все (кроме архива).',
  ].filter(Boolean));

  const wsAll = wb.addWorksheet('Все ответы');
  wsAll.addRow([...MAIN_HEADERS]);
  for (const flat of flatRows) writeFlatRow(wsAll, flat, day);

  const wsAfter = wb.addWorksheet('После блоков');
  wsAfter.addRow([...MAIN_HEADERS]);
  for (const flat of afterBlocksFlat) writeFlatRow(wsAfter, flat, day);

  const wsExtra = wb.addWorksheet('Дополнительные');
  wsExtra.addRow([...MAIN_HEADERS]);
  for (const flat of extraFlat) writeFlatRow(wsExtra, flat, day);

  const wsDir = wb.addWorksheet('По направлениям');
  wsDir.addRow([
    'Направление',
    'ID вопроса',
    'Вопрос',
    'Ответов (исходных)',
    'Строк (с подтемами)',
    'Участников',
  ]);
  const dirAgg = new Map<string, {
    qid: number;
    title: string;
    nAnswers: number;
    nRows: number;
    pids: Set<number>;
  }>();
  for (const flat of flatRows) {
    const r = flat.source;
    const dir = (r.p?.direction || '—').trim() || '—';
    const qid = r.q?.id ?? 0;
    const title = r.q?.title || r.q?.text || `Вопрос #${qid}`;
    const key = `${dir}::${qid}`;
    if (!dirAgg.has(key)) {
      dirAgg.set(key, { qid, title, nAnswers: 0, nRows: 0, pids: new Set() });
    }
    const row = dirAgg.get(key)!;
    row.nRows += 1;
    row.pids.add(r.a.participantId);
  }
  // count unique answer ids per dir×question
  const answerKeys = new Set<string>();
  for (const flat of flatRows) {
    const dir = (flat.source.p?.direction || '—').trim() || '—';
    const qid = flat.source.q?.id ?? 0;
    const key = `${dir}::${qid}::${flat.source.a.id}`;
    if (answerKeys.has(key)) continue;
    answerKeys.add(key);
    const aggKey = `${dir}::${qid}`;
    const row = dirAgg.get(aggKey);
    if (row) row.nAnswers += 1;
  }
  const dirRows = [...dirAgg.entries()]
    .map(([key, v]) => ({
      direction: key.slice(0, key.lastIndexOf('::')),
      qid: v.qid,
      title: v.title,
      nAnswers: v.nAnswers,
      nRows: v.nRows,
      participants: v.pids.size,
    }))
    .sort((a, b) => a.direction.localeCompare(b.direction, 'ru') || a.qid - b.qid);
  for (const r of dirRows) {
    wsDir.addRow([r.direction, r.qid, r.title, r.nAnswers, r.nRows, r.participants]);
  }

  const wsSummary = wb.addWorksheet('Сводка вопросов');
  wsSummary.addRow([
    'ID вопроса',
    'Вопрос',
    'Тип',
    'Статус',
    'Ответов',
    'Строк (с подтемами)',
    'Участников',
  ]);
  for (const q of dayQuestions) {
    const list = byQuestion.get(q.id) ?? [];
    const pids = new Set(list.map(f => f.source.a.participantId));
    const answerIds = new Set(list.map(f => f.source.a.id));
    wsSummary.addRow([
      q.id,
      q.title || q.text || `Вопрос #${q.id}`,
      getReflectionTypeLabel(q) || q.questionKind || '',
      q.status || '',
      answerIds.size,
      list.length,
      pids.size,
    ]);
  }

  const usedNames = new Set<string>([
    'Описание', 'Все ответы', 'После блоков', 'Дополнительные', 'По направлениям', 'Сводка вопросов',
  ]);
  for (const q of dayQuestions) {
    const label = (q.title || q.text || `Вопрос ${q.id}`).trim();
    const sheetName = safeSheetName(`Q${q.id} ${label}`, usedNames);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(['Вопрос', label]);
    ws.addRow(['ID вопроса', q.id]);
    ws.addRow(['Тип', getReflectionTypeLabel(q) || q.questionKind || '']);
    ws.addRow([]);
    const after = isAfterBlocksQuestion(q);
    if (after) {
      ws.addRow([
        'ID участника',
        'ФИО',
        'Направление',
        'Группа',
        'ID события',
        'Событие / тема',
        'ID подтемы',
        'Подтема',
        'Путь',
        'Осмысление',
        'Время',
        'ID ответа',
      ]);
    } else {
      ws.addRow([
        'ID участника',
        'ФИО',
        'Направление',
        'Группа',
        'Ответ',
        'Время',
        'ID ответа',
      ]);
    }
    const list = byQuestion.get(q.id) ?? [];
    for (const flat of list) {
      const r = flat.source;
      if (after) {
        const pick = flat.pick;
        const parent = (pick?.parentEventTitle || '').trim();
        const topic = (pick?.eventTitle || '').trim();
        ws.addRow([
          r.p?.id ?? r.a.participantId,
          fullName(r.p),
          r.p?.direction ?? '',
          r.p?.groupName ?? '',
          pick?.parentEventId ?? '',
          parent || (topic && !pick?.parentEventId ? topic : ''),
          pick?.eventId ?? '',
          parent && topic && parent !== topic ? topic : (parent ? '' : topic),
          pick?.pathLabel || '',
          flat.answerText,
          formatTs(r.a.createdAt),
          r.a.id,
        ]);
      } else {
        ws.addRow([
          r.p?.id ?? r.a.participantId,
          fullName(r.p),
          r.p?.direction ?? '',
          r.p?.groupName ?? '',
          flat.answerText,
          formatTs(r.a.createdAt),
          r.a.id,
        ]);
      }
    }
  }

  const fileStem = questionKind === 'after_blocks'
    ? `after_blocks_day${day}`
    : `questions_day${day}`;
  await sendWorkbook(res, wb, `${fileStem}.xlsx`);
}
