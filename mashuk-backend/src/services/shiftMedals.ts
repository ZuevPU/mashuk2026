import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { medals, participants, shifts, tasks, userMedals } from '../db/schema.js';

type MedalDb = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export function planMedalCopy(
  source: Array<{ id: number; name: string }>,
  target: Array<{ id: number; name: string }>,
): { existingMap: Map<number, number>; insertSourceIds: number[] } {
  const targetByName = new Map<string, number>();
  for (const row of target) {
    if (!targetByName.has(row.name)) targetByName.set(row.name, row.id);
  }
  const insertByName = new Map<string, number>();
  const existingMap = new Map<number, number>();
  for (const row of source) {
    const hit = targetByName.get(row.name);
    if (hit) {
      existingMap.set(row.id, hit);
      continue;
    }
    if (!insertByName.has(row.name)) insertByName.set(row.name, row.id);
  }
  return { existingMap, insertSourceIds: [...insertByName.values()] };
}

async function remapAwards(
  tx: MedalDb,
  medalIdMap: Map<number, number>,
  awards: Array<{ id: number; participantId: number; medalId: number }>,
) {
  for (const award of awards) {
    const next = medalIdMap.get(award.medalId);
    if (!next || next === award.medalId) continue;
    const [already] = await tx.select({ id: userMedals.id }).from(userMedals).where(and(
      eq(userMedals.participantId, award.participantId),
      eq(userMedals.medalId, next),
    )).limit(1);
    if (already) {
      await tx.delete(userMedals).where(eq(userMedals.id, award.id));
    } else {
      await tx.update(userMedals).set({ medalId: next }).where(eq(userMedals.id, award.id));
    }
  }
}

async function remapTasks(
  tx: MedalDb,
  medalIdMap: Map<number, number>,
  rows: Array<{ id: number; medalId: number | null }>,
) {
  for (const row of rows) {
    const next = row.medalId != null ? medalIdMap.get(row.medalId) : undefined;
    if (!next || next === row.medalId) continue;
    await tx.update(tasks).set({ medalId: next }).where(eq(tasks.id, row.id));
  }
}

async function remapMedalRefs(
  tx: MedalDb,
  medalIdMap: Map<number, number>,
  shiftId: number,
) {
  if (!medalIdMap.size) return;
  const sourceIds = [...medalIdMap.keys()];
  const taskRows = await tx.select({ id: tasks.id, medalId: tasks.medalId })
    .from(tasks)
    .where(and(eq(tasks.shiftId, shiftId), inArray(tasks.medalId, sourceIds)));
  await remapTasks(tx, medalIdMap, taskRows);

  const people = await tx.select({ id: participants.id })
    .from(participants)
    .where(eq(participants.shiftId, shiftId));
  if (!people.length) return;
  const awards = await tx.select().from(userMedals).where(and(
    inArray(userMedals.participantId, people.map(p => p.id)),
    inArray(userMedals.medalId, sourceIds),
  ));
  await remapAwards(tx, medalIdMap, awards);
}

/** Collapse duplicate names before deleting rows — remap every leftover pointer, not only this shift. */
async function remapMedalIdsEverywhere(tx: MedalDb, medalIdMap: Map<number, number>) {
  if (!medalIdMap.size) return;
  const sourceIds = [...medalIdMap.keys()];
  const taskRows = await tx.select({ id: tasks.id, medalId: tasks.medalId })
    .from(tasks)
    .where(inArray(tasks.medalId, sourceIds));
  await remapTasks(tx, medalIdMap, taskRows);
  const awards = await tx.select().from(userMedals).where(inArray(userMedals.medalId, sourceIds));
  await remapAwards(tx, medalIdMap, awards);
}

async function collapseDuplicateMedalNames(tx: MedalDb, shiftId: number) {
  const rows = await tx.select({ id: medals.id, name: medals.name })
    .from(medals)
    .where(eq(medals.shiftId, shiftId))
    .orderBy(asc(medals.id));
  const keeperByName = new Map<string, number>();
  const alias = new Map<number, number>();
  for (const row of rows) {
    const keep = keeperByName.get(row.name);
    if (!keep) {
      keeperByName.set(row.name, row.id);
    } else if (keep !== row.id) {
      alias.set(row.id, keep);
    }
  }
  if (!alias.size) return;
  await remapMedalIdsEverywhere(tx, alias);
  const dupIds = [...alias.keys()];
  await tx.delete(userMedals).where(inArray(userMedals.medalId, dupIds));
  await tx.delete(medals).where(inArray(medals.id, dupIds));
}

async function sourceMedalsForCopy(tx: MedalDb, sourceId: number, targetId: number) {
  const srcMedals = await tx.select().from(medals).where(eq(medals.shiftId, sourceId));
  const linkedIds = [...new Set(
    (await tx.select({ medalId: tasks.medalId }).from(tasks).where(and(
      eq(tasks.shiftId, sourceId),
      isNotNull(tasks.medalId),
    ))).map(r => r.medalId).filter((id): id is number => id != null),
  )].filter(id => !srcMedals.some(m => m.id === id));
  const extraMedals = linkedIds.length
    ? (await tx.select().from(medals).where(inArray(medals.id, linkedIds)))
      .filter(m => m.shiftId !== targetId)
    : [];
  return [...srcMedals, ...extraMedals];
}

export async function copyMedalCatalog(
  tx: MedalDb,
  sourceId: number,
  targetId: number,
  opts?: { replace?: boolean },
): Promise<Map<number, number>> {
  if (opts?.replace) {
    const existing = await tx.select({ id: medals.id }).from(medals).where(eq(medals.shiftId, targetId));
    const ids = existing.map(m => m.id);
    if (ids.length) {
      await tx.delete(userMedals).where(inArray(userMedals.medalId, ids));
      await tx.delete(medals).where(eq(medals.shiftId, targetId));
    }
  } else {
    await collapseDuplicateMedalNames(tx, targetId);
  }

  const toCopy = await sourceMedalsForCopy(tx, sourceId, targetId);
  const targetRows = await tx.select({ id: medals.id, name: medals.name })
    .from(medals)
    .where(eq(medals.shiftId, targetId));
  const { existingMap, insertSourceIds } = planMedalCopy(
    toCopy.map(m => ({ id: m.id, name: m.name })),
    targetRows,
  );
  const medalIdMap = new Map(existingMap);
  const insertSet = new Set(insertSourceIds);
  const createdByName = new Map<string, number>();

  for (const row of toCopy) {
    if (!insertSet.has(row.id)) continue;
    const { id: _oldId, ...rest } = row;
    const [created] = await tx.insert(medals).values({ ...rest, shiftId: targetId }).returning();
    createdByName.set(row.name, created.id);
    medalIdMap.set(row.id, created.id);
  }
  for (const row of toCopy) {
    if (medalIdMap.has(row.id)) continue;
    const createdId = createdByName.get(row.name);
    if (createdId) medalIdMap.set(row.id, createdId);
  }

  await remapMedalRefs(tx, medalIdMap, targetId);
  return medalIdMap;
}

/** Adopt shared (NULL shift) medals onto the first shift and copy by name to the rest. */
export async function isolateSharedMedals() {
  const shiftRows = await db.select({ id: shifts.id }).from(shifts).orderBy(asc(shifts.id));
  if (!shiftRows.length) return;
  const primaryId = shiftRows[0].id;

  await db.execute(sql`UPDATE medals SET shift_id = ${primaryId} WHERE shift_id IS NULL`);
  await collapseDuplicateMedalNames(db, primaryId);

  for (const shift of shiftRows) {
    if (shift.id === primaryId) continue;
    await copyMedalCatalog(db, primaryId, shift.id, { replace: false });
  }
}
