import { Response } from 'express';
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions, participantGroups, participants, piggybank } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { entryTags, formatTagsForExport } from '../services/piggybankDict.js';
import { buildParticipantNameMatch } from '../services/participantsList.js';
import {
  restorePiggybankEntry,
  softDeletePiggybankEntry,
} from '../services/piggybankService.js';

function parseListQuery(req: AdminRequest) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const onlyDeleted = req.query.onlyDeleted === 'true' || req.query.onlyDeleted === '1'
    || req.query.list === 'deleted';
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q: String(req.query.q || '').trim(),
    participantId: req.query.participantId ? Number(req.query.participantId) : undefined,
    participantQ: String(req.query.participantQ || '').trim(),
    directionId: req.query.directionId ? Number(req.query.directionId) : undefined,
    groupId: req.query.groupId ? Number(req.query.groupId) : undefined,
    directionName: String(req.query.direction || '').trim(),
    groupName: String(req.query.group || '').trim(),
    forumDay: req.query.forumDay
      ? Number(req.query.forumDay)
      : (req.query.day ? Number(req.query.day) : undefined),
    tag: String(req.query.tag || '').trim(),
    source: String(req.query.source || '').trim(),
    shiftId: req.query.shiftId ? Number(req.query.shiftId) : undefined,
    onlyDeleted,
  };
}

function buildWhere(params: ReturnType<typeof parseListQuery>) {
  const conditions = [
    params.onlyDeleted ? isNotNull(piggybank.deletedAt) : isNull(piggybank.deletedAt),
  ];
  if (params.q) conditions.push(ilike(piggybank.text, `%${params.q}%`));
  if (params.participantId && !Number.isNaN(params.participantId)) {
    conditions.push(eq(piggybank.participantId, params.participantId));
  } else if (params.participantQ) {
    const nameMatch = buildParticipantNameMatch(params.participantQ);
    if (nameMatch) conditions.push(nameMatch);
  }
  if (params.forumDay) conditions.push(eq(piggybank.forumDay, params.forumDay));
  if (params.source) conditions.push(eq(piggybank.source, params.source));
  if (params.tag) {
    conditions.push(or(
      eq(piggybank.tag, params.tag),
      sql`${piggybank.tags} @> ${JSON.stringify([params.tag])}::jsonb`,
    )!);
  }
  if (params.directionId) conditions.push(eq(participants.directionId, params.directionId));
  if (params.groupId) conditions.push(eq(participants.groupId, params.groupId));
  if (params.shiftId && !Number.isNaN(params.shiftId)) {
    conditions.push(eq(participants.shiftId, params.shiftId));
  }
  return and(...conditions);
}

async function resolveCohortIds(params: ReturnType<typeof parseListQuery>) {
  if (!params.directionId && params.directionName) {
    const dirWhere = params.shiftId
      ? and(eq(directions.name, params.directionName), eq(directions.shiftId, params.shiftId))
      : eq(directions.name, params.directionName);
    const [d] = await db.select({ id: directions.id }).from(directions)
      .where(dirWhere).limit(1);
    if (d) params.directionId = d.id;
  }
  if (!params.groupId && params.groupName) {
    const groupWhere = params.shiftId
      ? and(eq(participantGroups.name, params.groupName), eq(participantGroups.shiftId, params.shiftId))
      : eq(participantGroups.name, params.groupName);
    const [g] = await db.select({ id: participantGroups.id }).from(participantGroups)
      .where(groupWhere).limit(1);
    if (g) params.groupId = g.id;
  }
  return params;
}

export async function listPiggybankEntries(req: AdminRequest, res: Response): Promise<void> {
  const params = await resolveCohortIds(parseListQuery(req));
  const whereClause = buildWhere(params);

  const baseFrom = db.select({
    e: piggybank,
    p: participants,
    dirName: directions.name,
    groupName: participantGroups.name,
  })
    .from(piggybank)
    .innerJoin(participants, eq(piggybank.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .leftJoin(participantGroups, eq(participants.groupId, participantGroups.id))
    .where(whereClause)
    .orderBy(desc(params.onlyDeleted ? piggybank.deletedAt : piggybank.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  const rows = await baseFrom;

  const [totalRow] = await db.select({ count: count() })
    .from(piggybank)
    .innerJoin(participants, eq(piggybank.participantId, participants.id))
    .where(whereClause);

  res.json({
    entries: rows.map(r => ({
      id: r.e.id,
      createdAt: r.e.createdAt,
      deletedAt: r.e.deletedAt,
      participantId: r.e.participantId,
      participantName: [r.p.firstName, r.p.lastName].filter(Boolean).join(' ') || r.p.vkId,
      directionName: r.dirName ?? null,
      groupName: r.groupName ?? null,
      text: r.e.text,
      tags: entryTags(r.e),
      source: r.e.source,
      forumDay: r.e.forumDay,
      isHidden: r.e.isHidden,
      isViolation: r.e.isViolation,
      pointsLogId: r.e.pointsLogId ?? null,
    })),
    totalCount: Number(totalRow?.count ?? 0),
    onlyDeleted: params.onlyDeleted,
  });
}

export async function patchPiggybankEntry(req: AdminRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { isHidden, isViolation } = req.body as { isHidden?: boolean; isViolation?: boolean };
  const [existing] = await db.select().from(piggybank).where(and(eq(piggybank.id, id), isNull(piggybank.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const patch: Partial<typeof piggybank.$inferInsert> = {};
  if (typeof isHidden === 'boolean') patch.isHidden = isHidden;
  if (typeof isViolation === 'boolean') patch.isViolation = isViolation;
  const [updated] = await db.update(piggybank).set(patch).where(eq(piggybank.id, id)).returning();
  await logAdminAction({
    req,
    actionType: 'piggybank_moderate',
    section: 'piggybank',
    objectId: id,
    oldValue: { isHidden: existing.isHidden, isViolation: existing.isViolation },
    newValue: patch,
  });
  res.json({ entry: updated });
}

export async function deletePiggybankEntry(req: AdminRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const result = await softDeletePiggybankEntry(id);
    await logAdminAction({
      req,
      actionType: 'piggybank_delete',
      section: 'piggybank',
      objectId: id,
      oldValue: {
        text: result.entry.text,
        participantId: result.entry.participantId,
        pointsLogId: result.pointsLogId,
      },
      newValue: {
        deletedAt: result.entry.deletedAt,
        pointsRevoked: result.pointsRevoked,
        revokeError: result.revokeError ?? null,
      },
      isCritical: true,
    });
    res.json({
      entry: result.entry,
      pointsRevoked: result.pointsRevoked,
      pointsLogId: result.pointsLogId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg === 'Not found') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    throw e;
  }
}

export async function bulkDeletePiggybankEntries(req: AdminRequest, res: Response): Promise<void> {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const parsedIds = (rawIds as unknown[])
    .map(x => Number(x))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  const ids = [...new Set<number>(parsedIds)].slice(0, 200);
  if (!ids.length) {
    res.status(400).json({ error: 'Укажите ids записей для удаления' });
    return;
  }

  let deleted = 0;
  let pointsRevoked = 0;
  const failed: Array<{ id: number; error: string }> = [];

  for (const id of ids) {
    try {
      const result = await softDeletePiggybankEntry(id);
      deleted += 1;
      if (result.pointsRevoked) pointsRevoked += 1;
      await logAdminAction({
        req,
        actionType: 'piggybank_delete',
        section: 'piggybank',
        objectId: id,
        oldValue: {
          text: result.entry.text,
          participantId: result.entry.participantId,
          pointsLogId: result.pointsLogId,
          bulk: true,
        },
        newValue: {
          deletedAt: result.entry.deletedAt,
          pointsRevoked: result.pointsRevoked,
          revokeError: result.revokeError ?? null,
        },
        isCritical: true,
      });
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : 'Error' });
    }
  }

  await logAdminAction({
    req,
    actionType: 'piggybank_bulk_delete',
    section: 'piggybank',
    newValue: { ids, deleted, pointsRevoked, failedCount: failed.length },
    isCritical: true,
  });

  res.json({ deleted, pointsRevoked, failed, requested: ids.length });
}

export async function restorePiggybankEntryAdmin(req: AdminRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const entry = await restorePiggybankEntry(id);
    await logAdminAction({
      req,
      actionType: 'piggybank_restore',
      section: 'piggybank',
      objectId: id,
      newValue: { deletedAt: null, participantId: entry.participantId },
      isCritical: true,
    });
    res.json({ entry, note: 'Запись восстановлена. Баллы повторно не начисляются.' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg === 'Not found') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (msg === 'Not deleted') {
      res.status(400).json({ error: 'Запись не удалена' });
      return;
    }
    throw e;
  }
}

export type PiggybankExportRow = {
  createdAt: Date | null;
  participantId: number;
  participantName: string;
  directionName: string | null;
  groupName: string | null;
  forumDay: number | null;
  text: string;
  tags: string;
  source: string | null;
  isHidden: boolean | null;
  isViolation: boolean | null;
};

export async function queryPiggybankForExport(req: AdminRequest): Promise<PiggybankExportRow[]> {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const params = await resolveCohortIds(parseListQuery(req));
  if (params.shiftId == null || Number.isNaN(params.shiftId)) {
    params.shiftId = await resolveAdminShiftId(req);
  }
  params.limit = 10000;
  params.offset = 0;
  const whereClause = buildWhere(params);
  const rows = await db.select({
    e: piggybank,
    p: participants,
    dirName: directions.name,
    groupName: participantGroups.name,
  })
    .from(piggybank)
    .innerJoin(participants, eq(piggybank.participantId, participants.id))
    .leftJoin(directions, eq(participants.directionId, directions.id))
    .leftJoin(participantGroups, eq(participants.groupId, participantGroups.id))
    .where(whereClause)
    .orderBy(desc(piggybank.createdAt))
    .limit(params.limit);

  return rows.map(r => ({
    createdAt: r.e.createdAt,
    participantId: r.e.participantId,
    participantName: [r.p.firstName, r.p.lastName].filter(Boolean).join(' ') || String(r.p.vkId),
    directionName: r.dirName ?? r.p.direction ?? null,
    groupName: r.groupName ?? r.p.groupName ?? null,
    forumDay: r.e.forumDay ?? null,
    text: r.e.text,
    tags: formatTagsForExport(r.e),
    source: r.e.source,
    isHidden: r.e.isHidden,
    isViolation: r.e.isViolation,
  }));
}

export async function exportPiggybankEntries(req: AdminRequest, res: Response): Promise<void> {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const rows = await queryPiggybankForExport(req);
  const { createWorkbook, sendWorkbook, sendCsv } = await import('../services/exports/workbook.js');

  if (format === 'xlsx') {
    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Копилка');
    ws.addRow(['Дата', 'ID участника', 'Участник', 'Направление', 'Группа', 'День', 'Текст', 'Теги', 'Источник', 'Скрыто', 'Нарушение']);
    for (const r of rows) {
      ws.addRow([
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
        r.participantId,
        r.participantName,
        r.directionName ?? '',
        r.groupName ?? '',
        r.forumDay ?? '',
        r.text,
        r.tags,
        r.source ?? '',
        r.isHidden ? 'да' : '',
        r.isViolation ? 'да' : '',
      ]);
    }
    await sendWorkbook(res, wb, 'piggybank.xlsx');
    return;
  }

  sendCsv(
    res,
    'piggybank.csv',
    'created_at,participant_id,participant,direction,group,day,tags,source,text,is_hidden,is_violation',
    rows.map(r => [
      r.createdAt, r.participantId, r.participantName, r.directionName ?? '', r.groupName ?? '',
      r.forumDay ?? '', r.tags, r.source ?? '', r.text,
      r.isHidden ? '1' : '0', r.isViolation ? '1' : '0',
    ]),
  );
}
