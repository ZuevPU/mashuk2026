import { ZipArchive } from 'archiver';
import { eq, isNull } from 'drizzle-orm';
import type { Response } from 'express';
import { PassThrough } from 'stream';
import { db } from '../../db/index.js';
import { participants } from '../../db/schema.js';
import { loadParticipantAnswerRows } from './reflectionsExport.js';
import { ANSWER_ROW_HEADERS, buildAnswerRow } from './exportCommon.js';
import { createWorkbook } from './workbook.js';

function exportMaxParticipants(): number {
  const n = Number(process.env.EXPORT_MAX_PARTICIPANTS);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export async function writeParticipantsArchiveZip(
  res: Response,
  opts: { participantId?: number; textOnly: boolean },
): Promise<void> {
  const max = exportMaxParticipants();
  let list = await db.select().from(participants).where(isNull(participants.selfDeletedAt)).limit(max);
  if (opts.participantId) {
    list = list.filter(p => p.id === opts.participantId);
  }
  if (list.length === 0) {
    res.status(404).json({ error: 'No participants' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=participants_answers.zip');

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(res);

  for (const p of list) {
    const rows = await loadParticipantAnswerRows(p.id, opts.textOnly);
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Ответы');
    ws.addRow([...ANSWER_ROW_HEADERS, 'question_id']);
    for (const r of rows) {
      ws.addRow([...buildAnswerRow(r, { source: 'question' }), r.q?.id]);
    }
    const buf = await wb.xlsx.writeBuffer();
    archive.append(Buffer.from(buf), { name: `participant_${p.id}.xlsx` });
  }

  await archive.finalize();
}

export async function writeFinalProfilesZip(res: Response): Promise<void> {
  const { pdfWhitelist } = await import('../../db/schema.js');
  const { gatherProfileBundle, streamProfilePdf } = await import('../profilePdfBuilder.js');
  const wl = await db.select().from(pdfWhitelist).where(eq(pdfWhitelist.enabled, true));
  const max = exportMaxParticipants();
  const ids = wl.map(w => w.participantId).slice(0, max);

  if (ids.length === 0) {
    res.status(404).json({ error: 'No whitelisted PDF profiles' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=final_profiles.zip');
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(res);

  for (const id of ids) {
    const bundle = await gatherProfileBundle(id);
    if (!bundle) continue;
    const blocks = (bundle.pdf.draftBlocks ?? {}) as Record<string, unknown>;
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>((resolve, reject) => {
      pass.on('end', () => resolve());
      pass.on('error', reject);
      streamProfilePdf(bundle, pass, blocks).then(() => pass.end()).catch(reject);
    });
    archive.append(Buffer.concat(chunks), { name: `profile_${id}.pdf` });
  }
  await archive.finalize();
}
