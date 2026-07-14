import { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { VkAuthRequest } from './vkAuth.js';

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

  const [user] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);
  if (!user || !user.onboardingCompletedAt) {
    res.status(403).json({ error: 'Registration required', status: 'needs_registration' });
    return;
  }

  req.participant = user;
  next();
};
