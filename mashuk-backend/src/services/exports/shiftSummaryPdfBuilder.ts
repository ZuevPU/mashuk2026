import type { Response } from 'express';
import fs from 'fs';
import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  participants, taskSubmissions, userMedals,
} from '../../db/schema.js';
import { resolveActiveShift } from '../shiftService.js';
import { computeLeaderboardScores } from '../leaderboardService.js';
import { COLORS, paintPageBackground, resolvePdfFonts } from '../profilePdfLayout.js';
import { fullName } from './exportCommon.js';
import { contentDispositionAttachment } from './workbook.js';
import type { ArchiveProgress } from './participantArchiveExport.js';

async function gatherShiftSummaryAggregates() {
  const shift = await resolveActiveShift();
  const conditions = [isNull(participants.selfDeletedAt)];
  if (shift?.id != null) {
    conditions.push(eq(participants.shiftId, shift.id));
  }
  const allP = await db.select().from(participants).where(and(...conditions));
  const ids = allP.map(p => p.id);
  const scores = ids.length
    ? await computeLeaderboardScores(ids, { scope: 'shift', track: 'total' })
    : new Map<number, number>();
  const ranked = allP
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 10);

  let medalsIssued = 0;
  let tasksApproved = 0;
  if (ids.length) {
    const [medalsCnt] = await db.select({ n: count() }).from(userMedals)
      .where(inArray(userMedals.participantId, ids));
    medalsIssued = Number(medalsCnt?.n ?? 0);
    const [tasksCnt] = await db.select({ n: count() }).from(taskSubmissions)
      .where(and(
        inArray(taskSubmissions.participantId, ids),
        eq(taskSubmissions.status, 'approved'),
      ));
    tasksApproved = Number(tasksCnt?.n ?? 0);
  }

  const onboarded = allP.filter(p => p.onboardingCompletedAt).length;
  const active = allP.filter(p => p.lastActiveAt).length;

  return {
    shiftName: shift?.name ?? 'Активная смена',
    shiftId: shift?.id ?? null,
    startDate: shift?.startDate ?? null,
    totalDays: shift?.totalDays ?? 8,
    participantsTotal: allP.length,
    onboarded,
    active,
    medalsIssued,
    tasksApproved,
    top: ranked.map((r, i) => ({
      rank: i + 1,
      name: fullName(r.p),
      points: r.pts,
      direction: r.p.direction ?? '',
    })),
  };
}

function renderShiftSummaryPdf(
  doc: PDFKit.PDFDocument,
  data: Awaited<ReturnType<typeof gatherShiftSummaryAggregates>>,
) {
  const fonts = resolvePdfFonts();
  doc.registerFont('Mashuk', fonts.regular);
  doc.registerFont('Mashuk-Bold', fonts.bold);
  paintPageBackground(doc);

  let y = 48;
  doc.font('Mashuk-Bold').fontSize(20).fillColor(COLORS.text)
    .text('Итог смены', 48, y, { width: 500 });
  y += 28;
  doc.font('Mashuk').fontSize(11).fillColor(COLORS.muted)
    .text(`${data.shiftName}${data.shiftId != null ? ` · #${data.shiftId}` : ''}`, 48, y);
  y += 18;
  if (data.startDate) {
    doc.text(`Старт: ${new Date(data.startDate).toLocaleDateString('ru-RU')} · дней: ${data.totalDays}`, 48, y);
    y += 22;
  } else {
    y += 8;
  }

  doc.font('Mashuk-Bold').fontSize(13).fillColor(COLORS.text).text('Сводка', 48, y);
  y += 20;
  const lines = [
    `Участников: ${data.participantsTotal}`,
    `Онбординг завершён: ${data.onboarded}`,
    `Были активны: ${data.active}`,
    `Медалей выдано: ${data.medalsIssued}`,
    `Заданий одобрено: ${data.tasksApproved}`,
  ];
  doc.font('Mashuk').fontSize(11).fillColor(COLORS.text);
  for (const line of lines) {
    doc.text(line, 48, y);
    y += 16;
  }

  y += 12;
  doc.font('Mashuk-Bold').fontSize(13).text('Топ рейтинга смены (до 10)', 48, y);
  y += 20;
  doc.font('Mashuk').fontSize(10);
  if (data.top.length === 0) {
    doc.fillColor(COLORS.muted).text('Нет данных', 48, y);
  } else {
    for (const row of data.top) {
      doc.fillColor(COLORS.text)
        .text(`${row.rank}. ${row.name} — ${row.points} · ${row.direction || '—'}`, 48, y, { width: 500 });
      y += 14;
      if (y > 720) break;
    }
  }

  y = Math.max(y + 24, 700);
  doc.font('Mashuk').fontSize(9).fillColor(COLORS.muted)
    .text('Агрегированный отчёт без построчной детализации ответов и копилки.', 48, y, { width: 500 });
}

export async function writeShiftSummaryPdfToFile(
  filePath: string,
  onProgress?: (p: ArchiveProgress) => void | Promise<void>,
): Promise<{ byteSize: number; total: number }> {
  await onProgress?.({ done: 0, total: 1, progress: 10 });
  const data = await gatherShiftSummaryAggregates();
  await onProgress?.({ done: 0, total: 1, progress: 40 });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    try {
      renderShiftSummaryPdf(doc, data);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });

  await onProgress?.({ done: 1, total: 1, progress: 100 });
  const stat = await fs.promises.stat(filePath);
  return { byteSize: stat.size, total: 1 };
}

export async function writeShiftSummaryPdf(res: Response): Promise<void> {
  const data = await gatherShiftSummaryAggregates();
  const fonts = resolvePdfFonts();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDispositionAttachment('shift_summary.pdf'));
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);
  doc.registerFont('Mashuk', fonts.regular);
  doc.registerFont('Mashuk-Bold', fonts.bold);
  renderShiftSummaryPdf(doc, data);
  doc.end();
}
