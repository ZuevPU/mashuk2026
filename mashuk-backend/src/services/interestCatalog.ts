/**
 * Единый каталог интересов смены: thematic_tags → регистрация (interestGroups).
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { thematicTags } from '../db/schema.js';
import { normalizeOnboardingConfig } from './roleService.js';
import { clearShiftCaches, getShiftById, updateShift } from './shiftService.js';
import { ensureThematicTagRegistry } from './thematicTagRegistry.js';

export type InterestGroup = { title: string; tags: string[] };

const DEFAULT_GROUP = 'Интересы';

export function applyInterestCatalogToGroups(
  groups: InterestGroup[],
  catalog: string[],
): InterestGroup[] {
  const catalogList = [...new Set(catalog.map(t => String(t || '').trim()).filter(Boolean))];
  const catalogSet = new Set(catalogList);
  const kept: InterestGroup[] = [];
  for (const g of groups) {
    const title = String(g.title || '').trim() || DEFAULT_GROUP;
    const tags = [...new Set((g.tags || []).filter(t => catalogSet.has(t)))];
    if (tags.length) kept.push({ title, tags });
  }
  const used = new Set(kept.flatMap(g => g.tags));
  const missing = catalogList.filter(t => !used.has(t));
  if (missing.length) {
    const idx = kept.findIndex(g => g.title === DEFAULT_GROUP);
    if (idx >= 0) kept[idx] = { ...kept[idx], tags: [...kept[idx].tags, ...missing] };
    else if (kept.length === 1) kept[0] = { ...kept[0], tags: [...kept[0].tags, ...missing] };
    else kept.push({ title: DEFAULT_GROUP, tags: missing });
  }
  if (!kept.length) return [{ title: DEFAULT_GROUP, tags: catalogList }];
  return kept;
}

export function renameInterestInGroups(
  groups: InterestGroup[],
  fromName: string,
  toName: string,
): InterestGroup[] {
  const from = String(fromName || '').trim();
  const to = String(toName || '').trim();
  if (!from) return groups;
  return groups.map(g => ({
    title: g.title,
    tags: [...new Set(g.tags.map(t => (t === from ? to : t)).filter(Boolean))],
  })).filter(g => g.tags.length > 0);
}

export async function listShiftInterestNames(shiftId: number): Promise<string[]> {
  const rows = await db.select({
    name: thematicTags.name,
    isActive: thematicTags.isActive,
  }).from(thematicTags)
    .where(eq(thematicTags.shiftId, shiftId))
    .orderBy(asc(thematicTags.sortOrder), asc(thematicTags.name));
  return rows.filter(t => t.isActive !== false).map(t => t.name);
}

export async function renameInterestInOnboarding(
  shiftId: number,
  fromName: string,
  toName: string,
): Promise<void> {
  const shift = await getShiftById(shiftId);
  if (!shift) return;
  const cfg = normalizeOnboardingConfig(shift.roleDiagnosticsConfig);
  const nextGroups = toName
    ? renameInterestInGroups(cfg.interestGroups, fromName, toName)
    : applyInterestCatalogToGroups(cfg.interestGroups, cfg.interestGroups.flatMap(g => g.tags).filter(t => t !== fromName));
  if (JSON.stringify(nextGroups) === JSON.stringify(cfg.interestGroups)) return;
  await updateShift(shiftId, {
    roleDiagnosticsConfig: { ...cfg, interestGroups: nextGroups },
  });
  clearShiftCaches();
}

/** Подтянуть интересы из реестра смены в шаг регистрации. Пустой реестр заполняется из текущих групп. */
export async function syncInterestCatalogToOnboarding(shiftId: number): Promise<string[]> {
  let catalog = await listShiftInterestNames(shiftId);
  const shift = await getShiftById(shiftId);
  if (!shift) return catalog;
  const cfg = normalizeOnboardingConfig(shift.roleDiagnosticsConfig);
  if (!catalog.length) {
    const fromConfig = [...new Set(cfg.interestGroups.flatMap(g => g.tags).filter(Boolean))];
    if (fromConfig.length) {
      await ensureThematicTagRegistry(fromConfig, shiftId);
      catalog = await listShiftInterestNames(shiftId);
    }
  }
  const nextGroups = applyInterestCatalogToGroups(cfg.interestGroups, catalog);
  if (JSON.stringify(nextGroups) !== JSON.stringify(cfg.interestGroups)) {
    await updateShift(shiftId, {
      roleDiagnosticsConfig: { ...cfg, interestGroups: nextGroups },
    });
    clearShiftCaches();
  }
  return catalog;
}
