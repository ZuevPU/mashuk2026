import { recalculateDailyStats } from '../analyticsService.js';

const DEFAULT_MIN = 15;

export function analyticsRefreshMs(): number {
  const n = Number(process.env.ANALYTICS_REFRESH_MINUTES);
  const minutes = Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN;
  return minutes * 60 * 1000;
}

export function semanticV2Enabled(): boolean {
  return process.env.SEMANTIC_ANALYTICS_V2 === 'true';
}

export async function refreshAllAnalytics(): Promise<void> {
  await recalculateDailyStats();
}

export function startAnalyticsRefreshScheduler(): void {
  const ms = analyticsRefreshMs();
  void refreshAllAnalytics().catch(err => console.error('[analytics] initial refresh', err));
  setInterval(() => {
    refreshAllAnalytics().catch(err => console.error('[analytics] scheduled refresh', err));
  }, ms);
  console.log(`[analytics] refresh every ${ms / 60000} min`);
}
