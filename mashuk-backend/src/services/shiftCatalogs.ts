import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  directions,
  events,
  materials,
  participantGroups,
  participants,
  programBlockTypes,
  programPlaces,
  programSpeakers,
  questions,
  shifts,
  tasks,
  thematicTags,
} from '../db/schema.js';
function remapId(id: number | null | undefined, map: Map<number, number>): number | null {
  if (id == null || !Number.isFinite(id) || id <= 0) return null;
  if (map.has(id)) return map.get(id) ?? null;
  return new Set(map.values()).has(id) ? id : null;
}

function remapLinkedIds(ids: unknown, map: Map<number, number>): number[] {
  if (!Array.isArray(ids)) return [];
  const targetIds = new Set(map.values());
  const out: number[] = [];
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (map.has(n)) {
      const mapped = map.get(n);
      if (mapped) out.push(mapped);
      continue;
    }
    if (targetIds.has(n)) out.push(n);
  }
  return out;
}

type DbLike = Pick<typeof db, 'select' | 'insert' | 'update'>;

export function remapAudienceDirectionTree(config: unknown, map: Map<number, number>): unknown {
  if (Array.isArray(config)) return config.map(item => remapAudienceDirectionTree(item, map));
  if (!config || typeof config !== 'object') return config;
  const src = config as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === 'audienceDirectionIds') {
      out[key] = remapLinkedIds(value, map);
    } else if (key === 'audienceDirectionId') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        out[key] = value;
      } else if (map.has(n)) {
        out[key] = map.get(n);
      } else if (new Set(map.values()).has(n)) {
        out[key] = n;
      } else {
        out[key] = null;
      }
    } else {
      out[key] = remapAudienceDirectionTree(value, map);
    }
  }
  return out;
}

export async function getDirectionInShift(directionId: number, shiftId: number) {
  const [dir] = await db.select().from(directions).where(and(
    eq(directions.id, directionId),
    eq(directions.shiftId, shiftId),
  )).limit(1);
  return dir ?? null;
}

export async function listDirectionsForShift(shiftId: number, opts?: { includeHidden?: boolean }) {
  const rows = await db.select().from(directions).where(eq(directions.shiftId, shiftId));
  return opts?.includeHidden ? rows : rows.filter(d => d.isHidden !== true);
}

async function nameMap<T extends { id: number; name: string }>(
  source: T[],
  target: T[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const src of source) {
    const hit = target.find(d => d.name === src.name);
    if (hit) map.set(src.id, hit.id);
  }
  return map;
}

export async function ensureShiftCatalogs<T extends DbLike>(
  tx: T,
  sourceId: number,
  targetId: number,
): Promise<{
  directionMap: Map<number, number>;
  speakerMap: Map<number, number>;
  placeMap: Map<number, number>;
}> {
  const directionMap = await cloneByName(tx, directions, sourceId, targetId, row => ({
    shiftId: targetId,
    name: row.name,
    isHidden: row.isHidden,
    isOrganizer: row.isOrganizer === true,
  }));
  const placeMap = await cloneByName(tx, programPlaces, sourceId, targetId, row => ({
    shiftId: targetId,
    name: row.name,
  }));
  await cloneByName(tx, thematicTags, sourceId, targetId, row => ({
    shiftId: targetId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    applicationTypes: row.applicationTypes,
  }));
  await cloneByKey(tx, programBlockTypes, sourceId, targetId, row => ({
    shiftId: targetId,
    key: row.key,
    name: row.name,
    sortOrder: row.sortOrder,
  }));
  const speakerMap = await cloneSpeakers(tx, sourceId, targetId);
  return { directionMap, speakerMap, placeMap };
}

async function cloneByName(
  tx: DbLike,
  table: typeof directions | typeof programPlaces | typeof thematicTags,
  sourceId: number,
  targetId: number,
  toInsert: (row: { id: number; name: string } & Record<string, unknown>) => Record<string, unknown>,
): Promise<Map<number, number>> {
  const catalog = table as typeof directions;
  const src = await tx.select().from(catalog).where(eq(catalog.shiftId, sourceId));
  const existing = await tx.select().from(catalog).where(eq(catalog.shiftId, targetId));
  if (!existing.length && src.length) {
    for (const row of src) {
      await tx.insert(catalog).values(toInsert(row) as typeof directions.$inferInsert);
    }
  }
  const dst = await tx.select().from(catalog).where(eq(catalog.shiftId, targetId));
  return nameMap(src, dst);
}

async function cloneByKey(
  tx: DbLike,
  table: typeof programBlockTypes,
  sourceId: number,
  targetId: number,
  toInsert: (row: typeof programBlockTypes.$inferSelect) => typeof programBlockTypes.$inferInsert,
): Promise<Map<number, number>> {
  const src = await tx.select().from(table).where(eq(table.shiftId, sourceId));
  const existing = await tx.select().from(table).where(eq(table.shiftId, targetId));
  if (!existing.length && src.length) {
    for (const row of src) {
      await tx.insert(table).values(toInsert(row));
    }
  }
  const dst = await tx.select().from(table).where(eq(table.shiftId, targetId));
  const map = new Map<number, number>();
  for (const s of src) {
    const hit = dst.find(d => d.key === s.key);
    if (hit) map.set(s.id, hit.id);
  }
  return map;
}

async function cloneSpeakers(tx: DbLike, sourceId: number, targetId: number): Promise<Map<number, number>> {
  const src = await tx.select().from(programSpeakers).where(eq(programSpeakers.shiftId, sourceId));
  const existing = await tx.select().from(programSpeakers).where(eq(programSpeakers.shiftId, targetId));
  if (!existing.length && src.length) {
    for (const row of src) {
      await tx.insert(programSpeakers).values({
        shiftId: targetId,
        name: row.name,
        credentials: row.credentials,
        initials: row.initials,
      });
    }
  }
  const dst = await tx.select().from(programSpeakers).where(eq(programSpeakers.shiftId, targetId));
  const map = new Map<number, number>();
  for (const s of src) {
    const hit = dst.find(d => d.name === s.name && (d.credentials || '') === (s.credentials || ''));
    if (hit) map.set(s.id, hit.id);
  }
  return map;
}

export async function remapShiftDirectionRefs(
  tx: DbLike,
  shiftId: number,
  directionMap: Map<number, number>,
) {
  if (!directionMap.size) return;
  const people = await tx.select({
    id: participants.id,
    directionId: participants.directionId,
  }).from(participants).where(eq(participants.shiftId, shiftId));
  for (const p of people) {
    if (!p.directionId) continue;
    const next = directionMap.get(p.directionId);
    if (!next || next === p.directionId) continue;
    const [dir] = await tx.select().from(directions).where(eq(directions.id, next)).limit(1);
    await tx.update(participants).set({
      directionId: next,
      direction: dir?.name ?? undefined,
    }).where(eq(participants.id, p.id));
  }

  const groups = await tx.select({
    id: participantGroups.id,
    directionId: participantGroups.directionId,
  }).from(participantGroups).where(eq(participantGroups.shiftId, shiftId));
  for (const g of groups) {
    if (!g.directionId) continue;
    const next = directionMap.get(g.directionId);
    if (!next || next === g.directionId) continue;
    await tx.update(participantGroups).set({ directionId: next }).where(eq(participantGroups.id, g.id));
  }

  const evs = await tx.select({
    id: events.id,
    audienceDirectionId: events.audienceDirectionId,
    audienceDirectionIds: events.audienceDirectionIds,
  }).from(events).where(eq(events.shiftId, shiftId));
  for (const e of evs) {
    const nextId = remapId(e.audienceDirectionId, directionMap);
    const nextIds = remapLinkedIds(e.audienceDirectionIds, directionMap);
    await tx.update(events).set({
      audienceDirectionId: nextId,
      audienceDirectionIds: nextIds,
    }).where(eq(events.id, e.id));
  }

  const qs = await tx.select({
    id: questions.id,
    audienceDirectionId: questions.audienceDirectionId,
  }).from(questions).where(eq(questions.shiftId, shiftId));
  for (const q of qs) {
    if (!q.audienceDirectionId) continue;
    const next = directionMap.get(q.audienceDirectionId);
    if (!next || next === q.audienceDirectionId) continue;
    const [dir] = await tx.select().from(directions).where(eq(directions.id, next)).limit(1);
    await tx.update(questions).set({
      audienceDirectionId: next,
      direction: dir?.name ?? undefined,
    }).where(eq(questions.id, q.id));
  }

  const [shift] = await tx.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
  if (shift) {
    await tx.update(shifts).set({
      eveningQuestionnaireConfig: remapAudienceDirectionTree(shift.eveningQuestionnaireConfig, directionMap) as typeof shift.eveningQuestionnaireConfig,
      eveningQuestionnaireByDay: remapAudienceDirectionTree(shift.eveningQuestionnaireByDay, directionMap) as typeof shift.eveningQuestionnaireByDay,
      forumWrapQuestionnaireConfig: remapAudienceDirectionTree(shift.forumWrapQuestionnaireConfig, directionMap) as typeof shift.forumWrapQuestionnaireConfig,
    }).where(eq(shifts.id, shiftId));
  }
}

export async function remapShiftPlaceRefs(
  tx: DbLike,
  shiftId: number,
  placeMap: Map<number, number>,
) {
  if (!placeMap.size) return;
  const rows = await tx.select({
    id: tasks.id,
    programPlaceId: tasks.programPlaceId,
  }).from(tasks).where(eq(tasks.shiftId, shiftId));
  for (const t of rows) {
    if (!t.programPlaceId) continue;
    const next = placeMap.get(t.programPlaceId);
    if (!next || next === t.programPlaceId) continue;
    await tx.update(tasks).set({ programPlaceId: next }).where(eq(tasks.id, t.id));
  }
}

export async function remapShiftSpeakerRefs(
  tx: DbLike,
  shiftId: number,
  speakerMap: Map<number, number>,
) {
  if (!speakerMap.size) return;
  const evs = await tx.select({ id: events.id, speakerIds: events.speakerIds }).from(events).where(eq(events.shiftId, shiftId));
  for (const e of evs) {
    const next = remapLinkedIds(e.speakerIds, speakerMap);
    if (!next.length && !Array.isArray(e.speakerIds)) continue;
    await tx.update(events).set({ speakerIds: next }).where(eq(events.id, e.id));
  }
  const mats = await tx.select({ id: materials.id, speakerIds: materials.speakerIds }).from(materials).where(eq(materials.shiftId, shiftId));
  for (const m of mats) {
    const next = remapLinkedIds(m.speakerIds, speakerMap);
    await tx.update(materials).set({ speakerIds: next }).where(eq(materials.id, m.id));
  }
}

/** One-time backfill: give each shift its own catalog copies. */
export async function isolateSharedCatalogs() {
  const shiftRows = await db.select({ id: shifts.id }).from(shifts).orderBy(shifts.id);
  if (!shiftRows.length) return;
  const primaryId = shiftRows[0].id;

  await db.execute(sql`UPDATE directions SET shift_id = ${primaryId} WHERE shift_id IS NULL`);
  await db.execute(sql`UPDATE program_places SET shift_id = ${primaryId} WHERE shift_id IS NULL`);
  await db.execute(sql`UPDATE thematic_tags SET shift_id = ${primaryId} WHERE shift_id IS NULL`);
  await db.execute(sql`UPDATE program_block_types SET shift_id = ${primaryId} WHERE shift_id IS NULL`);
  await db.execute(sql`UPDATE program_speakers SET shift_id = ${primaryId} WHERE shift_id IS NULL`);

  for (const shift of shiftRows) {
    if (shift.id === primaryId) continue;
    const { directionMap, speakerMap, placeMap } = await ensureShiftCatalogs(db, primaryId, shift.id);
    await remapShiftDirectionRefs(db, shift.id, directionMap);
    await remapShiftSpeakerRefs(db, shift.id, speakerMap);
    await remapShiftPlaceRefs(db, shift.id, placeMap);
  }
}
