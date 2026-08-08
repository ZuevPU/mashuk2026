import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyticsQuery, resolveDayRange } from '../services/analytics/analyticsQuery.js';
import { zonesToPercent, emptyZoneDistribution } from '../services/analytics/zoneDistribution.js';
import { incrementZone } from '../services/emotionZones.js';

describe('analyticsQuery', () => {
  it('parseAnalyticsQuery defaults', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'shift' } } as never);
    assert.equal(q.mode, 'shift');
    assert.equal(q.page, 1);
    assert.equal(q.shiftId, null);
  });

  it('parseAnalyticsQuery clubId', () => {
    const q = parseAnalyticsQuery({ query: { clubId: 'club_future' } } as never);
    assert.equal(q.clubId, 'club_future');
  });

  it('day=1 without mode is treated as day slice, not live today', () => {
    const q = parseAnalyticsQuery({ query: { day: '1' } } as never);
    assert.equal(q.mode, 'day');
    assert.equal(q.day, 1);
    assert.deepEqual(resolveDayRange(q, 2), [1]);
  });

  it('resolveDayRange honors explicit day under today mode', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'today', day: '1' } } as never);
    assert.equal(q.day, 1);
    assert.deepEqual(resolveDayRange(q, 2), [1]);
  });

  it('resolveDayRange shift ignores single day', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'shift', day: '1' } } as never);
    assert.deepEqual(resolveDayRange(q, 2), [1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('semanticHeuristics', () => {
  it('newTokensOnDay finds tokens not in prior days', async () => {
    const { newTokensOnDay } = await import('../services/analytics/semanticHeuristics.js');
    const map = new Map<number, string[]>([
      [1, ['школа инструмент метод']],
      [2, ['школа среда отношения роль']],
    ]);
    const fresh = newTokensOnDay(map, 2, 5);
    assert.ok(fresh.some(t => t.token === 'среда' || t.token === 'отношения'));
  });
});
