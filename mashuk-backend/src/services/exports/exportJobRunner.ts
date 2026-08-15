import path from 'path';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { exportHistory } from '../../db/schema.js';
import {
  getExportStorageDir,
  HEAVY_EXPORT_SOURCES,
  failStuckPendingExports,
} from './customExportService.js';
import {
  writeFinalProfilesZipToFile,
  writeParticipantsArchiveZipToFile,
} from './participantArchiveExport.js';
import { writeShiftSummaryPdfToFile } from './shiftSummaryPdfBuilder.js';

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

async function updateProgress(
  id: string,
  patch: { progress?: number; doneCount?: number; totalCount?: number },
) {
  await db.update(exportHistory).set(patch).where(eq(exportHistory.id, id));
}

async function claimNextJob() {
  const pending = await db.select().from(exportHistory)
    .where(eq(exportHistory.status, 'pending'))
    .orderBy(asc(exportHistory.createdAt))
    .limit(20);
  const row = pending.find(r => HEAVY_EXPORT_SOURCES.has(r.source));
  if (!row) return null;
  const [claimed] = await db.update(exportHistory)
    .set({ status: 'running', progress: 0 })
    .where(and(eq(exportHistory.id, row.id), eq(exportHistory.status, 'pending')))
    .returning();
  return claimed ?? null;
}

async function runJob(row: typeof exportHistory.$inferSelect): Promise<void> {
  const params = (row.params ?? {}) as Record<string, unknown>;
  const safeTitle = (row.title || row.source).replace(/[^\w\u0400-\u04FF.-]+/g, '_').slice(0, 60);
  const ext = row.source === 'shift_summary_pdf' ? 'pdf' : 'zip';
  const fileName = `${safeTitle}_${row.id.slice(0, 8)}.${ext}`;
  const filePath = path.join(getExportStorageDir(), fileName);

  const onProgress = async (p: { done: number; total: number; progress: number }) => {
    await updateProgress(row.id, {
      progress: p.progress,
      doneCount: p.done,
      totalCount: p.total,
    });
  };

  let byteSize = 0;
  if (row.source === 'participants_archive') {
    const result = await writeParticipantsArchiveZipToFile(filePath, {
      participantId: params.participantId != null ? Number(params.participantId) : undefined,
      textOnly: params.textOnly === true || params.textOnly === '1',
    }, onProgress);
    byteSize = result.byteSize;
  } else if (row.source === 'final_profiles_zip') {
    const result = await writeFinalProfilesZipToFile(filePath, onProgress);
    byteSize = result.byteSize;
  } else if (row.source === 'shift_summary_pdf') {
    const result = await writeShiftSummaryPdfToFile(
      filePath,
      onProgress,
      params.shiftId != null ? Number(params.shiftId) : null,
    );
    byteSize = result.byteSize;
  } else {
    throw new Error(`Unsupported export job source: ${row.source}`);
  }

  await db.update(exportHistory).set({
    status: 'ready',
    progress: 100,
    filePath,
    fileName,
    byteSize,
  }).where(eq(exportHistory.id, row.id));
}

export async function runExportJobTick(): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    await failStuckPendingExports();
    const job = await claimNextJob();
    if (!job) return false;
    try {
      await runJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(exportHistory).set({
        status: 'failed',
        errorMessage: msg,
      }).where(eq(exportHistory.id, job.id));
    }
    return true;
  } finally {
    busy = false;
  }
}

export function startExportJobRunner(): void {
  if (timer) return;
  console.log('Export job runner started (8s tick)');
  timer = setInterval(() => {
    void runExportJobTick().catch(err => console.error('Export job runner error:', err));
  }, 8_000);
  // kick once
  void runExportJobTick().catch(() => undefined);
}

export function stopExportJobRunner(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
