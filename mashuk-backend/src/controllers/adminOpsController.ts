import { Response } from 'express';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminActionsLog, adminUsers, answers, delayedSurvey, medals, participants,
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

const ALLOWED_ROLES = ['admin', 'moderator', 'analyst', 'director'];

export const listAdminActions = async (req: AdminRequest, res: Response): Promise<void> => {
  const critical = req.query.critical === '1' || req.query.critical === 'true';
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = critical
    ? await db.select().from(adminActionsLog).where(eq(adminActionsLog.isCritical, true))
      .orderBy(desc(adminActionsLog.createdAt)).limit(limit)
    : await db.select().from(adminActionsLog).orderBy(desc(adminActionsLog.createdAt)).limit(limit);
  res.json({ actions: rows });
};

export const listAdminUsers = async (_req: AdminRequest, res: Response): Promise<void> => {
  const list = await db.select({
    id: adminUsers.id,
    login: adminUsers.login,
    role: adminUsers.role,
    vkId: adminUsers.vkId,
    isActive: adminUsers.isActive,
    createdAt: adminUsers.createdAt,
  }).from(adminUsers);
  res.json({ users: list });
};

export const createAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const { login, password, role } = req.body;
  if (!login || !password) {
    res.status(400).json({ error: 'login and password required' });
    return;
  }
  const r = role && ALLOWED_ROLES.includes(role) ? role : 'moderator';
  const passwordHash = await hashPassword(password);
  try {
    const [created] = await db.insert(adminUsers).values({
      login: String(login).trim(),
      passwordHash,
      role: r,
      isActive: true,
    }).returning();
    await logAdminAction({
      req, actionType: 'admin_user_change', section: 'admins', objectId: created.id,
      newValue: { login: created.login, role: created.role }, isCritical: true,
    });
    res.json({ user: { id: created.id, login: created.login, role: created.role, isActive: created.isActive } });
  } catch {
    res.status(400).json({ error: 'Login already exists' });
  }
};

export const updateAdminUser = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const patch: Partial<typeof adminUsers.$inferInsert> = {};
  if (req.body.role && ALLOWED_ROLES.includes(req.body.role)) patch.role = req.body.role;
  if (typeof req.body.isActive === 'boolean') patch.isActive = req.body.isActive;
  if (req.body.password) patch.passwordHash = await hashPassword(req.body.password);
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No fields' });
    return;
  }
  const [updated] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  await logAdminAction({
    req, actionType: 'admin_user_change', section: 'admins', objectId: id,
    newValue: { role: updated.role, isActive: updated.isActive }, isCritical: true,
  });
  res.json({ user: { id: updated.id, login: updated.login, role: updated.role, isActive: updated.isActive } });
};

export const getQuestionAnswerCount = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select({ count: count() }).from(answers).where(eq(answers.questionId, id));
  res.json({ questionId: id, answerCount: row?.count ?? 0 });
};

export const crudMedals = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ medals: await db.select().from(medals).orderBy(desc(medals.createdAt)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const [m] = await db.insert(medals).values({
      name: req.body.name,
      description: req.body.description,
      conditionRule: req.body.conditionRule,
      iconUrl: req.body.iconUrl,
      category: req.body.category,
      level: req.body.level || 'bronze',
      awardType: req.body.awardType || 'manual',
      visibility: req.body.visibility || 'open',
      isActive: true,
    }).returning();
    res.json({ medal: m });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [m] = await db.update(medals).set({
      name: req.body.name,
      description: req.body.description,
      conditionRule: req.body.conditionRule,
      iconUrl: req.body.iconUrl,
      category: req.body.category,
      level: req.body.level,
      awardType: req.body.awardType,
      visibility: req.body.visibility,
      isActive: req.body.isActive,
    }).where(eq(medals.id, id)).returning();
    if (!m) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ medal: m });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    await db.delete(userMedals).where(eq(userMedals.medalId, id));
    const [d] = await db.delete(medals).where(eq(medals.id, id)).returning();
    if (!d) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
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
  const list = await db.select({
    id: participants.id,
    firstName: participants.firstName,
    lastName: participants.lastName,
    direction: participants.direction,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    hideFromLeaderboard: participants.hideFromLeaderboard,
  }).from(participants);

  const rows = list
    .filter(p => !p.hideFromLeaderboard)
    .map(p => ({
      ...p,
      total: (p.pathPoints ?? 0) + (p.experiencePoints ?? 0),
      score: track === 'path' ? (p.pathPoints ?? 0)
        : track === 'experience' ? (p.experiencePoints ?? 0)
          : (p.pathPoints ?? 0) + (p.experiencePoints ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));

  res.json({ track, leaders: rows });
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
