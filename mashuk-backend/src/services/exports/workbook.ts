import type { Response } from 'express';

export async function createWorkbook() {
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}

export async function sendWorkbook(
  res: Response,
  wb: Awaited<ReturnType<typeof createWorkbook>>,
  filename: string,
): Promise<void> {
  // Buffer first so CORS/proxy get a complete response (streaming write can look like a network/CORS failure).
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Length', String(buf.length));
  res.status(200).end(buf);
}

export function sendCsv(res: Response, filename: string, header: string, rows: unknown[][]): void {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  const body = [header.split(',').map(h => esc(h)).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  res.send('\uFEFF' + body);
}
