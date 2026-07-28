import { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { VkAuthRequest } from './vkAuth.js';
import { findParticipantByVkInActiveShift } from '../services/shiftService.js';

export interface ParticipantRequest extends VkAuthRequest {
  participant?: typeof participants.$inferSelect;
}

export const requireParticipant = async (
  req: ParticipantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const vkUserId = req.vkUserId;
  if (!vkUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await findParticipantByVkInActiveShift(vkUserId);
  if (!user || !user.onboardingCompletedAt) {
    res.status(403).json({ error: 'Registration required', status: 'needs_registration' });
    return;
  }
  if (user.selfDeletedAt) {
    res.status(403).json({ error: 'Account removed from program', status: 'self_deleted' });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({
      error: user.blockReason || 'Participant blocked',
      status: 'blocked',
      blockReason: user.blockReason || 'Доступ ограничен организаторами',
    });
    return;
  }

  db.update(participants)
    .set({ lastActiveAt: new Date() })
    .where(eq(participants.id, user.id))
    .catch(() => {});

  req.participant = user;
  next();
};
