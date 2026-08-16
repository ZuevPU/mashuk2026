import { and, asc, count, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { directions, participantGroups, participants } from '../db/schema.js';

export type ShiftGroupOption = {
  id: number;
  name: string;
  directionId: number | null;
  capacity: number | null;
  membersCount: number;
  seatsLeft: number | null;
  ghostCount: number;
  duplicateName: boolean;
};

const LAT_TO_CYR: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', g: 'г', h: 'н',
  k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', v: 'в', x: 'х', y: 'у',
};

/** 2Г / 2 Г / 2г / 2G → один ключ, чтобы не плодить двойников на смене. */
export function groupNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[a-z]/g, ch => LAT_TO_CYR[ch] ?? ch);
}

export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function groupSeatsLeft(capacity: number | null | undefined, occupants: number): number | null {
  if (capacity == null) return null;
  return Math.max(0, capacity - occupants);
}

function occupyingWhere(shiftId: number, exceptParticipantId?: number) {
  const conds = [
    eq(participants.shiftId, shiftId),
    isNotNull(participants.groupId),
    isNotNull(participants.onboardingCompletedAt),
    isNull(participants.selfDeletedAt),
  ];
  if (exceptParticipantId != null) conds.push(ne(participants.id, exceptParticipantId));
  return and(...conds);
}

export async function countGroupOccupants(
  groupId: number,
  shiftId: number,
  opts?: { exceptParticipantId?: number },
): Promise<number> {
  const [row] = await db.select({ c: count() }).from(participants).where(and(
    eq(participants.groupId, groupId),
    occupyingWhere(shiftId, opts?.exceptParticipantId),
  ));
  return Number(row?.c ?? 0);
}

export async function findDuplicateGroupOnShift(
  shiftId: number,
  name: string,
  exceptId?: number,
): Promise<{ id: number; name: string } | null> {
  const key = groupNameKey(name);
  if (!key) return null;
  const rows = await db.select({
    id: participantGroups.id,
    name: participantGroups.name,
  }).from(participantGroups).where(eq(participantGroups.shiftId, shiftId));
  return rows.find(g => g.id !== exceptId && groupNameKey(g.name) === key) ?? null;
}

/** All groups of this shift, with free seats. Empty groups stay in the list. */
export async function listShiftGroupsWithSeats(shiftId: number): Promise<ShiftGroupOption[]> {
  const groups = await db.select().from(participantGroups)
    .where(eq(participantGroups.shiftId, shiftId))
    .orderBy(asc(participantGroups.name), asc(participantGroups.id));
  if (groups.length === 0) return [];

  const ids = groups.map(g => g.id);
  const [liveRows, ghostRows] = await Promise.all([
    db.select({
      groupId: participants.groupId,
      c: count(),
    }).from(participants).where(and(
      inArray(participants.groupId, ids),
      occupyingWhere(shiftId),
    )).groupBy(participants.groupId),
    db.select({
      groupId: participants.groupId,
      c: count(),
    }).from(participants).where(and(
      inArray(participants.groupId, ids),
      eq(participants.shiftId, shiftId),
      or(
        isNotNull(participants.selfDeletedAt),
        isNull(participants.onboardingCompletedAt),
      ),
    )).groupBy(participants.groupId),
  ]);

  const live = new Map(liveRows.map(r => [r.groupId, Number(r.c)]));
  const ghosts = new Map(ghostRows.map(r => [r.groupId, Number(r.c)]));
  const keyCounts = new Map<string, number>();
  for (const g of groups) {
    const key = groupNameKey(g.name);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  return groups.map(g => {
    const membersCount = live.get(g.id) ?? 0;
    return {
      id: g.id,
      name: g.name,
      directionId: g.directionId ?? null,
      capacity: g.capacity ?? null,
      membersCount,
      seatsLeft: groupSeatsLeft(g.capacity, membersCount),
      ghostCount: ghosts.get(g.id) ?? 0,
      duplicateName: (keyCounts.get(groupNameKey(g.name)) ?? 0) > 1,
    };
  });
}

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
