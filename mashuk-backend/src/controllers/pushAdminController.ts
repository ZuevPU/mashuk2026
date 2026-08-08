import { Response } from 'express';
import crypto from 'crypto';
import {
  and, desc, eq, gte, lte, count,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminPushNotifications, adminUsers, participants, participantPushDeliveries, pushTemplates, pushTriggerFires,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { formatAudienceLabel, type AudiencePayload } from '../services/pushAudienceResolve.js';
import {
  expandPushPlaceholders,
} from '../services/pushPlaceholderExpand.js';
import {
  fireAdminPushNow,
} from '../services/pushCampaignExecutor.js';
import {
  refreshNotificationStats, sendTestCampaignToParticipant, describeDeliveryStatus,
} from '../services/pushService.js';
import { pushNotificationCreateSchema, pushNotificationUpdateSchema } from '../validation/adminSchemas.js';
import { resolveAdminShiftId } from '../services/shiftService.js';

function rowToApi(row: typeof adminPushNotifications.$inferSelect) {
  const payload = (row.audiencePayload ?? {}) as AudiencePayload;
  return {
    ...row,
    audienceLabel: formatAudienceLabel(row.audienceType ?? 'all', payload),
  };
}

function parseBody(raw: unknown) {
  const parsed = pushNotificationCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten() } as const;
  }
  return { data: parsed.data } as const;
}

function toDbValues(data: Record<string, unknown>, adminId?: number) {
  const publishAt = data.publishAt ? new Date(String(data.publishAt)) : null;
  const visibleUntil = data.visibleUntil ? new Date(String(data.visibleUntil)) : null;
  const programDate = data.programDate ? new Date(String(data.programDate)) : null;
  return {
    internalName: data.internalName as string | undefined,
    pushTitle: data.pushTitle as string | undefined,
    body: String(data.body ?? ''),
    icon: data.icon as string | undefined,
    imageUrl: data.imageUrl as string | undefined,
    notificationType: (data.notificationType as string) ?? 'reminder',
    status: (data.status as string) ?? 'draft',
    programDay: data.programDay != null ? Number(data.programDay) : null,
    programDate,
    publishAt,
    visibleUntil,
    sendMode: (data.sendMode as string) ?? 'now',
    triggerConfig: data.triggerConfig ?? {},
    audienceType: (data.audienceType as string) ?? 'all',
    audiencePayload: data.audiencePayload ?? {},
    templateId: data.templateId != null ? Number(data.templateId) : null,
    createdByAdminId: adminId ?? null,
    updatedAt: new Date(),
  };
}

export const listPushNotifications = async (req: AdminRequest, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  const notificationType = req.query.type as string | undefined;
  const audienceType = req.query.audience as string | undefined;
  const sentFrom = req.query.sentFrom as string | undefined;
  const sentTo = req.query.sentTo as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(adminPushNotifications.status, status));
  if (notificationType) conditions.push(eq(adminPushNotifications.notificationType, notificationType));
  if (audienceType) conditions.push(eq(adminPushNotifications.audienceType, audienceType));
  if (sentFrom) {
    const d = new Date(sentFrom);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(adminPushNotifications.sentAt, d));
  }
  if (sentTo) {
    const d = new Date(sentTo);
    if (!Number.isNaN(d.getTime())) conditions.push(lte(adminPushNotifications.sentAt, d));
  }

  let q = db.select().from(adminPushNotifications).orderBy(desc(adminPushNotifications.updatedAt)).limit(200);
  if (conditions.length) q = q.where(and(...conditions)) as typeof q;

  const items = await q;
  const [totalRow] = await db.select({ n: count() }).from(adminPushNotifications);
  const [queuedRow] = await db.select({ n: count() }).from(adminPushNotifications)
    .where(eq(adminPushNotifications.status, 'queued'));

  res.json({
    notifications: items.map(rowToApi),
    summary: { total: totalRow?.n ?? 0, queued: queuedRow?.n ?? 0 },
  });
};

export const getPushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ notification: rowToApi(row) });
};

export const createPushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(req.body);
  if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }
  const values = toDbValues(parsed.data as Record<string, unknown>, req.adminId);
  if (!values.body?.trim()) { res.status(400).json({ error: 'body required' }); return; }

  if (parsed.data.sendMode === 'trigger') {
    const cfg = parsed.data.triggerConfig as { kind?: string; token?: string } | undefined;
    if (cfg?.kind === 'webhook' && !cfg.token) {
      (values.triggerConfig as Record<string, unknown>).token = crypto.randomBytes(16).toString('hex');
    }
  }

  const shiftId = await resolveAdminShiftId(req);
  const [row] = await db.insert(adminPushNotifications).values({ ...values, shiftId }).returning();
  res.json({ notification: rowToApi(row) });
};

export const updatePushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = pushNotificationUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const patch = toDbValues(parsed.data as Record<string, unknown>);
  delete (patch as { createdByAdminId?: number }).createdByAdminId;

  const [updated] = await db.update(adminPushNotifications)
    .set(patch)
    .where(eq(adminPushNotifications.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ notification: rowToApi(updated) });
};

export const deletePushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);

  // Сначала удаляем доставки и фиксации триггеров, чтобы уведомление исчезло у участников
  await db.delete(participantPushDeliveries).where(eq(participantPushDeliveries.notificationId, id));
  await db.delete(pushTriggerFires).where(eq(pushTriggerFires.notificationId, id));

  const [deleted] = await db.delete(adminPushNotifications)
    .where(eq(adminPushNotifications.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'push_delete',
    section: 'push',
    objectId: String(id),
    oldValue: { internalName: deleted.internalName, status: deleted.status },
    isCritical: true,
  });
  res.json({ ok: true });
};

export const duplicatePushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [src] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!src) { res.status(404).json({ error: 'Not found' }); return; }

  const { id: _id, sentAt, deliveredCount, openedCount, triggerFiredAt, createdAt, ...rest } = src;
  const [copy] = await db.insert(adminPushNotifications).values({
    ...rest,
    internalName: src.internalName ? `${src.internalName} (копия)` : `Копия #${id}`,
    status: 'draft',
    sentAt: null,
    deliveredCount: 0,
    openedCount: 0,
    triggerFiredAt: null,
    createdByAdminId: req.adminId ?? null,
    updatedAt: new Date(),
  }).returning();
  res.json({ notification: rowToApi(copy) });
};

export const previewPushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const sampleParticipantId = req.body?.participantId ? Number(req.body.participantId) : undefined;
  const [n] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!n) { res.status(404).json({ error: 'Not found' }); return; }

  let p = sampleParticipantId
    ? (await db.select().from(participants).where(eq(participants.id, sampleParticipantId)).limit(1))[0]
    : (await db.select().from(participants).limit(1))[0];

  if (!p) { res.status(400).json({ error: 'No participants for preview' }); return; }

  const body = expandPushPlaceholders(n.body, p, { programDay: n.programDay });
  res.json({
    preview: {
      pushTitle: n.pushTitle,
      body,
      icon: n.icon,
      imageUrl: n.imageUrl,
      participantName: `${p.firstName} ${p.lastName}`.trim(),
    },
  });
};

export const testPushNotification = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [n] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!n) { res.status(404).json({ error: 'Not found' }); return; }

  const adminId = req.adminId;
  if (!adminId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  if (!admin?.vkId) { res.status(400).json({ error: 'Укажите VK ID в профиле администратора' }); return; }

  const [p] = await db.select().from(participants).where(eq(participants.vkId, admin.vkId)).limit(1);
  if (!p) { res.status(400).json({ error: 'Нет участника с вашим VK ID для теста' }); return; }

  const { personalizedBody, deliveryStatus } = await sendTestCampaignToParticipant(n, p.id);
  res.json({
    ok: true,
    previewBody: personalizedBody,
    deliveryStatus,
    deliveryStatusHint: describeDeliveryStatus(deliveryStatus),
  });
};

export const sendPushNotificationAction = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [n] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!n) { res.status(404).json({ error: 'Not found' }); return; }

  const mode = req.body?.mode as string | undefined;
  const useQueue = mode === 'queue' || n.sendMode === 'scheduled' || n.sendMode === 'trigger';

  if (useQueue) {
    const when = n.publishAt && n.publishAt.getTime() > Date.now()
      ? n.publishAt
      : (req.body?.publishAt ? new Date(String(req.body.publishAt)) : new Date(Date.now() + 60_000));
    await db.update(adminPushNotifications)
      .set({ status: 'queued', publishAt: when, updatedAt: new Date() })
      .where(eq(adminPushNotifications.id, id));

    if (n.sendMode === 'trigger') {
      // waits for trigger runner / webhook
    } else if (when.getTime() <= Date.now()) {
      await fireAdminPushNow(id);
    }
  } else {
    await fireAdminPushNow(id);
  }

  const [updated] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  res.json({ notification: updated ? rowToApi(updated) : null });
};

export const applyPushTemplate = async (req: AdminRequest, res: Response): Promise<void> => {
  const templateId = Number(req.params.templateId);
  const [t] = await db.select().from(pushTemplates).where(eq(pushTemplates.id, templateId)).limit(1);
  if (!t) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json({
    template: t,
    draft: {
      pushTitle: t.pushTitle ?? t.title,
      body: t.body,
      icon: t.icon,
      notificationType: t.notificationType ?? 'reminder',
      internalName: t.title ?? t.key,
    },
  });
};

export const refreshPushNotificationStats = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  await refreshNotificationStats(id);
  const [row] = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ notification: rowToApi(row) });
};
