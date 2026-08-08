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
 * Аналитическая выгрузка «Итоги дня»: 1 строка = участник × день.
 * Источники: participant_day_state.evening_ratings и answers по вопросам «Итоги дня».
 */
export async function writeEveningSummaryExport(
  res: Response,
  filters: EveningSummaryExportFilters = {},
): Promise<void> {
  const { rows, fields, emptyReason } = await collectEveningExportRows(filters);
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
  ];

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Выгрузка «Итоги дня» (вечерняя итоговая анкета из раздела Форум).',
    'Одна строка = один участник × один день форума (сданные анкеты).',
    'Данные: evening_ratings участника и ответы на вопросы «Итоги дня».',
    `Строк с ответами: ${rows.length}.`,
    emptyReason || '',
    filters.day ? `Фильтр: день ${filters.day}.` : 'Фильтр: все дни смены.',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
    filters.shiftId != null ? `Смена #${filters.shiftId}.` : '',
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
      ...fields.map(f => formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey)),
    ]);
  }

  const long = wb.addWorksheet('Вопросы (длинный)');
  long.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Время заполнения',
    'Ключ вопроса', 'Вопрос', 'Ответ',
  ]);
  for (const r of rows) {
    for (const field of fields) {
      const answer = formatEveningFieldValue(field, r.ratings, r.tomorrowRoleKey);
      if (answer === '' || answer == null) continue;
      long.addRow([
        r.p.id,
        fullName(r.p),
        r.directionName ?? r.p.direction ?? '',
        r.p.groupName ?? '',
        r.dayNumber,
        formatTs(r.filledAt),
        field.key,
        field.label || field.key,
        answer,
      ]);
    }
  }

  const dayPart = filters.day != null && filters.day > 0 ? `d${filters.day}` : 'shift';
  await sendWorkbook(res, wb, `evening_summary_${dayPart}.xlsx`);
}
