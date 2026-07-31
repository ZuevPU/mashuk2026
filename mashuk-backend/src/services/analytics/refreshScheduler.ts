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

export function llmProfileV2Enabled(): boolean {
  return process.env.LLM_PROFILE_V2 === 'true';
}

export function llmReflectionBonusEnabled(): boolean {
  return process.env.LLM_REFLECTION_BONUS_V2 === 'true';
}

export function semanticHeuristicsOnly(): boolean {
  return process.env.SEMANTIC_ANALYTICS_V2_HEURISTICS_ONLY === 'true'
    || process.env.SEMANTIC_ANALYTICS_V2_HEURISTICS_ONLY !== 'false';
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
  void import('../shiftService.js').then(({ autoRotateShiftIfDue }) =>
    autoRotateShiftIfDue().catch(err => console.error('[shift] auto rotate', err)),
  );
  setInterval(() => {
    void import('../shiftService.js').then(({ autoRotateShiftIfDue }) =>
      autoRotateShiftIfDue().catch(err => console.error('[shift] auto rotate', err)),
    );
  }, 6 * 60 * 60 * 1000);
  if (semanticV2Enabled()) {
    void import('./clubMatchService.js').then(({ clubFragmentMatchNightly }) =>
      clubFragmentMatchNightly().catch(err => console.error('[analytics] club match', err)),
    );
    setInterval(() => {
      void import('./clubMatchService.js').then(({ clubFragmentMatchNightly }) =>
        clubFragmentMatchNightly().catch(err => console.error('[analytics] club match', err)),
      );
    }, 24 * 60 * 60 * 1000);
  }
  console.log(`[analytics] refresh every ${ms / 60000} min; semanticV2=${semanticV2Enabled()}`);
}
