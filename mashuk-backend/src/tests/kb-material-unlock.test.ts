import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { createApp } from '../app.js';
import { db } from '../db/index.js';
import { events, materials, participants } from '../db/schema.js';
import { isMaterialUnlockedForParticipant } from '../controllers/programController.js';
import {
  materialBelongsToParticipantShift,
  materialVisibleWhenShiftOpen,
} from '../services/kbOpenShift.js';
import { createShift, updateShift } from '../services/shiftService.js';

describe('isMaterialUnlockedForParticipant', () => {
  it('immediate mode ignores touchpoint count', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'immediate', kbUnlockMinTouchpoints: 7 }, 0, 4),
      true,
    );
  });

  it('touchpoints mode uses material N when set', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: 3 }, 2, 4),
      false,
    );
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: 3 }, 3, 4),
      true,
    );
  });

  it('touchpoints mode falls back to forum default', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: null }, 3, 4),
      false,
    );
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: null }, 4, 4),
      true,
    );
  });
});

describe('materialVisibleWhenShiftOpen', () => {
  it('hides everything while the day is locked', () => {
    assert.equal(materialVisibleWhenShiftOpen(false, false, true), false);
    assert.equal(materialVisibleWhenShiftOpen(true, false, true), false);
  });

  it('skips per-material gate when admin opened the shift', () => {
    assert.equal(materialVisibleWhenShiftOpen(true, true, false), true);
  });

  it('keeps per-material gate when the shift still uses the threshold', () => {
    assert.equal(materialVisibleWhenShiftOpen(false, true, false), false);
    assert.equal(materialVisibleWhenShiftOpen(false, true, true), true);
  });
});

describe('materialBelongsToParticipantShift', () => {
  it('keeps the own shift and drops another or missing', () => {
    assert.equal(materialBelongsToParticipantShift({ shiftId: 2 }, 2), true);
    assert.equal(materialBelongsToParticipantShift({ shiftId: 1 }, 2), false);
    assert.equal(materialBelongsToParticipantShift({ shiftId: null }, 2), false);
    assert.equal(materialBelongsToParticipantShift({ shiftId: 2 }, null), false);
  });
});

describe('knowledge base shift isolation', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();

  it('does not show shift-1 materials to a shift-2 participant even if event ids collide', async () => {
    const stamp = Date.now();
    const shift1 = await createShift({ name: `KB-iso-src-${stamp}` });
    const shift2 = await createShift({ name: `KB-iso-dst-${stamp}` });
    await updateShift(shift2.id, { kbUnlockDisabled: true, currentDay: 1 });

    const [event2] = await db.insert(events).values({
      shiftId: shift2.id,
      title: 'KB iso shift2 event',
      dayNumber: 1,
    }).returning({ id: events.id });

    const [own] = await db.insert(materials).values({
      shiftId: shift2.id,
      title: `KB-ISO-OWN-${stamp}`,
      status: 'published',
      dayNumber: 1,
      kbUnlockMode: 'immediate',
    }).returning({ id: materials.id });
    const [leakedByEvent] = await db.insert(materials).values({
      shiftId: shift1.id,
      title: `KB-ISO-LEAK-EVENT-${stamp}`,
      status: 'published',
      dayNumber: 1,
      eventId: event2.id,
      kbUnlockMode: 'immediate',
    }).returning({ id: materials.id });
    const [leakedGeneral] = await db.insert(materials).values({
      shiftId: shift1.id,
      title: `KB-ISO-LEAK-GENERAL-${stamp}`,
      status: 'published',
      isGeneral: true,
      kbUnlockMode: 'immediate',
    }).returning({ id: materials.id });

    const vkId = 9_100_000 + (stamp % 90_000);
    const [person] = await db.insert(participants).values({
      vkId,
      shiftId: shift2.id,
      firstName: 'KB',
      lastName: 'Iso',
      onboardingCompletedAt: new Date(),
    }).returning({ id: participants.id });

    try {
      const res = await request(app)
        .get('/api/program/knowledge-base?day=1')
        .set({
          'X-Test-Vk-Id': String(vkId),
          'X-Shift-Id': String(shift2.id),
        });
      assert.equal(res.status, 200, res.text);
      const titles = (res.body.materials || []).map((m: { title: string }) => m.title);
      assert.equal(titles.includes(`KB-ISO-OWN-${stamp}`), true);
      assert.equal(titles.includes(`KB-ISO-LEAK-EVENT-${stamp}`), false);
      assert.equal(titles.includes(`KB-ISO-LEAK-GENERAL-${stamp}`), false);

      const piggy = await request(app)
        .post(`/api/program/materials/${leakedByEvent.id}/piggybank`)
        .set({
          'X-Test-Vk-Id': String(vkId),
          'X-Shift-Id': String(shift2.id),
        })
        .send({ source: 'kb' });
      assert.equal(piggy.status, 404);
    } finally {
      await db.delete(materials).where(inArray(materials.id, [own.id, leakedByEvent.id, leakedGeneral.id]));
      await db.delete(events).where(eq(events.id, event2.id));
      await db.delete(participants).where(eq(participants.id, person.id));
    }
  });
});
