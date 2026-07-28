import crypto from 'crypto';
import { Response } from 'express';
import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminActionsLog, adminUsers, answers, delayedSurvey, directions, medals, participants,
  pdfWhitelist, userMedals, events, tasks,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { hashPassword } from '../utils/password.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { generateQrToken, buildParticipantQrUrl, buildTaskQrUrl, buildEventQrUrl } from '../services/qrService.js';
import { env } from '../config/env.js';
import { sendPushNotification } from '../services/pushService.js';
import { synthesizeOutcomes, isGigachatConfigured } from '../services/gigachatService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { isNotNull } from 'drizzle-orm';
import { ADMIN_USER_ROLES, adminUserCreateSchema, adminUserUpdateSchema, medalCreateSchema, medalUpdateSchema, parseBody } from '../validation/adminSchemas.js';
import { MEDAL_RULE_METRICS } from '../services/medalRuleMetrics.js';

const ALLOWED_ROLES = [...ADMIN_USER_ROLES];

function loginFromEmail(email: string): string {
  const base = email.split('@')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'user';
  return base;
}

async function uniqueLogin(preferred: string): Promise<string> {
  let login = preferred;
  let n = 0;
  while (n < 100) {
    const [ex] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.login, login)).limit(1);
    if (!ex) return login;
    n += 1;
    login = `${preferred}${n}`;
  }
  return `${preferred}_${Date.now()}`;
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function mapAdminUserRow(u: typeof adminUsers.$inferSelect, directionName?: string | null) {
  return {
    id: u.id,
    login: u.login,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    directionId: u.directionId,
    directionName: directionName ?? null,
    vkId: u.vkId,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export const listAdminActions = async (req: AdminRequest, res: Response): Promise<void> => {
  const critical = req.query.critical === '1' || req.query.critical === 'true';
  const reviewFilter = req.query.review as string | undefined;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const adminId = req.query.adminId ? Number(req.query.adminId) : null;
  const section = typeof req.query.section === 'string' ? req.query.section : null;
  const actionType = typeof req.query.actionType === 'string' ? req.query.actionType : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;

  const conditions = [];
  if (critical) conditions.push(eq(adminActionsLog.isCritical, true));
  if (adminId) conditions.push(eq(adminActionsLog.adminId, adminId));
  if (section) conditions.push(eq(adminActionsLog.section, section));
  if (actionType) conditions.push(eq(adminActionsLog.actionType, actionType));
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) conditions.push(gte(adminActionsLog.createdAt, dateFrom));
  if (dateTo && !Number.isNaN(dateTo.getTime())) conditions.push(lte(adminActionsLog.createdAt, dateTo));
  if (reviewFilter === 'pending') conditions.push(isNull(adminActionsLog.reviewedAt));
  if (reviewFilter === 'reviewed') conditions.push(sql`${adminActionsLog.reviewedAt} IS NOT NULL`);
  if (search) {
    conditions.push(or(
      ilike(adminActionsLog.objectId, `%${search}%`),
      ilike(adminActionsLog.comment, `%${search}%`),
      ilike(adminActionsLog.adminLogin, `%${search}%`),
    ));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ count: count() }).from(adminActionsLog).where(where);
  const rows = await db.select().from(adminActionsLog)
    .where(where)
    .orderBy(desc(adminActionsLog.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ actions: rows, total: totalRow?.count ?? 0, limit, offset });
};

export const exportAdminActionsXlsx = async (req: AdminRequest, res: Response): Promise<void> => {
  const critical = req.query.critical === '1' || req.query.critical === 'true';
  const reviewFilter = req.query.review as string | undefined;
  const adminId = req.query.adminId ? Number(req.query.adminId) : null;
  const section = typeof req.query.section === 'string' ? req.query.section : null;
  const actionType = typeof req.query.actionType === 'string' ? req.query.actionType : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;

  const conditions = [];
  if (critical) conditions.push(eq(adminActionsLog.isCritical, true));
  if (adminId) conditions.push(eq(adminActionsLog.adminId, adminId));
  if (section) conditions.push(eq(adminActionsLog.section, section));
  if (actionType) conditions.push(eq(adminActionsLog.actionType, actionType));
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) conditions.push(gte(adminActionsLog.createdAt, dateFrom));
  if (dateTo && !Number.isNaN(dateTo.getTime())) conditions.push(lte(adminActionsLog.createdAt, dateTo));
  if (reviewFilter === 'pending') conditions.push(isNull(adminActionsLog.reviewedAt));
  if (reviewFilter === 'reviewed') conditions.push(sql`${adminActionsLog.reviewedAt} IS NOT NULL`);
  if (search) {
    conditions.push(or(
      ilike(adminActionsLog.objectId, `%${search}%`),
      ilike(adminActionsLog.comment, `%${search}%`),
      ilike(adminActionsLog.adminLogin, `%${search}%`),
    ));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(adminActionsLog).where(where).orderBy(desc(adminActionsLog.createdAt)).limit(5000);

  const { createWorkbook, sendWorkbook } = await import('../services/exports/workbook.js');
  const wb = await createWorkbook();
  const ws = wb.addWorksheet('Журнал');
  ws.addRow(['Дата', 'Пользователь', 'Раздел', 'Действие', 'Объект', 'Старое', 'Новое', 'IP', 'Критичное', 'Отревьюено']);
  for (const a of rows) {
    ws.addRow([
      a.createdAt ? new Date(a.createdAt).toISOString() : '',
      a.adminLogin,
      a.section,
      a.actionType,
      a.objectId,
      a.oldValue ? JSON.stringify(a.oldValue) : '',
      a.newValue ? JSON.stringify(a.newValue) : '',
      a.ip,
      a.isCritical ? 'да' : '',
      a.reviewedAt ? 'да' : '',
    ]);
  }
  await sendWorkbook(res, wb, 'admin_actions_log.xlsx');
};

export const reviewAdminAction = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [updated] = await db.update(adminActionsLog).set({
    reviewedAt: new Date(),
    reviewedByAdminId: req.adminId ?? null,
    reviewComment: typeof req.body?.comment === 'string' ? req.body.comment : null,
  }).where(eq(adminActionsLog.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ action: updated });
};

export const rollbackAdminAction = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(adminActionsLog).where(eq(adminActionsLog.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.actionType === 'points_adjust' && row.newValue && typeof row.newValue === 'object') {
    const nv = row.newValue as { participantId?: number; points?: number; track?: string };
    const participantId = nv.participantId ?? Number(row.objectId);
    const points = Number(nv.points);
    if (participantId && Number.isFinite(points) && points !== 0) {
      req.params = { id: String(participantId) };
      req.body = {
        points: -points,
        track: nv.track === 'experience' ? 'experience' : 'path',
        reason: `rollback log #${id}`,
      };
      const { adjustParticipantPoints } = await import('./adminController.js');
      await adjustParticipantPoints(req, res);
      return;
    }
  }
  res.status(400).json({ error: 'Rollback not supported for this action type' });
};

export const listAdminUsers = async (req: AdminRequest, res: Response): Promise<void> => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const directionId = req.query.directionId ? Number(req.query.directionId) : null;

  let q = db.select({
    user: adminUsers,
    directionName: directions.name,
  }).from(adminUsers).leftJoin(directions, eq(adminUsers.directionId, directions.id));

  const all = await q;
  let filtered = all;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(r =>
      (r.user.login?.toLowerCase().includes(s))
      || (r.user.email?.toLowerCase().includes(s))
      || (r.user.fullName?.toLowerCase().includes(s)),
    );
  }
  if (role) filtered = filtered.filter(r => r.user.role === role);
  if (directionId) filtered = filtered.filter(r => r.user.directionId === directionId);

  res.json({
    total: filtered.length,
    users: filtered.map(r => mapAdminUserRow(r.user, r.directionName)),
  });
};

export const getAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select({
    user: adminUsers,
    directionName: directions.name,
  }).from(adminUsers).leftJoin(directions, eq(adminUsers.directionId, directions.id))
    .where(eq(adminUsers.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ user: mapAdminUserRow(row.user, row.directionName) });
};

export const listAdminUserActions = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = await db.select().from(adminActionsLog)
    .where(eq(adminActionsLog.adminId, id))
    .orderBy(desc(adminActionsLog.createdAt))
    .limit(limit);
  res.json({ actions: rows });
};

export const createAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = adminUserCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { fullName, email, password, role, directionId, login: loginOverride } = parsed.data;
  const r = role && ALLOWED_ROLES.includes(role) ? role : 'moderator';
  if (r === 'curator' && !directionId) {
    res.status(400).json({ error: 'directionId required for curator role' });
    return;
  }
  const pwd = password || generateTempPassword();
  const emailNorm = email?.trim().toLowerCase() || (loginOverride ? `${loginOverride.trim()}@local` : '');
  const login = loginOverride?.trim() || await uniqueLogin(loginFromEmail(emailNorm));
  const passwordHash = await hashPassword(pwd);
  try {
    const [created] = await db.insert(adminUsers).values({
      login,
      email: emailNorm || null,
      fullName: fullName?.trim() || null,
      passwordHash,
      role: r,
      directionId: directionId ?? null,
      isActive: true,
    }).returning();
    await logAdminAction({
      req, actionType: 'admin_user_change', section: 'admins', objectId: created.id,
      newValue: { login: created.login, email: created.email, role: created.role }, isCritical: true,
    });
    res.json({
      user: mapAdminUserRow(created),
      temporaryPassword: password ? undefined : pwd,
    });
  } catch {
    res.status(400).json({ error: 'Login or email already exists' });
  }
};

export const updateAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = adminUserUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [before] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: 'Not found' }); return; }

  const body = parsed.data;
  const nextRole = body.role ?? before.role ?? 'moderator';
  if (nextRole === 'curator' && !(body.directionId ?? before.directionId)) {
    res.status(400).json({ error: 'directionId required for curator role' });
    return;
  }

  const patch: Partial<typeof adminUsers.$inferInsert> = {};
  if (body.fullName != null) patch.fullName = body.fullName.trim();
  if (body.email != null) patch.email = body.email.trim().toLowerCase();
  if (body.role && ALLOWED_ROLES.includes(body.role)) patch.role = body.role;
  if (body.directionId !== undefined) patch.directionId = body.directionId;
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (body.password) patch.passwordHash = await hashPassword(body.password);
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No fields' });
    return;
  }
  const [updated] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  await logAdminAction({
    req, actionType: 'admin_user_change', section: 'admins', objectId: id,
    oldValue: { role: before.role, isActive: before.isActive },
    newValue: { role: updated.role, isActive: updated.isActive }, isCritical: true,
  });
  res.json({ user: mapAdminUserRow(updated) });
};

export const resetAdminUserPassword = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const temporaryPassword = typeof req.body?.password === 'string' && req.body.password.length >= 6
    ? req.body.password
    : generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const [updated] = await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  await logAdminAction({
    req, actionType: 'admin_user_change', section: 'admins', objectId: id,
    comment: 'password reset', isCritical: true,
  });
  res.json({ ok: true, temporaryPassword });
};

export const deleteAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (id === req.adminId) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }
  const admins = await db.select().from(adminUsers).where(eq(adminUsers.isActive, true));
  const activeAdmins = admins.filter(a => a.role === 'admin' || a.role === 'superadmin');
  const [target] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: 'Not found' }); return; }
  if ((target.role === 'admin' || target.role === 'superadmin') && activeAdmins.length <= 1) {
    res.status(400).json({ error: 'Cannot delete the last admin' });
    return;
  }
  const [deleted] = await db.delete(adminUsers).where(eq(adminUsers.id, id)).returning();
  await logAdminAction({
    req, actionType: 'admin_user_change', section: 'admins', objectId: id,
    oldValue: { login: deleted?.login, email: deleted?.email }, isCritical: true,
  });
  res.json({ ok: true });
};

export const getQuestionAnswerCount = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select({ count: count() }).from(answers).where(eq(answers.questionId, id));
  res.json({ questionId: id, answerCount: row?.count ?? 0 });
};

export const crudMedals = {
  list: async (req: AdminRequest, res: Response) => {
    const status = String(req.query.status || '');
    const category = String(req.query.category || '');
    const level = String(req.query.level || '');
    const awardType = String(req.query.awardType || '');
    const visibility = String(req.query.visibility || '');

    const conditions = [];
    if (status === 'active') conditions.push(eq(medals.isActive, true));
    if (status === 'draft') conditions.push(eq(medals.isActive, false));
    if (category) conditions.push(eq(medals.category, category));
    if (level) conditions.push(eq(medals.level, level));
    if (awardType) conditions.push(eq(medals.awardType, awardType));
    if (visibility) conditions.push(eq(medals.visibility, visibility));

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ count: count() }).from(medals).where(whereClause);
    const totalCount = Number(totalRow?.count ?? 0);

    const rows = await db.select().from(medals)
      .where(whereClause)
      .orderBy(desc(medals.createdAt));

    const awardRows = await db.select({
      medalId: userMedals.medalId,
      c: count(),
    }).from(userMedals).groupBy(userMedals.medalId);
    const awardMap = new Map(awardRows.map(r => [r.medalId, Number(r.c)]));

    res.json({
      medals: rows.map(m => ({
        ...m,
        awardedCount: awardMap.get(m.id) ?? 0,
      })),
      totalCount,
    });
  },
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(medalCreateSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const b = parsed.data;
    const [m] = await db.insert(medals).values({
      name: b.name,
      description: b.description ?? null,
      conditionRule: b.conditionRule ?? null,
      iconUrl: b.iconUrl ?? null,
      category: b.category ?? null,
      level: b.level || 'bronze',
      awardType: b.awardType || 'manual',
      visibility: b.visibility || 'open',
      isActive: b.isActive !== false,
    }).returning();
    res.json({ medal: m });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(medalUpdateSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const b = parsed.data;
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.description !== undefined) patch.description = b.description;
    if (b.conditionRule !== undefined) patch.conditionRule = b.conditionRule;
    if (b.iconUrl !== undefined) patch.iconUrl = b.iconUrl;
    if (b.category !== undefined) patch.category = b.category;
    if (b.level !== undefined) patch.level = b.level;
    if (b.awardType !== undefined) patch.awardType = b.awardType;
    if (b.visibility !== undefined) patch.visibility = b.visibility;
    if (b.isActive !== undefined) patch.isActive = b.isActive;

    const [m] = await db.update(medals).set(patch).where(eq(medals.id, id)).returning();
    if (!m) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ medal: m });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    await db.delete(userMedals).where(eq(userMedals.medalId, id));
    const [d] = await db.delete(medals).where(eq(medals.id, id)).returning();
    if (!d) { res.status(404).json({ error: 'Not found' }); return; }
    await logAdminAction({
      req, actionType: 'medal_delete', section: 'medals', objectId: id, oldValue: d, isCritical: true,
    });
    res.json({ ok: true });
  },
};

export const listMedalRuleMetrics = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ metrics: MEDAL_RULE_METRICS });
};

export const awardMedal = async (req: AdminRequest, res: Response): Promise<void> => {
  const { participantId, medalId } = req.body;
  if (!participantId || !medalId) {
    res.status(400).json({ error: 'participantId and medalId required' });
    return;
  }
  const [um] = await db.insert(userMedals).values({
    participantId: Number(participantId),
    medalId: Number(medalId),
    awardedByAdminId: req.adminId,
    way: 'manual',
  }).returning();
  const [medal] = await db.select().from(medals).where(eq(medals.id, Number(medalId))).limit(1);
  await sendPushNotification([Number(participantId)], `🏅 Ты получил медаль: ${medal?.name || 'награда'}`, 'medal_award');
  await logAdminAction({
    req, actionType: 'medal_award', section: 'medals', objectId: um.id,
    newValue: { participantId, medalId }, isCritical: true,
  });
  res.json({ userMedal: um });
};

export const generateEntityQr = async (req: AdminRequest, res: Response): Promise<void> => {
  const { type, id } = req.body as { type: 'task' | 'event' | 'participant'; id: number };
  const token = generateQrToken();
  const base = env.PUBLIC_URL || 'https://example.com';
  if (type === 'task') {
    await db.update(tasks).set({ qrToken: token }).where(eq(tasks.id, id));
    res.json({ token, url: buildTaskQrUrl(base, id, token) });
    return;
  }
  if (type === 'event') {
    await db.update(events).set({ qrToken: token }).where(eq(events.id, id));
    res.json({ token, url: buildEventQrUrl(base, id, token) });
    return;
  }
  if (type === 'participant') {
    await db.update(participants).set({ qrToken: token }).where(eq(participants.id, id));
    res.json({ token, url: buildParticipantQrUrl(base, id, token) });
    return;
  }
  res.status(400).json({ error: 'type must be task|event|participant' });
};

export const getLeaderboard = async (req: AdminRequest, res: Response): Promise<void> => {
  const track = (req.query.track as string) || 'total';
  const scope = ((req.query.scope as string) || 'total') as 'total' | 'day' | 'shift';
  const day = req.query.day != null ? Number(req.query.day) : undefined;
  const list = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: participants.direction,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
    forumPoints: participants.forumPoints,
    hideFromLeaderboard: participants.hideFromLeaderboard,
  }).from(participants);

  const visible = list.filter(p => !p.hideFromLeaderboard);
  const ids = visible.map(p => p.id);
  const { computeLeaderboardScores } = await import('../services/leaderboardService.js');
  const { participantRatingScore: ratingScoreFn } = await import('../services/pointsService.js');

  let scoreMap: Map<number, number>;
  if (scope === 'total' && track === 'total') {
    scoreMap = new Map(ids.map(id => {
      const p = visible.find(x => x.id === id)!;
      return [id, ratingScoreFn(p)];
    }));
  } else {
    scoreMap = await computeLeaderboardScores(ids, {
      scope: scope === 'day' ? 'day' : scope === 'shift' ? 'shift' : 'total',
      day: Number.isFinite(day) ? day : undefined,
      track,
    });
  }

  const rows = visible
    .map(p => ({
      ...p,
      score: scoreMap.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      direction: p.direction,
      score: p.score,
    }));

  res.json({
    track,
    scope,
    day: day ?? null,
    participantCount: rows.length,
    leaders: rows,
  });
};

export const setPdfWhitelist = async (req: AdminRequest, res: Response): Promise<void> => {
  const { participantId, enabled, notes } = req.body;
  if (!participantId) {
    res.status(400).json({ error: 'participantId required' });
    return;
  }
  const [existing] = await db.select().from(pdfWhitelist)
    .where(eq(pdfWhitelist.participantId, Number(participantId))).limit(1);
  if (existing) {
    const [u] = await db.update(pdfWhitelist)
      .set({ enabled: enabled !== false, notes, updatedAt: new Date() })
      .where(eq(pdfWhitelist.id, existing.id)).returning();
    res.json({ entry: u });
    return;
  }
  const [c] = await db.insert(pdfWhitelist).values({
    participantId: Number(participantId),
    enabled: enabled !== false,
    notes,
  }).returning();
  res.json({ entry: c });
};

export const listPdfWhitelist = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ entries: await db.select().from(pdfWhitelist) });
};

export const buildParticipantPdfText = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [wl] = await db.select().from(pdfWhitelist).where(eq(pdfWhitelist.participantId, id)).limit(1);
  if (!wl?.enabled) {
    res.status(403).json({ error: 'Participant not on PDF whitelist' });
    return;
  }
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  const ans = await db.select().from(answers).where(eq(answers.participantId, id));
  const um = await db.select().from(userMedals).where(eq(userMedals.participantId, id));

  let outcomes = Array.isArray(p.outcomesEdited) || typeof p.outcomesEdited === 'object'
    ? JSON.stringify(p.outcomesEdited)
    : null;
  if (!outcomes && isGigachatConfigured()) {
    const texts = ans.map(a => typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData)).filter(Boolean);
    outcomes = await synthesizeOutcomes(texts as string[]);
  }

  const body = [
    `Итоговый профиль: ${p.firstName} ${p.lastName}`,
    `Направление: ${p.direction || '—'}`,
    `Роль старт: ${p.pedagogicalRole || '—'}`,
    `Сильная: ${p.strongRole || '—'} · Рост: ${p.growthRole || '—'}`,
    `Путь: ${p.pathPoints} · Опыт: ${p.experiencePoints}`,
    `Точка А: ${JSON.stringify(p.goalAnswers || [])}`,
    `Точка Б: ${JSON.stringify(p.pointBAnswers || [])}`,
    `Что получилось: ${outcomes || '—'}`,
    `Медалей: ${um.length}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=profile_${id}.txt`);
  res.send('\uFEFF' + body);
};

export const getAnalyticsDashboards = async (req: AdminRequest, res: Response): Promise<void> => {
  const mode = (req.query.mode as string) || 'today';
  const day = req.query.day ? Number(req.query.day) : null;

  const allP = await db.select().from(participants);
  const registered = allP.filter(p => p.onboardingCompletedAt).length;
  const roleDist: Record<string, number> = {};
  for (const p of allP) {
    const k = p.pedagogicalRole || 'none';
    roleDist[k] = (roleDist[k] || 0) + 1;
  }

  const ans = await db.select().from(answers);
  const depths: Record<string, number> = {};
  for (const a of ans) {
    const text = typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData || '');
    const d = inferReflectionDepth(text) || '—';
    depths[d] = (depths[d] || 0) + 1;
  }

  res.json({
    mode,
    day,
    pulse: {
      registered,
      totalAnswers: ans.length,
    },
    portrait: {
      roleDistribution: roleDist,
    },
    reflectionDepth: depths,
    activity: {
      pathLeaders: allP
        .map(p => ({ name: `${p.firstName} ${p.lastName}`, path: p.pathPoints, exp: p.experiencePoints }))
        .sort((a, b) => (b.path ?? 0) - (a.path ?? 0))
        .slice(0, 10),
    },
    gigachat: { configured: isGigachatConfigured() },
  });
};

export const scheduleDelayedSurvey = async (req: AdminRequest, res: Response): Promise<void> => {
  const weeks = Number(req.body.weeks) || 7;
  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + weeks * 7);
  const onboarded = await db.select({ id: participants.id }).from(participants)
    .where(isNotNull(participants.onboardingCompletedAt));
  let n = 0;
  for (const p of onboarded) {
    await db.insert(delayedSurvey).values({
      participantId: p.id,
      scheduledAt,
      status: 'pending',
      payload: { type: 'post_forum_6_8_weeks' },
    });
    n += 1;
  }
  res.json({ ok: true, scheduled: n, scheduledAt });
};

export const importDirectionDiagnosis = async (req: AdminRequest, res: Response): Promise<void> => {
  // Wave F: принять массив { vkId, pedagogicalRole?, goalAnswers? }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let updated = 0;
  for (const row of rows) {
    if (!row.vkId) continue;
    const [p] = await db.select().from(participants).where(eq(participants.vkId, Number(row.vkId))).limit(1);
    if (!p) continue;
    const patch: Partial<typeof participants.$inferInsert> = {};
    if (row.pedagogicalRole) patch.pedagogicalRole = row.pedagogicalRole;
    if (row.goalAnswers) patch.goalAnswers = row.goalAnswers;
    if (Object.keys(patch).length) {
      await db.update(participants).set(patch).where(eq(participants.id, p.id));
      updated += 1;
    }
  }
  await logAdminAction({
    req, actionType: 'import_diagnosis', section: 'integrations',
    newValue: { updated, total: rows.length }, isCritical: true,
  });
  res.json({ ok: true, updated });
};
