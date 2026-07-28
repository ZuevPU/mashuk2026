import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { ratingBonusRules } from '../db/schema.js';

export type BonusRuleRow = typeof ratingBonusRules.$inferSelect;

export function bonusParamInt(
  params: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
): number {
  const n = Number(params?.[key]);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}

export function bonusRuleEnabled(rule: BonusRuleRow | undefined | null, defaultEnabled = true): boolean {
  if (!rule) return defaultEnabled;
  return rule.enabled !== false;
}

export async function loadBonusRulesByCode(): Promise<Map<string, BonusRuleRow>> {
  const rows = await db.select().from(ratingBonusRules);
  return new Map(rows.map(r => [r.code, r]));
}

export async function getBonusRuleByCode(code: string): Promise<BonusRuleRow | null> {
  const [row] = await db.select().from(ratingBonusRules).where(eq(ratingBonusRules.code, code)).limit(1);
  return row ?? null;
}

export function bonusPointsActionType(rule: BonusRuleRow | undefined | null, fallback: string): string {
  const t = rule?.pointsActionType?.trim();
  return t || fallback;
}
