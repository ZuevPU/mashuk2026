import type { Response } from 'express';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  programEventAvgScore,
  programEventPickCount,
  type EveningExportFilters,
} from './eveningExportData.js';
import { addReadmeSheet, formatTs, fullName } from './exportCommon.js';
import { parseProgramEventPicks } from './nestedPickParse.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type EveningSummaryExportFilters = EveningExportFilters;

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
 * Выгрузка итоговой анкеты вечера:
 * — «Все ответы»: 1 строка = участник, каждый вопрос — столбец (+ кол-во/средняя оценка для program_event);
 * — «Открытые уроки»: 1 строка = выбранная тема/подтема с оценкой 1–10;
 * — далее отдельный лист на каждый вопрос.
 */
export async function writeEveningSummaryExport(
  res: Response,
  filters: EveningSummaryExportFilters = {},
): Promise<void> {
  const { rows, fields, emptyReason, diagnostics } = await collectEveningExportRows(filters);
  const programEventFields = fields.filter(f => f.type === 'program_event');

  const metaHeaders = [
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'День',
    'Время заполнения',
    'Статус',
  ];

  const questionHeaders: string[] = [];
  for (const f of fields) {
    questionHeaders.push(f.label || f.key);
    if (f.type === 'program_event') {
      questionHeaders.push(`${f.label || f.key} · кол-во`);
      questionHeaders.push(`${f.label || f.key} · ср. оценка`);
    }
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка ответов на Итоговую анкету вечера (Форум).',
    'Лист «Все ответы»: полный список участников — каждый вопрос в отдельном столбце.',
    'Для полей выбора открытых уроков/практик рядом есть столбцы «кол-во» и «ср. оценка» (1–10).',
    'Лист «Открытые уроки»: 1 строка = одна выбранная тема/подтема с оценкой по 10-балльной шкале.',
    'Далее — отдельный лист на каждый вопрос: кто и как ответил.',
    'Лист «Диагностика»: счётчики, если строк мало или файл казался пустым.',
    `Участников с анкетой: ${rows.length}.`,
    `Вопросов (полей): ${fields.length}.`,
    `Полей выбора уроков/практик: ${programEventFields.length}.`,
    emptyReason || '',
    ...(diagnostics.notes || []),
    filters.day ? `Запрошен день: ${filters.day}.` : 'Фильтр дней: вся смена.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
    filters.shiftId != null ? `Смена админки #${filters.shiftId}.` : '',
  ].filter(Boolean));

  const wsAll = wb.addWorksheet('Все ответы');
  wsAll.addRow([...metaHeaders, ...questionHeaders]);

  for (const r of rows) {
    const values: Array<string | number> = [
      r.p.id,
      fullName(r.p),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      r.dayNumber,
      formatTs(r.filledAt),
      r.status,
    ];
    for (const f of fields) {
      values.push(formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey));
      if (f.type === 'program_event') {
        const raw = r.ratings[f.key];
        const count = programEventPickCount(raw);
        const avg = programEventAvgScore(raw);
        values.push(count || '');
        values.push(avg ?? '');
      }
    }
    wsAll.addRow(values);
  }

  // Detail sheet: one row per nested open-lesson / practice pick
  const wsPicks = wb.addWorksheet('Открытые уроки');
  wsPicks.addRow([
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'День',
    'Поле анкеты',
    'Ключ поля',
    'ID события',
    'Тема / блок',
    'ID подтемы',
    'Подтема',
    'Путь',
    'Оценка (1–10)',
    'Время',
    'Статус',
  ]);
  let pickRows = 0;
  for (const r of rows) {
    for (const field of programEventFields) {
      const picks = parseProgramEventPicks(r.ratings[field.key]);
      for (const pick of picks) {
        const parent = (pick.parentEventTitle || '').trim();
        const topic = (pick.eventTitle || '').trim();
        wsPicks.addRow([
          r.p.id,
          fullName(r.p),
          r.directionName ?? r.p.direction ?? '',
          r.p.groupName ?? '',
          r.dayNumber,
          field.label || field.key,
          field.key,
          pick.parentEventId ?? '',
          parent || (topic && !pick.parentEventId ? topic : ''),
          pick.eventId ?? '',
          parent && topic && parent !== topic ? topic : (parent ? '' : topic),
          pick.pathLabel || '',
          pick.score ?? '',
          formatTs(r.filledAt),
          r.status,
        ]);
        pickRows += 1;
      }
    }
  }
  if (pickRows === 0) {
    wsPicks.addRow([
      '',
      '',
      '',
      '',
      '',
      'Нет выбранных открытых уроков/практик с оценкой в этом срезе',
    ]);
  }

  const usedNames = new Set<string>(['Описание', 'Все ответы', 'Открытые уроки', 'Диагностика']);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const label = (field.label || field.key || `Вопрос ${i + 1}`).trim();
    const sheetName = safeSheetName(`Q${i + 1} ${label}`, usedNames);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(['Вопрос', label]);
    ws.addRow(['Ключ', field.key]);
    ws.addRow(['Тип', field.type]);
    ws.addRow([]);

    if (field.type === 'program_event') {
      ws.addRow([
        'ID участника',
        'ФИО',
        'Направление',
        'Группа',
        'День',
        'ID события',
        'Тема / блок',
        'ID подтемы',
        'Подтема',
        'Путь',
        'Оценка (1–10)',
        'Время',
        'Статус',
      ]);
      for (const r of rows) {
        const picks = parseProgramEventPicks(r.ratings[field.key]);
        if (!picks.length) continue;
        for (const pick of picks) {
          const parent = (pick.parentEventTitle || '').trim();
          const topic = (pick.eventTitle || '').trim();
          ws.addRow([
            r.p.id,
            fullName(r.p),
            r.directionName ?? r.p.direction ?? '',
            r.p.groupName ?? '',
            r.dayNumber,
            pick.parentEventId ?? '',
            parent || (topic && !pick.parentEventId ? topic : ''),
            pick.eventId ?? '',
            parent && topic && parent !== topic ? topic : (parent ? '' : topic),
            pick.pathLabel || '',
            pick.score ?? '',
            formatTs(r.filledAt),
            r.status,
          ]);
        }
      }
    } else {
      ws.addRow([
        'ID участника',
        'ФИО',
        'Направление',
        'Группа',
        'День',
        'Ответ',
        'Время',
        'Статус',
      ]);
      for (const r of rows) {
        const answer = formatEveningFieldValue(field, r.ratings, r.tomorrowRoleKey);
        if (answer === '' || answer == null) continue;
        ws.addRow([
          r.p.id,
          fullName(r.p),
          r.directionName ?? r.p.direction ?? '',
          r.p.groupName ?? '',
          r.dayNumber,
          answer,
          formatTs(r.filledAt),
          r.status,
        ]);
      }
    }
  }

  const diag = wb.addWorksheet('Диагностика');
  diag.addRow(['Параметр', 'Значение']);
  diag.addRow(['Всего participant_day_state (без удалённых)', diagnostics.totalDayStates]);
  diag.addRow(['С evening_ratings (сдано)', diagnostics.withRatings]);
  diag.addRow(['Только evening_draft (черновик)', diagnostics.withDraftOnly]);
  diag.addRow(['Answers по вопросам «Итоги дня»', diagnostics.answerRowsMatched]);
  diag.addRow(['После фильтра смены', diagnostics.afterShiftFilter]);
  diag.addRow(['После фильтра дня', diagnostics.afterDayFilter]);
  diag.addRow(['После фильтров направления/группы', diagnostics.afterCohortFilter]);
  diag.addRow(['Итого строк в файле', rows.length]);
  diag.addRow(['Строк на листе «Открытые уроки»', pickRows]);
  diag.addRow(['Смена админки', diagnostics.shiftId ?? 'не задана']);
  diag.addRow(['Запрошенный день', diagnostics.day ?? 'все']);
  diag.addRow(['Анкета открыта сейчас', diagnostics.eveningOpenNow == null ? '—' : (diagnostics.eveningOpenNow ? 'да' : 'нет')]);
  diag.addRow(['Анкета снята с публикации', diagnostics.eveningForceUnpublished == null ? '—' : (diagnostics.eveningForceUnpublished ? 'да' : 'нет')]);
  diag.addRow(['Ослаблен только фильтр дня', diagnostics.shiftFilterRelaxed ? 'да' : 'нет']);
  for (const note of diagnostics.notes) {
    diag.addRow(['Примечание', note]);
  }
  if (emptyReason) diag.addRow(['Причина пустоты', emptyReason]);
  if (rows.length === 0) {
    diag.addRow([
      'Подсказка',
      'Выгрузка показывает только участников выбранной смены, кто сдал итоговую анкету на главной. Вечерняя проверка состояния сюда не входит. Если анкета снята с публикации — сначала опубликуйте её.',
    ]);
  }

  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';
  await sendWorkbook(res, wb, `evening_summary_${dayPart}.xlsx`);
}
