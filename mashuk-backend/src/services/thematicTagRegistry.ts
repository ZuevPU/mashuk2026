import { db } from '../db/index.js';
import { thematicTags } from '../db/schema.js';

/** Ensure tag names exist in thematic_tags registry (unified source for events/materials/interests). */
export async function ensureThematicTagRegistry(names: string[]): Promise<string[]> {
  const trimmed = [...new Set(names.map(n => String(n).trim()).filter(Boolean))];
  if (!trimmed.length) return [];

  const existing = await db.select().from(thematicTags);
  const byName = new Map(existing.map(t => [t.name.toLowerCase(), t.name]));
  const out: string[] = [];

  for (const name of trimmed) {
    const hit = byName.get(name.toLowerCase());
    if (hit) {
      out.push(hit);
      continue;
    }
    const [created] = await db.insert(thematicTags).values({
      name,
      isActive: true,
      applicationTypes: ['events', 'materials'],
    }).returning();
    byName.set(name.toLowerCase(), created.name);
    out.push(created.name);
  }
  return out;
}
