import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { medals, participants, shifts, tasks, userMedals } from '../db/schema.js';
import { createShift } from '../services/shiftService.js';
import { copyMedalCatalog, isolateSharedMedals } from '../services/shiftMedals.js';

describe('shift medals isolation', { skip: !process.env.DATABASE_URL }, () => {
  it('adopts shared medals onto the first shift and copies them by name to the rest', async () => {
    const stamp = Date.now();
    const name = `ISO-NULL-MEDAL-${stamp}`;
    const [shared] = await db.insert(medals).values({
      name,
      description: 'shared catalog',
      awardType: 'manual',
      level: 'bronze',
      shiftId: null,
    }).returning({ id: medals.id });

    try {
      await isolateSharedMedals();
      const shiftRows = await db.select({ id: shifts.id }).from(shifts).orderBy(shifts.id);
      const copies = await db.select().from(medals).where(eq(medals.name, name));
      assert.ok(copies.length >= 1, 'adopted medal missing');
      assert.equal(copies.every(m => m.shiftId != null), true);
      assert.equal(copies.length, shiftRows.length, 'each shift must have its own copy');
      assert.equal(new Set(copies.map(m => m.shiftId)).size, shiftRows.length);
      assert.equal(new Set(copies.map(m => m.id)).size, copies.length);
      assert.ok(copies.some(m => m.id === shared.id), 'original row should stay on the first shift');
    } finally {
      await db.delete(medals).where(eq(medals.name, name));
    }
  });

  it('copies medals to another shift without duplicating names and remaps awards', async () => {
    const stamp = Date.now();
    const src = await createShift({ name: `Medal-src-${stamp}` });
    const dst = await createShift({ name: `Medal-dst-${stamp}` });
    const [kept] = await db.insert(medals).values({
      shiftId: src.id,
      name: `Medal-A-${stamp}`,
      awardType: 'manual',
      level: 'bronze',
    }).returning();
    const [extra] = await db.insert(medals).values({
      shiftId: src.id,
      name: `Medal-B-${stamp}`,
      awardType: 'manual',
      level: 'silver',
    }).returning();
    await db.insert(medals).values({
      shiftId: dst.id,
      name: `Medal-A-${stamp}`,
      awardType: 'manual',
      level: 'bronze',
    });
    const [person] = await db.insert(participants).values({
      vkId: 9_200_000 + (stamp % 90_000),
      shiftId: dst.id,
      firstName: 'Medal',
      lastName: 'Iso',
      onboardingCompletedAt: new Date(),
    }).returning({ id: participants.id });
    const [award] = await db.insert(userMedals).values({
      participantId: person.id,
      medalId: extra.id,
      way: 'manual',
    }).returning({ id: userMedals.id });
    const [task] = await db.insert(tasks).values({
      shiftId: dst.id,
      title: `Medal-task-${stamp}`,
      medalId: extra.id,
      status: 'draft',
    }).returning({ id: tasks.id });

    try {
      const map = await copyMedalCatalog(db, src.id, dst.id, { replace: false });
      await copyMedalCatalog(db, src.id, dst.id, { replace: false });

      const dstRows = await db.select().from(medals).where(eq(medals.shiftId, dst.id));
      const names = dstRows.map(m => m.name).sort();
      assert.deepEqual(names, [`Medal-A-${stamp}`, `Medal-B-${stamp}`]);
      assert.equal(map.get(kept.id), dstRows.find(m => m.name === kept.name)?.id);
      assert.notEqual(map.get(extra.id), extra.id);

      const [movedAward] = await db.select().from(userMedals).where(eq(userMedals.id, award.id));
      assert.equal(movedAward.medalId, map.get(extra.id));
      const [movedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
      assert.equal(movedTask.medalId, map.get(extra.id));

      const srcRows = await db.select().from(medals).where(eq(medals.shiftId, src.id));
      assert.equal(srcRows.length, 2);
    } finally {
      await db.delete(userMedals).where(eq(userMedals.participantId, person.id));
      await db.delete(tasks).where(eq(tasks.id, task.id));
      await db.delete(participants).where(eq(participants.id, person.id));
      await db.delete(medals).where(eq(medals.shiftId, src.id));
      await db.delete(medals).where(eq(medals.shiftId, dst.id));
    }
  });
});
