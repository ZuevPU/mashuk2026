import type { Response } from 'express';
import fs from 'fs';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { getExportMetaPayload } from '../services/exports/exportMeta.js';
import {
  createCustomExport,
  enqueueExportJob,
  getExportHistoryFile,
  getExportHistoryRow,
  listExportHistory,
  recordPresetExport,
  type ExportJobKind,
} from '../services/exports/customExportService.js';
import type { ExportSourceId } from '../services/exports/exportMeta.js';
import { z } from 'zod';

const exportSourceSchema = z.enum([
  'answers',
  'reflections',
  'participants',
  'tasks',
  'rating_day',
  'piggybank',
  'participant_activity_wide',
]);

const customBodySchema = z.object({
  source: exportSourceSchema,
  params: z.object({
    day: z.coerce.number().int().min(1).max(8).optional(),
    direction: z.string().optional(),
    group: z.string().optional(),
    type: z.string().optional(),
    participantId: z.coerce.number().int().positive().optional(),
  }).optional(),
  columns: z.array(z.string()).optional(),
  title: z.string().max(255).optional(),
});

const presetBodySchema = z.object({
  preset: z.string().min(1),
  title: z.string().max(255).optional(),
  source: exportSourceSchema,
  params: customBodySchema.shape.params.optional(),
  columns: z.array(z.string()).optional(),
});

export async function getExportMetaHandler(_req: AdminRequest, res: Response): Promise<void> {
  res.json(getExportMetaPayload());
}

export async function postCustomExportHandler(req: AdminRequest, res: Response): Promise<void> {
  const parsed = customBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const row = await createCustomExport(req, {
    source: parsed.data.source as ExportSourceId,
    params: parsed.data.params,
    columns: parsed.data.columns,
    title: parsed.data.title,
  });
  res.status(201).json(row);
}

export async function postPresetExportHistoryHandler(req: AdminRequest, res: Response): Promise<void> {
  const parsed = presetBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const row = await recordPresetExport(req, {
    preset: parsed.data.preset,
    title: parsed.data.title ?? parsed.data.preset,
    source: parsed.data.source as ExportSourceId,
    params: parsed.data.params,
    columns: parsed.data.columns,
  });
  res.status(201).json(row);
}

export async function getExportHistoryHandler(req: AdminRequest, res: Response): Promise<void> {
  const limit = Number(req.query.limit) || 50;
  res.json({ items: await listExportHistory(limit) });
}

export async function getExportHistoryItemHandler(req: AdminRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const row = await getExportHistoryRow(id);
  if (!row) {
    res.status(404).json({ error: 'Export not found' });
    return;
  }
  res.json(row);
}

const jobBodySchema = z.object({
  kind: z.enum(['participants_archive', 'final_profiles_zip', 'shift_summary_pdf']),
  title: z.string().max(255).optional(),
  params: z.record(z.unknown()).optional(),
});

export async function postExportJobHandler(req: AdminRequest, res: Response): Promise<void> {
  const parsed = jobBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const row = await enqueueExportJob(req, {
    kind: parsed.data.kind as ExportJobKind,
    title: parsed.data.title,
    params: parsed.data.params,
  });
  res.status(202).json(row);
}

export async function downloadExportHistoryHandler(req: AdminRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const row = await getExportHistoryFile(id);
  if (!row) {
    res.status(404).json({ error: 'Export not found or expired' });
    return;
  }
  const { contentDispositionAttachment } = await import('../services/exports/workbook.js');
  const name = row.fileName || 'export.bin';
  const lower = name.toLowerCase();
  let contentType = 'application/octet-stream';
  if (lower.endsWith('.xlsx')) {
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (lower.endsWith('.zip')) {
    contentType = 'application/zip';
  } else if (lower.endsWith('.pdf')) {
    contentType = 'application/pdf';
  } else if (lower.endsWith('.csv')) {
    contentType = 'text/csv; charset=utf-8';
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDispositionAttachment(name));
  fs.createReadStream(row.filePath!).pipe(res);
}
