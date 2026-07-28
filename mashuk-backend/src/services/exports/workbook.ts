import type { Response } from 'express';

export async function createWorkbook() {
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}

/** Safe Content-Disposition for ASCII + optional Cyrillic filenames. */
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'export.bin';
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function sendWorkbook(
  res: Response,
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  filename: string,
): Promise<void> {
  // Buffer first so CORS/proxy get a complete response (streaming write can look like a network/CORS failure).
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
  res.setHeader('Content-Length', String(buf.length));
  res.status(200).end(buf);
}

export async function sendSimpleXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  headers: string[],
  rows: unknown[][],
): Promise<void> {
  const wb = await createWorkbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Данные');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  await sendWorkbook(res, wb, filename);
}

export function sendCsv(res: Response, filename: string, header: string, rows: unknown[][]): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
  const body = [header.split(',').map(h => esc(h)).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  // UTF-8 BOM so Excel on Windows opens Cyrillic correctly
  res.send('\uFEFF' + body);
}
