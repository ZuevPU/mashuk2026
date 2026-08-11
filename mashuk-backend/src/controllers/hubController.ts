import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { resolveAnalyticsFilters } from '../services/analytics/analyticsQuery.js';
import { buildDayResultsDashboard } from '../services/analytics/dayResultsDashboard.js';
import {
  buildHubForumDashboard,
  buildHubForumExtras,
} from '../services/analytics/hubForumDashboard.js';
import { buildHubGroupsDashboard } from '../services/analytics/hubGroupsDashboard.js';
import { buildPiggybankDirectionMatrix } from '../services/analytics/piggybankDirectionMatrix.js';
import { buildParticipantDayFeed } from '../services/analytics/participantDayFeed.js';
import { buildActivityHubDashboard } from '../services/analytics/activityHubDashboard.js';
import { buildAfterBlocksHubDashboard } from '../services/analytics/afterBlocksHubDashboard.js';
import { buildDayStatsHubDashboard } from '../services/analytics/dayStatsHubDashboard.js';
import { buildExchangeHubDashboard } from '../services/analytics/exchangeHubDashboard.js';
import { buildPiggybankHubDashboard } from '../services/analytics/piggybankHubDashboard.js';
import { buildStateDashboard } from '../services/analytics/stateDashboard.js';

export async function getHubForumHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildHubForumDashboard(filters, req));
}

export async function getHubForumExtrasHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildHubForumExtras(filters, req));
}

export async function getHubDayResultsHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildDayResultsDashboard(filters, req));
}

export async function getHubStateHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildStateDashboard(filters, req));
}

export async function getHubActivityHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildActivityHubDashboard(filters, req));
}

export async function getHubPiggybankHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildPiggybankHubDashboard(filters, req));
}

export async function getHubAfterBlocksHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildAfterBlocksHubDashboard(filters, req));
}

export async function getHubExchangeHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildExchangeHubDashboard(filters, req));
}

export async function getHubStatsHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildDayStatsHubDashboard(filters, req));
}

export async function getHubGroupsHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildHubGroupsDashboard(filters, req));
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
