import type { Response } from 'express';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  type EveningExportFilters,
} from './eveningExportData.js';
import { addReadmeSheet, formatTs, fullName } from './exportCommon.js';
import { roleLabel } from './exportLabels.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

export type EveningSummaryExportFilters = EveningExportFilters;

/**
 * Аналитическая выгрузка «Итоги дня»: ответы участников на итоговую анкету вечера.
 * Листы: Описание, Итоги дня (широкий), Ответы по вопросам (1 строка = вопрос), Диагностика.
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
    'VK ID',
    'Дата создания',
    'Дата регистрации',
    'Направление',
    'Группа',
    'Роль на входе',
    'День',
    'Время заполнения',
    'Статус',
    'Источник',
  ];

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка «Итоги дня» — ответы на Итоговую анкету вечера (Форум).',
    'Лист «Итоги дня»: 1 строка = участник × день, вопросы в колонках.',
    'Лист «Ответы по вопросам»: 1 строка = один ответ на один вопрос (удобно для сводных).',
    'Лист «Диагностика»: счётчики, если строк мало или файл казался пустым.',
    `Строк с ответами: ${rows.length}.`,
    emptyReason || '',
    ...(diagnostics.notes || []),
    filters.day ? `Запрошен день: ${filters.day}.` : 'Фильтр дней: вся смена.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
    filters.shiftId != null ? `Смена админки #${filters.shiftId}.` : '',
  ].filter(Boolean));

  const ws = wb.addWorksheet('Итоги дня');
  ws.addRow([...metaHeaders, ...questionHeaders]);

  for (const r of rows) {
    const registeredAt = r.p.onboardingCompletedAt ?? r.p.createdAt;
    ws.addRow([
      r.p.id,
      fullName(r.p),
      r.p.vkId ?? '',
      formatTs(r.p.createdAt),
      formatTs(registeredAt),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      roleLabel(r.p.pedagogicalRole),
      r.dayNumber,
      formatTs(r.filledAt),
      r.status,
      r.source,
      ...fields.map(f => formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey)),
    ]);
  }

  // Главный лист для аналитики: каждый вопрос отдельной строкой
  const byQ = wb.addWorksheet('Ответы по вопросам');
  byQ.addRow([
    'ID участника',
    'ФИО',
    'Направление',
    'Группа',
    'День',
    'Время заполнения',
    'Статус',
    'Ключ вопроса',
    'Вопрос',
    'Ответ',
  ]);
  for (const r of rows) {
    for (const field of fields) {
      const answer = formatEveningFieldValue(field, r.ratings, r.tomorrowRoleKey);
      if (answer === '' || answer == null) continue;
      byQ.addRow([
        r.p.id,
        fullName(r.p),
        r.directionName ?? r.p.direction ?? '',
        r.p.groupName ?? '',
        r.dayNumber,
        formatTs(r.filledAt),
        r.status,
        field.key,
        field.label || field.key,
        answer,
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
