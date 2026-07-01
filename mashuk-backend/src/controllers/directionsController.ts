import { Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions } from '../db/schema.js';

export const listDirections = async (_req: unknown, res: Response): Promise<void> => {
  try {
    const list = await db.select().from(directions).where(eq(directions.isHidden, false));
    res.json({ directions: list });
  } catch (error) {
    console.error('listDirections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
