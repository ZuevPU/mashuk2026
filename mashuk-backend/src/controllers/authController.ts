import { Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, directions } from '../db/schema.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';

export const getMe = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [user] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);

    if (!user) {
      res.json({ status: 'needs_registration', vkUserId });
      return;
    }

    res.json({ status: 'ok', user });
  } catch (error) {
    console.error('getMe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const register = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { firstName, lastName, directionId } = req.body;
    if (!directionId) {
      res.status(400).json({ error: 'directionId is required' });
      return;
    }

    const [dir] = await db.select().from(directions).where(eq(directions.id, Number(directionId))).limit(1);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const [existing] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);
    if (existing) {
      res.json({ status: 'ok', user: existing });
      return;
    }

    const [newUser] = await db.insert(participants).values({
      vkId: vkUserId,
      firstName: firstName || null,
      lastName: lastName || null,
      directionId: dir.id,
      direction: dir.name,
    }).returning();

    res.json({ status: 'ok', user: newUser });
  } catch (error) {
    console.error('register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
