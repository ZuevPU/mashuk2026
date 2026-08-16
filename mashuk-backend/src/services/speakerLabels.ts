import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { programSpeakers } from '../db/schema.js';

export function normalizeSpeakerIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const n = item != null && typeof item === 'object' && 'id' in item
      ? Number((item as { id: unknown }).id)
      : Number(item);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function snapshotSpeakerName(
  ids: number[],
  byId: Map<number, { name?: string | null }>,
  fallback?: string | null,
): string | null {
  const names = ids
    .map(id => byId.get(id)?.name?.trim())
    .filter((name): name is string => !!name);
  if (names.length) return names.join('; ').slice(0, 255);
  const fb = fallback?.trim();
  return fb ? fb.slice(0, 255) : null;
}

export async function loadSpeakersByIds(ids: number[]): Promise<Map<number, typeof programSpeakers.$inferSelect>> {
  const unique = [...new Set(ids.filter(id => Number.isFinite(id) && id > 0))];
  if (!unique.length) return new Map();
  const rows = await db.select().from(programSpeakers).where(inArray(programSpeakers.id, unique));
  return new Map(rows.map(row => [row.id, row]));
}
