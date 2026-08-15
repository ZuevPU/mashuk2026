import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { publicUploadUrl } from '../utils/uploadImageStorage.js';
import { db } from '../db/index.js';
import { participantPushDeliveries } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { refreshNotificationStats } from '../services/pushService.js';
import { fireWebhookTrigger } from '../services/pushTriggerRunner.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

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
      res.json({ url: photoUrl });
      return;
    }

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Expected dataUrl (base64 image) or photoUrl' });
      return;
    }

    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid dataUrl format' });
      return;
    }

    const ext = match[1].split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image too large (max 5MB)' });
      return;
    }

    ensureUploadDir();
    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    res.json({ url: publicUploadUrl(filename) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
