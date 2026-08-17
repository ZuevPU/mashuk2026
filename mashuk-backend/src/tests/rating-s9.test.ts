import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pointsTrackForAction, totalRatingScore } from '../services/pointsService.js';
import { effectiveTaskPoints } from '../services/taskPoints.js';

describe('§9 rating', () => {
  it('total score includes path, experience, bonus', () => {
    assert.equal(totalRatingScore(10, 20, 5), 35);
  });

  it('bonus actions map to bonus track', () => {
    assert.equal(pointsTrackForAction('bonus_regularity'), 'bonus');
    assert.equal(pointsTrackForAction('day_complete_bonus'), 'path');
  });

  it('medal task keeps the card XP (does not double)', () => {
    assert.equal(effectiveTaskPoints({ points: 40, medalTask: true }), 40);
    assert.equal(effectiveTaskPoints({ points: 15, medalTask: false }), 15);
    assert.equal(effectiveTaskPoints({ points: 0, medalTask: true }), 0);
  });
});
