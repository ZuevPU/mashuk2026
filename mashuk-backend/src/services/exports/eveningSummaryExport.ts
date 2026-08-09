import type { Response } from 'express';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  type EveningExportFilters,
} from './eveningExportData.js';
import { addReadmeSheet, formatTs, fullName } from './exportCommon.js';
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
 * Выгрузка итоговой анкеты вечера (как у вопросов):
 * — «Все ответы»: 1 строка = участник, каждый вопрос — отдельный столбец;
 * — далее отдельный лист на каждый вопрос: ФИО, направление, ответ.
 */
export async function writeEveningSummaryExport(
  res: Response,
  filters: EveningSummaryExportFilters = {},
): Promise<void> {
  const { rows, fields, emptyReason, diagnostics } = await collectEveningExportRows(filters);
  const questionHeaders = fields.map(f => f.label || f.key);

  const metaHeaders = [
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'День',
    'Время заполнения',
    'Статус',
  ];

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка ответов на Итоговую анкету вечера (Форум).',
    'Лист «Все ответы»: полный список участников — каждый вопрос в отдельном столбце.',
    'Далее — отдельный лист на каждый вопрос: кто и как ответил (ФИО, направление, ответ).',
    'Лист «Диагностика»: счётчики, если строк мало или файл казался пустым.',
    `Участников с анкетой: ${rows.length}.`,
    `Вопросов (полей): ${fields.length}.`,
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
    wsAll.addRow([
      r.p.id,
      fullName(r.p),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      r.dayNumber,
      formatTs(r.filledAt),
      r.status,
      ...fields.map(f => formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey)),
    ]);
  }

  const usedNames = new Set<string>(['Описание', 'Все ответы', 'Диагностика']);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const label = (field.label || field.key || `Вопрос ${i + 1}`).trim();
    const sheetName = safeSheetName(`Q${i + 1} ${label}`, usedNames);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(['Вопрос', label]);
    ws.addRow(['Ключ', field.key]);
    ws.addRow([]);
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
