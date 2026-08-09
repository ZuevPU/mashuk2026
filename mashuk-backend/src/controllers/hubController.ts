import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { resolveAnalyticsFilters } from '../services/analytics/analyticsQuery.js';
import { buildHubForumDashboard } from '../services/analytics/hubForumDashboard.js';
import { buildPiggybankDirectionMatrix } from '../services/analytics/piggybankDirectionMatrix.js';
import { buildParticipantDayFeed } from '../services/analytics/participantDayFeed.js';

export async function getHubForumHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildHubForumDashboard(filters, req));
}

export async function getHubPiggybankMatrixHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildPiggybankDirectionMatrix(filters, req));
}

export async function getHubParticipantFeedHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  const raw = req.query.participantId;
  const participantId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(participantId) || participantId <= 0) {
    res.status(400).json({ error: 'participantId required' });
    return;
  }
  res.json(await buildParticipantDayFeed(participantId, filters, req));
}
