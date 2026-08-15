import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions, participantGroups, participants } from '../db/schema.js';

/** Groups without a direction, or tied to the chosen one. */
export function groupsMatchingDirection<T extends { directionId?: number | null }>(
  groups: T[],
  directionId: number,
): T[] {
  return groups.filter(g => g.directionId == null || g.directionId === directionId);
}

/** Read the group's direction if set. Registration keeps the participant's own choice. */
export async function resolveDirectionFromGroup(
  groupId: number | null | undefined,
  fallback: { id: number; name: string },
): Promise<{ id: number; name: string; fromGroup: boolean }> {
  if (groupId == null) return { ...fallback, fromGroup: false };
  const [g] = await db.select({
    directionId: participantGroups.directionId,
  }).from(participantGroups).where(eq(participantGroups.id, groupId)).limit(1);
  if (!g?.directionId) return { ...fallback, fromGroup: false };
  const [dir] = await db.select().from(directions).where(eq(directions.id, g.directionId)).limit(1);
  if (!dir) return { ...fallback, fromGroup: false };
  return { id: dir.id, name: dir.name, fromGroup: true };
}

/** Force participants.direction* from their group's direction setting. */
export async function applyGroupDirectionToMembers(groupId: number): Promise<number> {
  const [g] = await db.select().from(participantGroups).where(eq(participantGroups.id, groupId)).limit(1);
  if (!g?.directionId) return 0;
  const [dir] = await db.select().from(directions).where(eq(directions.id, g.directionId)).limit(1);
  if (!dir) return 0;
  const updated = await db.update(participants)
    .set({ directionId: dir.id, direction: dir.name })
    .where(eq(participants.groupId, groupId))
    .returning({ id: participants.id });
  return updated.length;
}

export async function applyAllGroupDirections(shiftId: number): Promise<number> {
  const groups = await db.select({
    id: participantGroups.id,
    directionId: participantGroups.directionId,
  }).from(participantGroups).where(eq(participantGroups.shiftId, shiftId));
  let total = 0;
  for (const g of groups) {
    if (g.directionId == null) continue;
    total += await applyGroupDirectionToMembers(g.id);
  }
  return total;
}
