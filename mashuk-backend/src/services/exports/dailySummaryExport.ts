import type { Response } from 'express';
import {
  collectEveningExportRows,
  formatEveningFieldValue,
  type EveningExportFilters,
} from './eveningExportData.js';
import { addReadmeSheet, fullName, formatTs } from './exportCommon.js';
import { roleLabel } from './exportLabels.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

type Filters = EveningExportFilters & {
  ageMin?: number;
  ageMax?: number;
};

export async function writeDailySummaryExport(res: Response, filters: Filters): Promise<void> {
  const { rows, fields, emptyReason } = await collectEveningExportRows({
    day: filters.day,
    direction: filters.direction,
    group: filters.group,
    ageCategory: filters.ageCategory,
    activityQ: filters.activityQ,
    shiftId: filters.shiftId,
  });

  // ageMin/ageMax — доп. фильтр поверх cohort ageCategory
  let filtered = rows;
  if (!filters.ageCategory) {
    if (filters.ageMin != null) {
      filtered = filtered.filter(r => (r.p.age ?? 0) >= filters.ageMin!);
    }
    if (filters.ageMax != null) {
      filtered = filtered.filter(r => (r.p.age ?? 999) <= filters.ageMax!);
    }
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Итоги дня: одна строка = участник × день (сданная итоговая анкета).',
    'Колонки соответствуют Итоговой анкете вечера (конфиг смены) + ответы «Итоги дня».',
    `Строк с ответами: ${filtered.length}.`,
    emptyReason && filtered.length === 0 ? emptyReason : '',
    filters.direction ? `Направление: ${filters.direction}.` : '',
    filters.group ? `Группа: ${filters.group}.` : '',
  ].filter(Boolean));

  const ws = wb.addWorksheet('Итоги дня');
  ws.addRow([
    'ID участника', 'ФИО', 'Направление', 'Группа', 'День', 'Время заполнения',
    'Роль на завтра',
    ...fields.map(f => f.label || f.key),
  ]);

  for (const r of filtered) {
    ws.addRow([
      r.p.id,
      fullName(r.p),
      r.directionName ?? r.p.direction ?? '',
      r.p.groupName ?? '',
      r.dayNumber,
      formatTs(r.filledAt),
      roleLabel(r.tomorrowRoleKey),
      ...fields.map(f => formatEveningFieldValue(f, r.ratings, r.tomorrowRoleKey)),
    ]);
  }
  await sendWorkbook(res, wb, `daily_summary_day${filters.day ?? 'all'}.xlsx`);
}
