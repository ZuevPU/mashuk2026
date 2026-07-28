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

  it('parseAnalyticsQuery clubId', () => {
    const q = parseAnalyticsQuery({ query: { clubId: 'club_future' } } as never);
    assert.equal(q.clubId, 'club_future');
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
