import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  forumDayWindowMsk,
  inferForumDayFromTimestamp,
  pointsLogCountsForForumDay,
} from '../services/timePhase.js';
import { resolveTaskAwardForumDay } from '../services/taskAdminHelpers.js';
import { isActivePointsLogAction, pointsTrackForAction } from '../services/pointsService.js';

describe('rating day windows', () => {
  const start = new Date('2026-08-10T00:00:00+03:00');

  it('places day-1 from midnight MSK through next 02:00', () => {
    const w = forumDayWindowMsk(start, 1);
    assert.equal(w.start.toISOString(), new Date('2026-08-10T00:00:00+03:00').toISOString());
    assert.equal(w.end.toISOString(), new Date('2026-08-11T02:00:00+03:00').toISOString());
  });

  it('places later days from 02:00 MSK to next 02:00', () => {
    const w = forumDayWindowMsk(start, 2);
    assert.equal(w.start.toISOString(), new Date('2026-08-11T02:00:00+03:00').toISOString());
    assert.equal(w.end.toISOString(), new Date('2026-08-12T02:00:00+03:00').toISOString());
  });

  it('infers forum day from created_at using operational 02:00 rollover', () => {
    assert.equal(inferForumDayFromTimestamp(new Date('2026-08-10T18:00:00+03:00'), start, 8), 1);
    assert.equal(inferForumDayFromTimestamp(new Date('2026-08-11T01:00:00+03:00'), start, 8), 1);
    assert.equal(inferForumDayFromTimestamp(new Date('2026-08-11T03:00:00+03:00'), start, 8), 2);
  });

  it('counts NULL forum_day rows inside the day window', () => {
    const w = forumDayWindowMsk(start, 2);
    assert.equal(pointsLogCountsForForumDay({ forumDay: 2 }, 2, w), true);
    assert.equal(pointsLogCountsForForumDay({ forumDay: 1 }, 2, w), false);
    assert.equal(pointsLogCountsForForumDay({
      forumDay: null,
      createdAt: new Date('2026-08-11T15:00:00+03:00'),
    }, 2, w), true);
    assert.equal(pointsLogCountsForForumDay({
      forumDay: null,
      createdAt: new Date('2026-08-10T15:00:00+03:00'),
    }, 2, w), false);
  });
});

describe('task award forum day', () => {
  it('uses the single task day when set', () => {
    assert.equal(resolveTaskAwardForumDay({ dayNumber: 3, dayNumbers: null }, 5), 3);
    assert.equal(resolveTaskAwardForumDay({ dayNumber: null, dayNumbers: [4] }, 5), 4);
  });

  it('credits multi-day and all-day tasks to the current forum day', () => {
    assert.equal(resolveTaskAwardForumDay({ dayNumber: null, dayNumbers: [1, 2, 3] }, 2), 2);
    assert.equal(resolveTaskAwardForumDay({ dayNumber: null, dayNumbers: [] }, 4), 4);
    assert.equal(resolveTaskAwardForumDay({ dayNumber: null, dayNumbers: null }, 4), 4);
  });
});

describe('active points log rows', () => {
  it('skips revoke reversals and maps deduct to the same track', () => {
    assert.equal(isActivePointsLogAction('task_complete'), true);
    assert.equal(isActivePointsLogAction('task_complete_revoke'), false);
    assert.equal(pointsTrackForAction('admin_manual_deduct_experience'), 'experience');
  });
});
