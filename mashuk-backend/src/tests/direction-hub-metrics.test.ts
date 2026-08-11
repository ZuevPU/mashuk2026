import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviationPct,
  isGoodDeviation,
  pct,
  rankOf,
  rankTone,
} from '../services/analytics/directionHubMetrics.js';

describe('directionHubMetrics', () => {
  it('deviationPct and isGoodDeviation', () => {
    assert.equal(deviationPct(16.1, 10.2), 57.8);
    assert.equal(isGoodDeviation(deviationPct(16.1, 10.2), true), true);
    assert.equal(isGoodDeviation(deviationPct(23.4, 21.4), false), false);
  });

  it('rankOf / rankTone', () => {
    const dirs = ['A', 'B', 'C'];
    const vals = { A: 10, B: 20, C: 15 };
    assert.equal(rankOf(dirs, vals, 'B', true), 1);
    assert.equal(rankOf(dirs, vals, 'A', true), 3);
    assert.equal(rankOf(dirs, vals, 'A', false), 1);
    assert.equal(rankTone(1, 3), 1);
    assert.equal(rankTone(3, 3), 0);
  });

  it('pct', () => {
    assert.equal(pct(87, 1199), 7.3);
  });
});
