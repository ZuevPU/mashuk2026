import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import {
  computeLeaderboardScores,
  computeNominationLeaderboard,
  NOMINATION_LEADERBOARD_KEYS,
  NOMINATION_LABELS,
} from './leaderboardService.js';
import { resolveActiveShift } from './shiftService.js';
import { COLORS, paintPageBackground, resolvePdfFonts } from './profilePdfLayout.js';
import { contentDispositionAttachment } from './exports/workbook.js';

export type ShiftResultsRow = {
  nomination: string;
  label: string;
  points: number;
};

export type ShiftResultsBundle = {
  fullName: string;
  direction: string | null;
  shiftName: string;
  totalPoints: number;
  nominations: ShiftResultsRow[];
};

export async function gatherShiftResults(participantId: number): Promise<ShiftResultsBundle | null> {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return null;

  const shift = await resolveActiveShift();
  const totalMap = await computeLeaderboardScores([participantId], { scope: 'shift', track: 'total' });
  const nominations: ShiftResultsRow[] = [];

  for (const key of NOMINATION_LEADERBOARD_KEYS) {
    const map = await computeNominationLeaderboard(key, [participantId], { scope: 'shift' });
    const points = map.get(participantId) ?? 0;
    if (points > 0 || key === 'general') {
      nominations.push({
        nomination: key,
        label: NOMINATION_LABELS[key] ?? key,
        points,
      });
    }
  }

  return {
    fullName: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Участник',
    direction: p.direction,
    shiftName: shift?.name ?? 'Смена',
    totalPoints: totalMap.get(participantId) ?? 0,
    nominations,
  };
}

function renderShiftResultsPdf(doc: PDFKit.PDFDocument, data: ShiftResultsBundle) {
  const fonts = resolvePdfFonts();
  doc.registerFont('Mashuk', fonts.regular);
  doc.registerFont('Mashuk-Bold', fonts.bold);
  paintPageBackground(doc);

  let y = 48;
  doc.font('Mashuk-Bold').fontSize(18).fillColor(COLORS.text)
    .text('Итог смены', 48, y, { width: 500 });
  y += 26;
  doc.font('Mashuk').fontSize(11).fillColor(COLORS.muted)
    .text(data.shiftName, 48, y);
  y += 22;

  doc.font('Mashuk-Bold').fontSize(13).fillColor(COLORS.text).text(data.fullName, 48, y);
  y += 18;
  if (data.direction) {
    doc.font('Mashuk').fontSize(10).fillColor(COLORS.muted).text(data.direction, 48, y);
    y += 20;
  }

  doc.font('Mashuk-Bold').fontSize(11).fillColor(COLORS.text).text('Баллы по номинациям', 48, y);
  y += 18;

  const colNom = 48;
  const colPts = 420;
  doc.font('Mashuk-Bold').fontSize(9).fillColor(COLORS.muted);
  doc.text('Номинация', colNom, y);
  doc.text('Баллы', colPts, y, { width: 80, align: 'right' });
  y += 14;

  doc.moveTo(colNom, y).lineTo(520, y).strokeColor(COLORS.border).stroke();
  y += 8;

  for (const row of data.nominations) {
    doc.font('Mashuk').fontSize(10).fillColor(COLORS.text);
    doc.text(row.label, colNom, y, { width: 360 });
    doc.text(String(row.points), colPts, y, { width: 80, align: 'right' });
    y += 16;
  }

  y += 8;
  doc.moveTo(colNom, y).lineTo(520, y).strokeColor(COLORS.border).stroke();
  y += 12;
  doc.font('Mashuk-Bold').fontSize(12).fillColor(COLORS.accent);
  doc.text('Итого за смену', colNom, y);
  doc.text(String(data.totalPoints), colPts, y, { width: 80, align: 'right' });
}

export async function streamShiftResultsPdf(data: ShiftResultsBundle, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    contentDispositionAttachment(`shift_results_${data.fullName.replace(/\s+/g, '_')}.pdf`),
  );
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(res);
  renderShiftResultsPdf(doc, data);
  doc.end();
}

export function shiftResultsToCsv(data: ShiftResultsBundle): string {
  const lines = [
    'full_name,direction,nomination,label,points,total_shift_points',
    ...data.nominations.map(r =>
      [csvCell(data.fullName), csvCell(data.direction ?? ''), r.nomination, csvCell(r.label), r.points, data.totalPoints].join(','),
    ),
  ];
  if (data.nominations.length === 0) {
    lines.push([csvCell(data.fullName), csvCell(data.direction ?? ''), '', '', 0, data.totalPoints].join(','));
  }
  return lines.join('\n');
}

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
