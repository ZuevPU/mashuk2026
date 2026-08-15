import { Response } from 'express';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { resolveStoredUploadUrl, saveUploadedImage, UploadImageError } from '../utils/uploadImageStorage.js';
import { db } from '../db/index.js';
import { participantPushDeliveries } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { refreshNotificationStats } from '../services/pushService.js';
import { fireWebhookTrigger } from '../services/pushTriggerRunner.js';

export async function listActivePushBanners(participantId: number, now = new Date()) {
  return db.select().from(participantPushDeliveries)
    .where(and(
      eq(participantPushDeliveries.participantId, participantId),
      isNull(participantPushDeliveries.dismissedAt),
      or(
        isNull(participantPushDeliveries.visibleUntil),
        gt(participantPushDeliveries.visibleUntil, now),
      ),
    ))
    .orderBy(participantPushDeliveries.createdAt);
}

export const openPushBanner = async (req: ParticipantRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const participantId = req.participant!.id;
  const [row] = await db.select().from(participantPushDeliveries)
    .where(and(
      eq(participantPushDeliveries.id, id),
      eq(participantPushDeliveries.participantId, participantId),
    )).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  if (!row.openedAt) {
    await db.update(participantPushDeliveries)
      .set({ openedAt: new Date() })
      .where(eq(participantPushDeliveries.id, id));
    await refreshNotificationStats(row.notificationId);
  }
  res.json({ ok: true });
};

export const dismissPushBanner = async (req: ParticipantRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const participantId = req.participant!.id;
  const [row] = await db.select().from(participantPushDeliveries)
    .where(and(
      eq(participantPushDeliveries.id, id),
      eq(participantPushDeliveries.participantId, participantId),
    )).limit(1);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  await db.update(participantPushDeliveries)
    .set({ dismissedAt: new Date() })
    .where(eq(participantPushDeliveries.id, id));
  res.json({ ok: true });
};

export const pushWebhookTrigger = async (req: { params: { token: string } }, res: Response): Promise<void> => {
  const token = req.params.token;
  const result = await fireWebhookTrigger(token);
  if (!result.ok) {
    res.status(result.error === 'not_found' ? 404 : 409).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
};

export const adminUploadImage = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const { dataUrl, photoUrl } = req.body as { dataUrl?: string; photoUrl?: string };

    if (photoUrl && /^https?:\/\//.test(photoUrl)) {
      res.json({ url: resolveStoredUploadUrl(photoUrl) });
      return;
    }

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Expected dataUrl (base64 image) or photoUrl' });
      return;
    }

    const url = await saveUploadedImage(dataUrl);
    res.json({ url });
  } catch (err) {
    if (err instanceof UploadImageError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
