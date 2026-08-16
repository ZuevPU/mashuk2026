import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskBelongsToParticipantShift } from '../services/taskEligibility.js';
import { pickEnrollmentForTaskShift } from '../services/shiftService.js';
import { taskPublishFireKey } from '../services/pushTriggerRunner.js';
import { pickLevelsConfigRow, requireForumSettings } from '../services/shiftContext.js';
import { getScheduleDayPublished } from '../services/eveningScheduleGate.js';
import { getActiveHomeNotice } from '../controllers/homeNoticeController.js';

describe('taskBelongsToParticipantShift', () => {
  it('rejects another shift', () => {
    assert.equal(taskBelongsToParticipantShift({ shiftId: 1 }, 2), false);
  });

  it('allows the same shift', () => {
    assert.equal(taskBelongsToParticipantShift({ shiftId: 2 }, 2), true);
  });

  it('allows legacy tasks without shift', () => {
    assert.equal(taskBelongsToParticipantShift({ shiftId: null }, 2), true);
  });

  it('rejects when participant shift is missing', () => {
    assert.equal(taskBelongsToParticipantShift({ shiftId: 1 }, null), false);
  });
});

describe('pickEnrollmentForTaskShift', () => {
  const shift1 = {
    id: 11,
    shiftId: 1,
    onboardingCompletedAt: new Date('2026-08-01'),
    selfDeletedAt: null,
    isBlocked: false,
    blockReason: null,
  };
  const shift2 = {
    id: 22,
    shiftId: 2,
    onboardingCompletedAt: new Date('2026-08-02'),
    selfDeletedAt: null,
    isBlocked: false,
    blockReason: null,
  };

  it('keeps the current enrollment when the task is on the same shift', () => {
    const r = pickEnrollmentForTaskShift(shift1, [shift1, shift2], 1);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.participant.id, 11);
  });

  it('switches to the matching enrollment for a shift-2 QR', () => {
    const r = pickEnrollmentForTaskShift(shift1, [shift1, shift2], 2);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.participant.id, 22);
  });

  it('explains a missing other-shift enrollment instead of pretending the QR is unknown', () => {
    const r = pickEnrollmentForTaskShift(shift1, [shift1], 2);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 400);
      assert.match(r.error, /другой смены/);
    }
  });
});

describe('taskPublishFireKey', () => {
  it('uses one key for generic campaigns', () => {
    assert.equal(taskPublishFireKey({}, 15), 'task_any');
    assert.equal(taskPublishFireKey({ taskId: null }, 15), 'task_any');
  });

  it('keeps a per-task key when the campaign targets one task', () => {
    assert.equal(taskPublishFireKey({ taskId: 15 }, 15), 'task_15');
  });
});

describe('pickLevelsConfigRow', () => {
  const rows = [
    { id: 1, actionType: 'task_complete', shiftId: null, pointsPerUnit: 5 },
    { id: 2, actionType: 'task_complete', shiftId: 2, pointsPerUnit: 12 },
  ];

  it('prefers the row for the requested shift', () => {
    assert.equal(pickLevelsConfigRow(rows, 2)?.pointsPerUnit, 12);
  });

  it('falls back to the global row', () => {
    assert.equal(pickLevelsConfigRow(rows, 1)?.pointsPerUnit, 5);
  });

  it('does not take another shift row when this shift has no config', () => {
    const onlyShift1 = [
      { id: 1, actionType: 'task_complete', shiftId: 1, pointsPerUnit: 5 },
    ];
    assert.equal(pickLevelsConfigRow(onlyShift1, 2), undefined);
  });
});

describe('requireForumSettings', () => {
  it('rejects a missing shiftId', async () => {
    await assert.rejects(() => requireForumSettings(null), /shiftId required/);
    await assert.rejects(() => requireForumSettings(undefined), /shiftId required/);
  });
});

describe('getScheduleDayPublished', () => {
  it('does not guess the active shift when shiftId is missing', async () => {
    assert.equal(await getScheduleDayPublished(3), null);
    assert.equal(await getScheduleDayPublished(3, null), null);
  });
});

describe('getActiveHomeNotice', () => {
  it('does not guess the active shift when shiftId is missing', async () => {
    assert.equal(await getActiveHomeNotice(undefined), null);
    assert.equal(await getActiveHomeNotice(undefined, new Date(), 'tasks'), null);
  });
});
