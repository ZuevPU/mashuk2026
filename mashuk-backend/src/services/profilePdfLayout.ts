import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import type PDFKit from 'pdfkit';

export const COLORS = {
  bg: '#E8E2D8',
  surface: '#F5F0E8',
  card: '#FFFFFF',
  text: '#1A1714',
  muted: '#888888',
  border: '#E0DAD0',
  accent: '#FF5500',
  white: '#FFFFFF',
} as const;

const require = createRequire(import.meta.url);

/** Resolve DejaVu TTF: prefer assets/fonts, fallback to npm package. */
export function resolvePdfFonts(): { regular: string; bold: string } {
  const candidates = [
    path.join(process.cwd(), 'assets', 'fonts'),
    path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'assets', 'fonts'),
    path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'assets', 'fonts'),
  ];
  for (const dir of candidates) {
    const regular = path.join(dir, 'DejaVuSans.ttf');
    const bold = path.join(dir, 'DejaVuSans-Bold.ttf');
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      return { regular, bold };
    }
  }
  try {
    const regular = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
    const bold = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
    return { regular, bold };
  } catch {
    throw new Error(
      'PDF fonts missing: put DejaVuSans.ttf and DejaVuSans-Bold.ttf in mashuk-backend/assets/fonts '
      + 'or install npm package dejavu-fonts-ttf',
    );
  }
}

export type PdfDoc = PDFKit.PDFDocument;

export function paintPageBackground(doc: PdfDoc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg);
  doc.restore();
}

export function drawHeroHeader(doc: PdfDoc, subtitle: string) {
  const w = doc.page.width;
  doc.save();
  doc.rect(0, 0, w, 72).fill(COLORS.accent);
  doc.fillColor(COLORS.white).font('Mashuk-Bold').fontSize(22);
  doc.text('МАШУК', 40, 18, { width: w - 80, align: 'left' });
  doc.font('Mashuk').fontSize(11).fillColor(COLORS.white);
  doc.text(subtitle, 40, 46, { width: w - 80 });
  doc.restore();
  doc.y = 88;
}

export function drawContinuedHeader(doc: PdfDoc) {
  const w = doc.page.width;
  doc.save();
  doc.rect(0, 0, w, 28).fill(COLORS.accent);
  doc.fillColor(COLORS.white).font('Mashuk').fontSize(9);
  doc.text('Машук · продолжение', 40, 9, { width: w - 80 });
  doc.restore();
  doc.y = 44;
}

export function ensureSpace(doc: PdfDoc, needed: number) {
  if (doc.y + needed > doc.page.height - 48) {
    doc.addPage();
  }
}

export function drawProgressBar(doc: PdfDoc, percent: number, label: string, dates: string) {
  const x = 40;
  const barW = doc.page.width - 80;
  doc.font('Mashuk-Bold').fontSize(11).fillColor(COLORS.text);
  doc.text(label, x, doc.y, { width: barW });
  doc.font('Mashuk').fontSize(9).fillColor(COLORS.muted);
  doc.text(dates, x, doc.y + 2, { width: barW });
  const barY = doc.y + 8;
  const h = 10;
  doc.save();
  doc.roundedRect(x, barY, barW, h, 4).fill(COLORS.border);
  const fillW = Math.max(0, Math.min(barW, (barW * Math.max(0, Math.min(100, percent))) / 100));
  if (fillW > 0) {
    doc.roundedRect(x, barY, fillW, h, 4).fill(COLORS.accent);
  }
  doc.restore();
  doc.font('Mashuk-Bold').fontSize(10).fillColor(COLORS.accent);
  doc.text(`${Math.round(percent)}%`, x, barY + h + 4, { width: barW, align: 'right' });
  doc.y = barY + h + 22;
}

export function sectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 36);
  const x = 40;
  const w = doc.page.width - 80;
  doc.font('Mashuk-Bold').fontSize(13).fillColor(COLORS.text);
  doc.text(title, x, doc.y, { width: w });
  const lineY = doc.y + 4;
  doc.save();
  doc.moveTo(x, lineY).lineTo(x + 56, lineY).lineWidth(2.5).strokeColor(COLORS.accent).stroke();
  doc.restore();
  doc.y = lineY + 10;
}

export function mutedLine(doc: PdfDoc, text: string) {
  doc.font('Mashuk').fontSize(9).fillColor(COLORS.muted);
  doc.text(text, 40, doc.y, { width: doc.page.width - 80 });
}

export function bodyText(doc: PdfDoc, text: string) {
  doc.font('Mashuk').fontSize(10).fillColor(COLORS.text);
  doc.text(text, 40, doc.y, { width: doc.page.width - 80, lineGap: 2 });
}

export function bullet(doc: PdfDoc, text: string) {
  doc.font('Mashuk').fontSize(10).fillColor(COLORS.text);
  doc.text(`•  ${text}`, 48, doc.y, { width: doc.page.width - 96, lineGap: 2 });
  doc.moveDown(0.15);
}

/** White card with accent stripe for A/B comparison row. */
export function comparisonCard(doc: PdfDoc, index: number, pointA: string, pointB: string) {
  const x = 40;
  const w = doc.page.width - 80;
  const colW = (w - 28) / 2;
  const innerX = x + 12;

  doc.font('Mashuk-Bold').fontSize(9);
  const titleH = doc.heightOfString(`Вопрос ${index}`, { width: w - 24 });
  doc.font('Mashuk').fontSize(8);
  const labelH = doc.heightOfString('Было', { width: colW });
  doc.font('Mashuk').fontSize(10);
  const aH = doc.heightOfString(pointA || '—', { width: colW - 4 });
  const bH = doc.heightOfString(pointB || '—', { width: colW - 4 });
  const h = 14 + titleH + 4 + labelH + 4 + Math.max(aH, bH) + 12;

  ensureSpace(doc, h + 8);
  const top = doc.y;

  doc.save();
  doc.roundedRect(x, top, w, h, 6).fill(COLORS.card);
  doc.roundedRect(x, top, w, h, 6).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc.rect(x, top, 3, h).fill(COLORS.accent);
  doc.restore();

  let y = top + 10;
  doc.font('Mashuk-Bold').fontSize(9).fillColor(COLORS.accent);
  doc.text(`Вопрос ${index}`, innerX, y, { width: w - 24 });
  y = doc.y + 4;
  doc.font('Mashuk').fontSize(8).fillColor(COLORS.muted);
  doc.text('Было', innerX, y, { width: colW });
  doc.text('Стало', innerX + colW + 4, y, { width: colW });
  y = doc.y + 2;
  doc.font('Mashuk').fontSize(10).fillColor(COLORS.text);
  doc.text(pointA || '—', innerX, y, { width: colW - 4 });
  const afterA = doc.y;
  doc.text(pointB || '—', innerX + colW + 4, y, { width: colW - 4 });
  doc.y = Math.max(afterA, doc.y, top + h) + 8;
}
