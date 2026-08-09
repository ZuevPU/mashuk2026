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
import { buildAfterBlocksDashboard } from '../services/analytics/afterBlocksDashboard.js';
import { buildStateCheckDashboard } from '../services/analytics/stateCheckDashboard.js';
import { buildDirectionDashboard } from '../services/analytics/directionDashboard.js';
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
  const [pulse, stateCheckRaw] = await Promise.all([
    buildPulseDashboard(filters, req),
    buildStateCheckDashboard(filters, req),
  ]);
  const stateCheck = stateCheckRaw as typeof stateCheckRaw & {
    emotionalPulse?: {
      avgEnergy?: number | null;
      riskFatiguePct?: number | null;
      phaseCounts?: Record<string, number>;
      topReasons?: { token: string; count: number }[];
      energyByDay?: { day: number; avg: number | null; responses: number }[];
      energyByDirectionDay?: { direction: string; day: number; avg: number | null; responses: number }[];
    };
  };
  const scPulse = stateCheck.emotionalPulse ?? {};
  res.json({
    ...pulse,
    emotionalPulse: {
      ...pulse.emotionalPulse,
      avgEnergy: scPulse.avgEnergy ?? null,
      riskFatiguePct: scPulse.riskFatiguePct ?? null,
      phaseCounts: scPulse.phaseCounts ?? pulse.activity?.stateChecks ?? null,
      topReasons: scPulse.topReasons ?? pulse.stateReasons?.topTokens ?? [],
      energyByDay: scPulse.energyByDay ?? [],
      energyByDirectionDay: scPulse.energyByDirectionDay ?? [],
    },
    /** Операционка проверки состояния (бывший отдельный дашборд) */
    stateCheck: {
      activity: stateCheck.activity,
      byDirection: stateCheck.byDirection,
      questions: stateCheck.questions,
      exportPath: stateCheck.exportPath,
      diagnostics: stateCheck.diagnostics,
      daySeries: stateCheck.daySeries,
      byDirectionDaySeries: stateCheck.byDirectionDaySeries,
    },
  });
}

export async function getEveningDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildEveningDashboard(filters, req));
}

export async function getAfterBlocksDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildAfterBlocksDashboard(filters, req));
}

/** Совместимость: старый URL редиректит логику в объединённый пульс. */
export async function getStateCheckDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  return getPulseDashboardHandler(req, res);
}

export async function getDirectionDashboardHandler(req: AdminRequest, res: Response): Promise<void> {
  const filters = await resolveAnalyticsFilters(req);
  res.json(await buildDirectionDashboard(filters, req));
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
