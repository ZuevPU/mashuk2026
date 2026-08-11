import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gini,
  lastActiveBucket,
  median,
  segmentOf,
  shiftDateKey,
  topShare,
} from '../services/analytics/activityHubMetrics.js';

describe('activityHubMetrics', () => {
  it('median', () => {
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), 0);
  });

  it('gini is 0 for equal values and high for skewed', () => {
    assert.equal(gini([10, 10, 10, 10]), 0);
    assert.ok(gini([0, 0, 0, 100]) > 0.7);
  });

  it('segmentOf splits by median points and any experience', () => {
    assert.equal(segmentOf(10, 5, 5), 'Ядро');
    assert.equal(segmentOf(10, 0, 5), 'Слушатели');
    assert.equal(segmentOf(3, 5, 5), 'Общительные');
    assert.equal(segmentOf(3, 0, 5), 'Тихие');
  });

  it('lastActiveBucket treats yesterday as not drop-off', () => {
    const now = '2026-08-11';
    const today = new Date('2026-08-11T09:00:00+03:00');
    const yest = new Date('2026-08-10T22:00:00+03:00');
    const old = new Date('2026-08-09T12:00:00+03:00');
    assert.equal(lastActiveBucket(today, now), 'today');
    assert.equal(lastActiveBucket(yest, now), 'yesterday');
    assert.equal(lastActiveBucket(old, now), 'old');
    assert.equal(lastActiveBucket(null, now), 'never');
    assert.equal(shiftDateKey(now, -1), '2026-08-10');
  });

  it('topShare of experience', () => {
    const vals = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    assert.equal(topShare(vals, 0.1), 100);
  });
});
