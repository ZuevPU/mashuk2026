import { and, asc, eq, ne } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { questions } from '../../db/schema.js';
import { getReflectionTypeLabel } from '../reflectionTypeLabel.js';
import {
  addReadmeSheet,
  answerText,
  formatTs,
  fullName,
  type AnswerJoinRow,
} from './exportCommon.js';
import { queryAnswerJoinRows } from './answerJoinQuery.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type QuestionsDayExportFilters = {
  day: number;
  shiftId?: number | null;
  direction?: string | null;
  group?: string | null;
  /** When set, only this questionKind (e.g. after_blocks). */
  questionKind?: string | null;
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

/**
 * Выгрузка ответов на вопросы за день:
 * — «Все ответы» (1 строка = ответ),
 * — «По направлениям» (сводка),
 * — отдельный лист на каждый вопрос (участник · направление · ответ).
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
    eq(questions.dayNumber, day),
    ne(questions.status, 'archived'),
  ];
  if (shiftId != null && !Number.isNaN(shiftId)) {
    qConds.push(eq(questions.shiftId, shiftId));
  }
  if (questionKind) {
    qConds.push(eq(questions.questionKind, questionKind));
  }

  const dayQuestions = await db.select().from(questions)
    .where(and(...qConds))
    .orderBy(asc(questions.id));

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

  const byQuestion = new Map<number, AnswerJoinRow[]>();
  for (const q of dayQuestions) byQuestion.set(q.id, []);
  for (const r of answerRows) {
    const qid = r.q?.id;
    if (qid == null) continue;
    if (!byQuestion.has(qid)) byQuestion.set(qid, []);
    byQuestion.get(qid)!.push(r);
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    `Выгрузка ответов на вопросы за день ${day}.`,
    'Лист «Все ответы»: один список — кто на какой вопрос ответил.',
    'Лист «По направлениям»: сколько ответов и участников по направлению × вопросу.',
    'Лист «Сводка вопросов»: охват по каждому вопросу.',
    'Далее — отдельный лист на каждый вопрос: участник, направление, ответ.',
    `Вопросов: ${dayQuestions.length}.`,
    `Ответов: ${answerRows.length}.`,
    `Участников с ответом: ${new Set(answerRows.map(r => r.a.participantId)).size}.`,
    shiftId != null ? `Смена (shiftId): ${shiftId}.` : '',
    direction ? `Фильтр направления: ${direction}.` : 'Направления: все.',
    group ? `Фильтр группы: ${group}.` : '',
    questionKind ? `Тип вопроса: ${questionKind}.` : 'Типы вопросов: все (кроме архива).',
  ].filter(Boolean));

  const wsAll = wb.addWorksheet('Все ответы');
  wsAll.addRow([
    'ID ответа',
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'День',
    'ID вопроса',
    'Вопрос',
    'Тип вопроса',
    'Ответ',
    'Время',
  ]);
  for (const r of answerRows) {
    wsAll.addRow([
      r.a.id,
      r.p?.id ?? r.a.participantId,
      fullName(r.p),
      r.p?.direction ?? '',
      r.p?.groupName ?? '',
      r.q?.dayNumber ?? day,
      r.q?.id ?? '',
      r.q?.title || r.q?.text || '',
      r.q ? (getReflectionTypeLabel(r.q) || r.q.questionKind || '') : '',
      displayAnswer(r.a.answerData),
      formatTs(r.a.createdAt),
    ]);
  }

  const wsDir = wb.addWorksheet('По направлениям');
  wsDir.addRow([
    'Направление',
    'ID вопроса',
    'Вопрос',
    'Ответов',
    'Участников',
  ]);
  const dirAgg = new Map<string, { qid: number; title: string; n: number; pids: Set<number> }>();
  for (const r of answerRows) {
    const dir = (r.p?.direction || '—').trim() || '—';
    const qid = r.q?.id ?? 0;
    const title = r.q?.title || r.q?.text || `Вопрос #${qid}`;
    const key = `${dir}::${qid}`;
    if (!dirAgg.has(key)) dirAgg.set(key, { qid, title, n: 0, pids: new Set() });
    const row = dirAgg.get(key)!;
    row.n += 1;
    row.pids.add(r.a.participantId);
  }
  const dirRows = [...dirAgg.entries()]
    .map(([key, v]) => ({
      direction: key.slice(0, key.lastIndexOf('::')),
      qid: v.qid,
      title: v.title,
      n: v.n,
      participants: v.pids.size,
    }))
    .sort((a, b) => a.direction.localeCompare(b.direction, 'ru') || a.qid - b.qid);
  for (const r of dirRows) {
    wsDir.addRow([r.direction, r.qid, r.title, r.n, r.participants]);
  }

  const wsSummary = wb.addWorksheet('Сводка вопросов');
  wsSummary.addRow([
    'ID вопроса',
    'Вопрос',
    'Тип',
    'Статус',
    'Ответов',
    'Участников',
  ]);
  for (const q of dayQuestions) {
    const list = byQuestion.get(q.id) ?? [];
    const pids = new Set(list.map(r => r.a.participantId));
    wsSummary.addRow([
      q.id,
      q.title || q.text || `Вопрос #${q.id}`,
      getReflectionTypeLabel(q) || q.questionKind || '',
      q.status || '',
      list.length,
      pids.size,
    ]);
  }

  const usedNames = new Set<string>(['Описание', 'Все ответы', 'По направлениям', 'Сводка вопросов']);
  for (const q of dayQuestions) {
    const label = (q.title || q.text || `Вопрос ${q.id}`).trim();
    const sheetName = safeSheetName(`Q${q.id} ${label}`, usedNames);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(['Вопрос', label]);
    ws.addRow(['ID вопроса', q.id]);
    ws.addRow([]);
    ws.addRow([
      'ID участника',
      'ФИО',
      'Направление',
      'Группа',
      'Ответ',
      'Время',
      'ID ответа',
    ]);
    const list = byQuestion.get(q.id) ?? [];
    for (const r of list) {
      ws.addRow([
        r.p?.id ?? r.a.participantId,
        fullName(r.p),
        r.p?.direction ?? '',
        r.p?.groupName ?? '',
        displayAnswer(r.a.answerData),
        formatTs(r.a.createdAt),
        r.a.id,
      ]);
    }
  }

  await sendWorkbook(res, wb, `questions_day${day}.xlsx`);
}
