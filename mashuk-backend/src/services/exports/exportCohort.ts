import { eq, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { directions, participantGroups } from '../../db/schema.js';
import type { ParticipantListQuery } from '../participantsList.js';

/** Resolve Insights chrome filters (`direction`/`group` names) into ids. */
export async function applyCohortNameFilters(
  query: ParticipantListQuery,
  raw: { direction?: string; group?: string },
): Promise<ParticipantListQuery> {
  const out = { ...query };
  if ((!out.directionIds || out.directionIds.length === 0) && raw.direction?.trim()) {
    const name = raw.direction.trim();
    const [byExact] = await db.select({ id: directions.id }).from(directions).where(eq(directions.name, name)).limit(1);
    if (byExact) {
      out.directionIds = [byExact.id];
    } else {
      const [byIlike] = await db.select({ id: directions.id }).from(directions)
        .where(ilike(directions.name, name)).limit(1);
      if (byIlike) out.directionIds = [byIlike.id];
    }
  }
  if ((out.groupId == null || Number.isNaN(out.groupId)) && raw.group?.trim()) {
    const name = raw.group.trim();
    const [byExact] = await db.select({ id: participantGroups.id }).from(participantGroups)
      .where(eq(participantGroups.name, name)).limit(1);
    if (byExact) {
      out.groupId = byExact.id;
    } else {
      const [byIlike] = await db.select({ id: participantGroups.id }).from(participantGroups)
        .where(ilike(participantGroups.name, name)).limit(1);
      if (byIlike) out.groupId = byIlike.id;
    }
  }
  return out;
}
