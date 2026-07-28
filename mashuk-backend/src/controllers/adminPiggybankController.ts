import { Response } from 'express';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions, participantGroups, participants, piggybank } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { entryTags, formatTagsForExport } from '../services/piggybankDict.js';

function parseListQuery(req: AdminRequest) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q: String(req.query.q || '').trim(),
    participantId: req.query.participantId ? Number(req.query.participantId) : undefined,
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
  };
}

function buildWhere(params: ReturnType<typeof parseListQuery>) {
  const conditions = [isNull(piggybank.deletedAt)];
  if (params.q) conditions.push(ilike(piggybank.text, `%${params.q}%`));
  if (params.participantId) conditions.push(eq(piggybank.participantId, params.participantId));
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
    const [d] = await db.select({ id: directions.id }).from(directions)
      .where(eq(directions.name, params.directionName)).limit(1);
    if (d) params.directionId = d.id;
  }
  if (!params.groupId && params.groupName) {
    const [g] = await db.select({ id: participantGroups.id }).from(participantGroups)
      .where(eq(participantGroups.name, params.groupName)).limit(1);
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
    .orderBy(desc(piggybank.createdAt))
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
    })),
    totalCount: Number(totalRow?.count ?? 0),
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
  const [existing] = await db.select().from(piggybank).where(and(eq(piggybank.id, id), isNull(piggybank.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const [updated] = await db.update(piggybank)
    .set({ deletedAt: new Date(), isHidden: true })
    .where(eq(piggybank.id, id))
    .returning();
  await logAdminAction({
    req,
    actionType: 'piggybank_delete',
    section: 'piggybank',
    objectId: id,
    oldValue: { text: existing.text, participantId: existing.participantId },
    isCritical: true,
  });
  res.json({ entry: updated });
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
