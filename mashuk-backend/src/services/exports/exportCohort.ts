import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { directions, participantGroups } from '../../db/schema.js';
import type { ParticipantListQuery } from '../participantsList.js';

/** Resolve Insights chrome filters (`direction`/`group` names) into ids. */
export async function applyCohortNameFilters(
  query: ParticipantListQuery,
  raw: { direction?: string; group?: string },
): Promise<ParticipantListQuery> {
  const out = { ...query };
  const shiftId = out.shiftId != null && Number.isFinite(out.shiftId) ? out.shiftId : null;
  if ((!out.directionIds || out.directionIds.length === 0) && raw.direction?.trim()) {
    const name = raw.direction.trim();
    const dirWhere = shiftId != null
      ? and(eq(directions.name, name), eq(directions.shiftId, shiftId))
      : eq(directions.name, name);
    const [byExact] = await db.select({ id: directions.id }).from(directions).where(dirWhere).limit(1);
    if (byExact) {
      out.directionIds = [byExact.id];
    } else {
      const likeWhere = shiftId != null
        ? and(ilike(directions.name, name), eq(directions.shiftId, shiftId))
        : ilike(directions.name, name);
      const [byIlike] = await db.select({ id: directions.id }).from(directions)
        .where(likeWhere).limit(1);
      if (byIlike) out.directionIds = [byIlike.id];
    }
  }
  if ((out.groupId == null || Number.isNaN(out.groupId)) && raw.group?.trim()) {
    const name = raw.group.trim();
    const groupWhere = shiftId != null
      ? and(eq(participantGroups.name, name), eq(participantGroups.shiftId, shiftId))
      : eq(participantGroups.name, name);
    const [byExact] = await db.select({ id: participantGroups.id }).from(participantGroups)
      .where(groupWhere).limit(1);
    if (byExact) {
      out.groupId = byExact.id;
    } else {
      const likeWhere = shiftId != null
        ? and(ilike(participantGroups.name, name), eq(participantGroups.shiftId, shiftId))
        : ilike(participantGroups.name, name);
      const [byIlike] = await db.select({ id: participantGroups.id }).from(participantGroups)
        .where(likeWhere).limit(1);
      if (byIlike) out.groupId = byIlike.id;
    }
  }
  return out;
}
