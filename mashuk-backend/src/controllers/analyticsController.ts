import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { recalculateDailyStats } from '../services/analyticsService.js';
import { resolveAnalyticsFilters } from '../services/analytics/analyticsQuery.js';
import {
  buildAnalyticsMeta,
  composeLegacyDashboards,
} from '../services/analytics/index.js';
import { buildPulseDashboard } from '../services/analytics/pulseDashboard.js';
import { buildPortraitDashboard, buildDeparturePortrait } from '../services/analytics/portraitDashboard.js';
import { buildProgramDashboard } from '../services/analytics/programDashboard.js';
import { buildEveningDashboard } from '../services/analytics/eveningDashboard.js';
import { buildActivityDashboard } from '../services/analytics/activityDashboard.js';
import { buildPiggybankDashboard } from '../services/analytics/piggybankDashboard.js';
import { buildSemanticDashboard, buildClubsDashboard } from '../services/analytics/semanticDashboard.js';
import { refreshAllAnalytics } from '../services/analytics/refreshScheduler.js';
import { db } from '../db/index.js';
import { forumClubs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function getAnalyticsMetaHandler(req: AdminRequest, res: Response): Promise<void> {
  res.json(await buildAnalyticsMeta(req));
}

export async function getPulseDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildPulseDashboard(filters, req));
}

export async function getEveningDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildEveningDashboard(filters, req));
}

export async function getPortraitDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildPortraitDashboard(filters, req));
}

export async function getProgramDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildProgramDashboard(filters, req));
}

export async function getActivityDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildActivityDashboard(filters, req));
}

export async function getPiggybankDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildPiggybankDashboard(filters, req));
}

export async function getSemanticDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildSemanticDashboard(filters, req));
}

export async function getClubsDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildClubsDashboard(filters, req));
}

export async function getLegacyDashboardsHandler(req: AdminRequest, res: Response): Promise<void> {
  res.json(await composeLegacyDashboards(req));
}

export async function getDeparturePortraitHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildDeparturePortrait(filters, req));
}

export async function postAnalyticsRefreshHandler(_req: AdminRequest, res: Response): Promise<void> {
  await refreshAllAnalytics();
  res.json({ ok: true });
}

export async function patchForumClubHandler(req: AdminRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { name, description, isActive } = req.body as { name?: string; description?: string; isActive?: boolean };
  const [row] = await db.update(forumClubs).set({
    name: name ?? undefined,
    description: description ?? undefined,
    isActive: isActive ?? undefined,
    updatedAt: new Date(),
  }).where(eq(forumClubs.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json({ club: row });
}

export async function listForumClubsHandler(_req: AdminRequest, res: Response): Promise<void> {
  const clubs = await db.select().from(forumClubs);
  res.json({ clubs });
}

// keep settings recalc alias
export async function triggerAnalyticsRecalcHandler(_req: AdminRequest, res: Response): Promise<void> {
  await recalculateDailyStats();
  res.json({ ok: true });
}
