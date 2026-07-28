import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyticsQuery } from '../services/analytics/analyticsQuery.js';
import { zonesToPercent, emptyZoneDistribution } from '../services/analytics/zoneDistribution.js';
import { incrementZone } from '../services/emotionZones.js';

describe('analyticsQuery', () => {
  it('parseAnalyticsQuery defaults', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'shift' } } as never);
    assert.equal(q.mode, 'shift');
    assert.equal(q.page, 1);
  });

  it('zonesToPercent sums ~100', () => {
    const z = emptyZoneDistribution();
    incrementZone(z, 'lift');
    incrementZone(z, 'lift');
    incrementZone(z, 'risk');
    const p = zonesToPercent(z);
    const sum = Object.values(p).reduce((s, n) => s + n, 0);
    assert.ok(Math.abs(sum - 100) < 0.2);
  });
});
