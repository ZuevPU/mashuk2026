import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { forumSettings, shifts } from '../db/schema.js';
import { clearCache } from './cache.js';
import { isLegacyDiag6x4, normalizeOnboardingConfig } from './roleService.js';

/**
 * Persist NAV 8×6 template over legacy factory 6×4 configs on shifts / forum_settings.
 * Safe to run on every startup — no-op when already upgraded or custom non-6×4.
 */
export async function ensureNavDiagnosticsTemplateApplied(): Promise<void> {
  const shiftRows = await db
    .select({ id: shifts.id, roleDiagnosticsConfig: shifts.roleDiagnosticsConfig })
    .from(shifts);

  let upgraded = 0;
  for (const row of shiftRows) {
    const cfg = row.roleDiagnosticsConfig;
    if (!cfg || typeof cfg !== 'object') continue;
    const questions = (cfg as { questions?: unknown }).questions;
    if (!isLegacyDiag6x4(questions)) continue;
    const next = normalizeOnboardingConfig(cfg);
    await db.update(shifts).set({ roleDiagnosticsConfig: next }).where(eq(shifts.id, row.id));
    upgraded += 1;
  }

  const [fs] = await db
    .select({ id: forumSettings.id, roleDiagnosticsConfig: forumSettings.roleDiagnosticsConfig })
    .from(forumSettings)
    .limit(1);
  if (fs?.roleDiagnosticsConfig && typeof fs.roleDiagnosticsConfig === 'object') {
    const questions = (fs.roleDiagnosticsConfig as { questions?: unknown }).questions;
    if (isLegacyDiag6x4(questions)) {
      const next = normalizeOnboardingConfig(fs.roleDiagnosticsConfig);
      await db.update(forumSettings).set({ roleDiagnosticsConfig: next }).where(eq(forumSettings.id, fs.id));
      upgraded += 1;
    }
  }

  if (upgraded > 0) {
    clearCache('forumSettings');
    console.log(`Nav diagnostics: upgraded ${upgraded} legacy 6×4 config(s) to template 8×6`);
  }
}
