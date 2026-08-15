import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { levelsConfig } from '../db/schema.js';
import { getForumSettings } from './helpers.js';

export async function requireForumSettings(shiftId: number | null | undefined) {
  const sid = shiftId != null && Number.isFinite(Number(shiftId)) && Number(shiftId) > 0
    ? Number(shiftId)
    : null;
  if (sid == null) {
    throw new Error('shiftId required for forum settings');
  }
  return getForumSettings(sid);
}

export function pickLevelsConfigRow<T extends { shiftId?: number | null }>(
  rows: T[],
  shiftId?: number | null,
): T | undefined {
  if (shiftId != null && Number.isFinite(shiftId)) {
    const exact = rows.find(r => r.shiftId === shiftId);
    if (exact) return exact;
  }
  return rows.find(r => r.shiftId == null);
}

export async function loadLevelsConfig(actionType: string, shiftId?: number | null) {
  const rows = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType));
  return pickLevelsConfigRow(rows, shiftId) ?? null;
}

export function levelsRowsForShift<T extends { actionType: string; shiftId?: number | null }>(
  rows: T[],
  shiftId: number,
): T[] {
  const byAction = new Map<string, T[]>();
  for (const row of rows) {
    const list = byAction.get(row.actionType) ?? [];
    list.push(row);
    byAction.set(row.actionType, list);
  }
  const out: T[] = [];
  for (const list of byAction.values()) {
    const picked = pickLevelsConfigRow(list, shiftId);
    if (picked) out.push(picked);
  }
  return out;
}
