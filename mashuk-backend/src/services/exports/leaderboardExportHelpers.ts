import type { Response } from 'express';
import { createWorkbook, contentDispositionAttachment, sendWorkbook } from './workbook.js';

export type LeaderboardExportMeta = {
  exportType: string;
  participantCount: number;
  participantsPool?: number;
  scope?: 'day' | 'shift' | 'total';
  day?: number;
  nomination?: string;
  medalMode?: string;
  track?: string;
};

function metaCommentLines(meta: LeaderboardExportMeta): string[] {
  const lines = [
    `# export_type=${meta.exportType}`,
    `# participants_total=${meta.participantCount}`,
  ];
  if (meta.participantsPool != null && meta.participantsPool !== meta.participantCount) {
    lines.push(`# participants_pool=${meta.participantsPool}`);
  }
  if (meta.scope) lines.push(`# scope=${meta.scope}`);
  if (meta.day != null) lines.push(`# day=${meta.day}`);
  if (meta.nomination) lines.push(`# nomination=${meta.nomination}`);
  if (meta.medalMode) lines.push(`# medal_mode=${meta.medalMode}`);
  if (meta.track) lines.push(`# track=${meta.track}`);
  lines.push(`# generated_at=${new Date().toISOString()}`);
  return lines;
}

export function sendLeaderboardCsv(
  res: Response,
  filename: string,
  header: string,
  rows: unknown[][],
  meta: LeaderboardExportMeta,
): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
  const body = [
    ...metaCommentLines(meta),
    header.split(',').map(h => esc(h)).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ].join('\n');
  res.send('\uFEFF' + body);
}

export async function sendLeaderboardXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  headers: string[],
  rows: unknown[][],
  meta: LeaderboardExportMeta,
): Promise<void> {
  const wb = await createWorkbook();
  const wsMeta = wb.addWorksheet('Сводка');
  wsMeta.addRow(['Параметр', 'Значение']);
  wsMeta.addRow(['Тип выгрузки', meta.exportType]);
  wsMeta.addRow(['Участников в рейтинге', meta.participantCount]);
  if (meta.participantsPool != null) {
    wsMeta.addRow(['Всего в смене', meta.participantsPool]);
  }
  if (meta.scope) wsMeta.addRow(['Период', meta.scope]);
  if (meta.day != null) wsMeta.addRow(['День форума', meta.day]);
  if (meta.nomination) wsMeta.addRow(['Номинация', meta.nomination]);
  if (meta.medalMode) wsMeta.addRow(['Режим медалей', meta.medalMode]);
  if (meta.track) wsMeta.addRow(['Трек', meta.track]);
  wsMeta.addRow(['Сформировано', new Date().toISOString()]);

  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Рейтинг');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  await sendWorkbook(res, wb, filename);
}
