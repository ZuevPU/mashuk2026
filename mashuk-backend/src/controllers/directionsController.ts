import { Request, Response } from 'express';
import { db } from '../db/index.js';
import { shifts } from '../db/schema.js';
import { listDirectionsForShift } from '../services/shiftCatalogs.js';
import {
  listPublishedShiftsForParticipants,
  requestedShiftIdFromReq,
} from '../services/shiftService.js';

async function resolveDirectionsShiftId(req: Request): Promise<number | null> {
  const fromQuery = Number(req.query.shiftId);
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const fromHeader = requestedShiftIdFromReq(req);
  if (fromHeader) return fromHeader;
  const published = await listPublishedShiftsForParticipants();
  if (published.length) {
    return published.find(s => s.status === 'active')?.id ?? published[0].id;
  }
  const [first] = await db.select({ id: shifts.id }).from(shifts).orderBy(shifts.id).limit(1);
  return first?.id ?? null;
}

export const listDirections = async (req: Request, res: Response): Promise<void> => {
  try {
    const shiftId = await resolveDirectionsShiftId(req);
    if (!shiftId) {
      res.json({ directions: [] });
      return;
    }
    const list = await listDirectionsForShift(shiftId);
    res.json({ directions: list });
  } catch (error) {
    console.error('listDirections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
