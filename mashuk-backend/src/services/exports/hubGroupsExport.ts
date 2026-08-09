import type { Response } from 'express';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import type { AnalyticsFilters } from '../analytics/analyticsQuery.js';
import { buildHubGroupsDashboard } from '../analytics/hubGroupsDashboard.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

/** Soft red (0%) → pleasant green (100%). */
function heatArgb(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(254 + (134 - 254) * t);
  const g = Math.round(202 + (239 - 202) * t);
  const b = Math.round(202 + (172 - 202) * t);
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `FF${hex(r)}${hex(g)}${hex(b)}`;
}

function paint(
  cell: { fill?: object; alignment?: object; value?: unknown },
  value: number,
  registered: number,
) {
  cell.value = value;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  if (registered > 0) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: heatArgb(value / registered) },
    };
  }
}

export async function writeHubGroupsExport(
  res: Response,
  filters: AnalyticsFilters,
  req?: AdminRequest,
): Promise<void> {
  const data = await buildHubGroupsDashboard(filters, req);
  const days = data.days as number[];
  const slotsMeta = data.touchpointSlotsMeta as { index: number; title: string; shortLabel: string }[];
  const byGroup = data.byGroup as {
    group: string;
    direction: string;
    registered: number;
    eveningByDay: { day: number; submitted: number; fillRatePct: number }[];
    selectedDaySubmitted: number;
    selectedDayFillPct: number;
    touchpointSlots: { index: number; completed: number; coveragePct: number }[];
    avgEngagementPct: number;
  }[];
  const touchpointTotals = data.touchpointTotals as {
    index: number;
    completed: number;
    coveragePct: number;
  }[];
  const selectedDay = data.selectedDay;
  const avgEngagementTotal = data.kpi?.avgEngagementPct ?? 0;

  const wb = await createWorkbook();
  const ws = wb.addWorksheet('Группы', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }],
  });

  const header1: (string | number)[] = ['Группа', 'Направление', 'Зарег.'];
  for (const d of days) header1.push(`Д${d}`);
  header1.push(`Д${selectedDay} %`);
  for (const s of slotsMeta) {
    header1.push(`Т${s.index}`, '');
  }
  header1.push('Ср. вовлеч. %');

  const header2: (string | number)[] = ['', '', ''];
  for (const _d of days) header2.push('');
  header2.push('');
  for (const s of slotsMeta) {
    header2.push('кол-во', '%');
  }
  header2.push('');

  ws.addRow(header1);
  ws.addRow(header2);

  // Merge Тn headers across кол-во/%
  let col = 4 + days.length + 1; // after group, direction, registered, days, selected%
  for (const s of slotsMeta) {
    ws.mergeCells(1, col, 1, col + 1);
    const cell = ws.getCell(1, col);
    cell.value = `Т${s.index} · ${s.shortLabel}`;
    cell.alignment = { horizontal: 'center', wrapText: true };
    col += 2;
  }
  ws.getCell(1, col).value = 'Ср. вовлеч. %';
  ws.getCell(1, col).alignment = { horizontal: 'center', wrapText: true };

  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true, size: 9 };

  for (const row of byGroup) {
    const excelRow = ws.addRow([]);
    const reg = row.registered;
    excelRow.getCell(1).value = row.group;
    excelRow.getCell(2).value = row.direction;
    excelRow.getCell(3).value = reg;

    let c = 4;
    for (const d of days) {
      const submitted = row.eveningByDay.find(x => x.day === d)?.submitted ?? 0;
      paint(excelRow.getCell(c), submitted, reg);
      c += 1;
    }
    paint(excelRow.getCell(c), row.selectedDayFillPct, 100);
    c += 1;
    for (const s of slotsMeta) {
      const slot = row.touchpointSlots.find(x => x.index === s.index);
      paint(excelRow.getCell(c), slot?.completed ?? 0, reg);
      c += 1;
      paint(excelRow.getCell(c), slot?.coveragePct ?? 0, 100);
      c += 1;
    }
    paint(excelRow.getCell(c), row.avgEngagementPct ?? 0, 100);
  }

  // Totals
  if (byGroup.length) {
    const totalReg = byGroup.reduce((s, r) => s + r.registered, 0);
    const excelRow = ws.addRow([]);
    excelRow.font = { bold: true };
    excelRow.getCell(1).value = 'Итого';
    excelRow.getCell(2).value = '';
    excelRow.getCell(3).value = totalReg;
    let c = 4;
    for (const d of days) {
      const submitted = byGroup.reduce((s, r) => {
        return s + (r.eveningByDay.find(x => x.day === d)?.submitted ?? 0);
      }, 0);
      paint(excelRow.getCell(c), submitted, totalReg);
      c += 1;
    }
    const selSubmitted = byGroup.reduce((s, r) => s + r.selectedDaySubmitted, 0);
    const selPct = totalReg ? Math.round((selSubmitted / totalReg) * 1000) / 10 : 0;
    paint(excelRow.getCell(c), selPct, 100);
    c += 1;
    for (const s of slotsMeta) {
      const tot = touchpointTotals.find(t => t.index === s.index);
      paint(excelRow.getCell(c), tot?.completed ?? 0, totalReg);
      c += 1;
      paint(excelRow.getCell(c), tot?.coveragePct ?? 0, 100);
      c += 1;
    }
    paint(excelRow.getCell(c), avgEngagementTotal, 100);
  }

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 10;
  const lastCol = 3 + days.length + 1 + slotsMeta.length * 2 + 1;
  for (let i = 4; i <= lastCol; i += 1) {
    ws.getColumn(i).width = i === lastCol ? 12 : 9;
  }

  const legend = wb.addWorksheet('Легенда');
  legend.addRow(['Подсветка: доля от зарегистрированных в группе']);
  legend.addRow(['0%', 'плохо · мягкий красный']);
  legend.addRow(['100%', 'полное совпадение · зелёный']);
  legend.getCell(2, 1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: heatArgb(0) },
  };
  legend.getCell(3, 1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: heatArgb(1) },
  };
  legend.addRow([]);
  legend.addRow(['Ср. вовлеч. %', 'Среднее охвата по дням итоговой анкеты и 7 точкам активности']);
  legend.addRow([]);
  legend.addRow(['Точки активности']);
  for (const s of slotsMeta) {
    legend.addRow([`Т${s.index}`, s.shortLabel, s.title]);
  }

  await sendWorkbook(res, wb, `hub_groups_d${selectedDay}.xlsx`);
}
