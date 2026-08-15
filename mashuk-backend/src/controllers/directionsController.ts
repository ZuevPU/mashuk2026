import { Request, Response } from 'express';
import { listDirectionsForShift } from '../services/shiftCatalogs.js';
import {
  listPublishedShiftsForParticipants,
  requestedShiftIdFromReq,
} from '../services/shiftService.js';

async function resolveDirectionsShiftId(req: Request): Promise<number | null> {
  const hasQuery = req.query.shiftId != null && String(req.query.shiftId).trim() !== '';
  if (hasQuery) {
    const fromQuery = Number(req.query.shiftId);
    return Number.isInteger(fromQuery) && fromQuery > 0 ? fromQuery : null;
  }
  const fromHeader = requestedShiftIdFromReq(req);
  if (fromHeader) return fromHeader;
  const published = await listPublishedShiftsForParticipants();
  if (published.length === 1) return published[0].id;
  return null;
}

export const listDirections = async (req: Request, res: Response): Promise<void> => {
  try {
    const shiftId = await resolveDirectionsShiftId(req);
    if (!shiftId) {
      res.json({ directions: [] });
      return;
    }
    const { isSelfServeDirection } = await import('../services/leaderboardQuery.js');
    const list = (await listDirectionsForShift(shiftId)).filter(isSelfServeDirection);
    res.json({ directions: list });
  } catch (error) {
    console.error('listDirections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
