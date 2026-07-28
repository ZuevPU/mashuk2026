import fs from 'fs/promises';
import path from 'path';
import { eq, desc, lt, isNull } from 'drizzle-orm';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { answers, exportHistory, participants, questions, taskSubmissions, tasks } from '../../db/schema.js';
import { logAdminAction } from '../adminActionsLog.js';
import { queryPiggybankForExport } from '../../controllers/adminPiggybankController.js';
import {
  ANSWER_ROW_HEADERS,
  buildAnswerRow,
  filterAnswersByTouchpoint,
  fullName,
  formatTs,
} from './exportCommon.js';
import { normalizeExportTouchpointFilter } from './touchpointFilter.js';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { createWorkbook } from './workbook.js';
import type { ExportSourceId } from './exportMeta.js';
import { resolveColumnLabels } from './exportMeta.js';

const TTL_DAYS = 30;

export function getExportStorageDir(): string {
  return path.isAbsolute(env.EXPORT_STORAGE_DIR)
    ? env.EXPORT_STORAGE_DIR
    : path.join(process.cwd(), env.EXPORT_STORAGE_DIR);
}

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(getExportStorageDir(), { recursive: true });
}

export async function cleanupExpiredExports(): Promise<void> {
  const now = new Date();
  const expired = await db.select().from(exportHistory).where(lt(exportHistory.expiresAt, now));
  for (const row of expired) {
    if (row.filePath) {
      await fs.unlink(row.filePath).catch(() => undefined);
    }
    await db.delete(exportHistory).where(eq(exportHistory.id, row.id));
  }
}

type CustomParams = {
  day?: number;
  direction?: string;
  group?: string;
  type?: string;
  participantId?: number;
};

function cohortFilter(p: typeof participants.$inferSelect | null, params: CustomParams): boolean {
  if (!p) return false;
  if (params.direction && p.direction !== params.direction) return false;
  if (params.group && p.groupName !== params.group) return false;
  if (params.participantId && p.id !== params.participantId) return false;
  return true;
}

function pickColumns(row: Record<string, unknown>, keys: string[]): unknown[] {
  return keys.map(k => row[k] ?? '');
}

async function fetchAnswerRows(source: 'answers' | 'reflections', params: CustomParams) {
  const type = source === 'reflections' ? 'all' : normalizeExportTouchpointFilter(params.type);
  let rows = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id));
  if (params.day) rows = rows.filter(r => r.q?.dayNumber === params.day);
  rows = rows.filter(r => cohortFilter(r.p, params));
  if (source === 'answers') rows = filterAnswersByTouchpoint(rows, type);
  return rows.map(r => {
    const built = buildAnswerRow(r, { source: 'question' });
    const record: Record<string, unknown> = {};
    ANSWER_ROW_HEADERS.forEach((h, i) => { record[h] = built[i]; });
    return record;
  });
}

async function fetchParticipantRows(params: CustomParams) {
  const rows = await loadEnrichedParticipants();
  return rows
    .filter(r => {
      if (params.direction && r.direction !== params.direction) return false;
      if (params.group && r.groupName !== params.group) return false;
      if (params.participantId && r.id !== params.participantId) return false;
      return true;
    })
    .map(r => ({
      id: r.id,
      full_name: r.fullName,
      direction: r.direction,
      group_name: r.groupName,
      path_points: r.pathPoints,
      experience_points: r.experiencePoints,
      total_rating: r.totalRating,
      start_role: r.startRole,
      strong_role: r.strongRole,
    }));
}

async function fetchTaskRows(params: CustomParams) {
  const rows = await db.select({ s: taskSubmissions, p: participants, t: tasks })
    .from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  return rows
    .filter(r => cohortFilter(r.p, params))
    .map(r => ({
      participant_id: r.p?.id ?? '',
      full_name: fullName(r.p),
      direction: r.p?.direction ?? '',
      group_name: r.p?.groupName ?? '',
      task_title: r.t?.title ?? '',
      status: r.s.status,
      points: r.s.pointsAwarded ?? '',
      submitted_at: formatTs(r.s.submittedAt),
    }));
}

async function fetchRatingDayRows(day: number, params: CustomParams) {
  const allP = await db.select().from(participants).where(isNull(participants.selfDeletedAt));
  const filtered = allP.filter(p => cohortFilter(p, params));
  const ids = filtered.map(p => p.id);
  const { computeLeaderboardScores } = await import('../leaderboardService.js');
  const scores = await computeLeaderboardScores(ids, { scope: 'day', day, track: 'total' });
  const ranked = filtered
    .map(p => ({ p, pts: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  return ranked.map((r, i) => ({
    rank: i + 1,
    participant_id: r.p.id,
    full_name: fullName(r.p),
    direction: r.p.direction ?? '',
    group_name: r.p.groupName ?? '',
    day_points: r.pts,
  }));
}

async function fetchPiggybankRows(req: AdminRequest, params: CustomParams) {
  const mockReq = {
    ...req,
    query: {
      direction: params.direction,
      group: params.group,
      participantId: params.participantId ? String(params.participantId) : undefined,
    },
  } as unknown as AdminRequest;
  const rows = await queryPiggybankForExport(mockReq);
  return rows.map(r => ({
    participant_id: '',
    full_name: r.participantName,
    direction: r.directionName ?? '',
    tag: r.tags,
    text: r.text,
    source: r.source ?? '',
    created_at: r.createdAt,
  }));
}

async function buildRowsForSource(
  req: AdminRequest,
  source: ExportSourceId,
  params: CustomParams,
): Promise<Record<string, unknown>[]> {
  switch (source) {
    case 'answers':
      return fetchAnswerRows('answers', params);
    case 'reflections':
      return fetchAnswerRows('reflections', params);
    case 'participants':
      return fetchParticipantRows(params);
    case 'tasks':
      return fetchTaskRows(params);
    case 'rating_day':
      return fetchRatingDayRows(params.day ?? 1, params);
    case 'piggybank':
      return fetchPiggybankRows(req, params);
    default:
      return [];
  }
}

export async function writeCustomExportToFile(
  req: AdminRequest,
  opts: {
    source: ExportSourceId;
    params: CustomParams;
    columns: string[];
    title: string;
    historyId: string;
  },
): Promise<{ filePath: string; fileName: string; byteSize: number }> {
  await ensureStorageDir();
  const keys = opts.columns.length ? opts.columns : [...ANSWER_ROW_HEADERS];
  const labels = resolveColumnLabels(opts.source, keys);
  const rows = await buildRowsForSource(req, opts.source, opts.params);
  const wb = await createWorkbook();
  const ws = wb.addWorksheet('Данные');
  ws.addRow(labels.map(c => c.label));
  for (const row of rows) {
    ws.addRow(pickColumns(row, keys));
  }
  const safeName = opts.title.replace(/[^\w\u0400-\u04FF.-]+/g, '_').slice(0, 80) || 'export';
  const fileName = `${safeName}_${opts.historyId.slice(0, 8)}.xlsx`;
  const filePath = path.join(getExportStorageDir(), fileName);
  await wb.xlsx.writeFile(filePath);
  const stat = await fs.stat(filePath);
  return { filePath, fileName, byteSize: stat.size };
}

export async function createCustomExport(
  req: AdminRequest,
  body: { source: ExportSourceId; params?: CustomParams; columns?: string[]; title?: string },
) {
  await cleanupExpiredExports();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TTL_DAYS);
  const title = body.title?.trim() || `Кастом: ${body.source}`;
  const [pending] = await db.insert(exportHistory).values({
    adminId: req.adminId ?? null,
    title,
    source: body.source,
    params: body.params ?? {},
    columns: body.columns ?? [],
    status: 'pending',
    expiresAt,
  }).returning();
  try {
    const file = await writeCustomExportToFile(req, {
      source: body.source,
      params: body.params ?? {},
      columns: body.columns ?? [],
      title,
      historyId: pending.id,
    });
    const [ready] = await db.update(exportHistory).set({
      status: 'ready',
      filePath: file.filePath,
      fileName: file.fileName,
      byteSize: file.byteSize,
    }).where(eq(exportHistory.id, pending.id)).returning();
    await logAdminAction({
      req,
      actionType: 'export.custom',
      section: 'export',
      objectId: pending.id,
      newValue: { source: body.source, title, fileName: file.fileName },
    });
    return ready;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(exportHistory).set({ status: 'failed', errorMessage: msg }).where(eq(exportHistory.id, pending.id));
    throw err;
  }
}

export async function listExportHistory(limit = 50) {
  await cleanupExpiredExports();
  const rows = await db.select().from(exportHistory)
    .orderBy(desc(exportHistory.createdAt))
    .limit(Math.min(limit, 200));
  return rows.map(r => ({
    id: r.id,
    adminId: r.adminId,
    title: r.title,
    source: r.source,
    params: r.params,
    status: r.status,
    fileName: r.fileName,
    byteSize: r.byteSize,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export async function getExportHistoryFile(id: string) {
  const [row] = await db.select().from(exportHistory).where(eq(exportHistory.id, id)).limit(1);
  if (!row || row.status !== 'ready' || !row.filePath || !row.fileName) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  try {
    await fs.access(row.filePath);
  } catch {
    return null;
  }
  return row;
}

export async function recordPresetExport(
  req: AdminRequest,
  body: { preset: string; title: string; source: ExportSourceId; params?: CustomParams; columns?: string[] },
) {
  return createCustomExport(req, {
    source: body.source,
    params: body.params,
    columns: body.columns,
    title: body.title || body.preset,
  });
}
