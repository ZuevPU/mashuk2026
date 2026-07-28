import type { Response } from 'express';
import fs from 'fs';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { getExportMetaPayload } from '../services/exports/exportMeta.js';
import {
  createCustomExport,
  getExportHistoryFile,
  listExportHistory,
  recordPresetExport,
} from '../services/exports/customExportService.js';
import type { ExportSourceId } from '../services/exports/exportMeta.js';
import { z } from 'zod';

const customBodySchema = z.object({
  source: z.enum(['answers', 'reflections', 'participants', 'tasks', 'rating_day', 'piggybank']),
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
  source: z.enum(['answers', 'reflections', 'participants', 'tasks', 'rating_day', 'piggybank']),
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

export async function downloadExportHistoryHandler(req: AdminRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const row = await getExportHistoryFile(id);
  if (!row) {
    res.status(404).json({ error: 'Export not found or expired' });
    return;
  }
  const { contentDispositionAttachment } = await import('../services/exports/workbook.js');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDispositionAttachment(row.fileName || 'export.xlsx'));
  fs.createReadStream(row.filePath!).pipe(res);
}
