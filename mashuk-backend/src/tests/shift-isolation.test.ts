import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskBelongsToParticipantShift } from '../services/taskEligibility.js';
import { taskPublishFireKey } from '../services/pushTriggerRunner.js';
import { pickLevelsConfigRow, requireForumSettings } from '../services/shiftContext.js';
import { getScheduleDayPublished } from '../services/eveningScheduleGate.js';

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
