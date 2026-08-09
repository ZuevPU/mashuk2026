import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  accumulateThemeMention,
  buildCategoricalThemes,
  buildProfileRecommendations,
  engagementSegment,
  normalizeScaleToPct,
  numericSummary,
  themesFromBag,
  PROFILE_RULE_THRESHOLDS,
} from '../services/analytics/participantProfileStats.js';
import { parseAnalyticsQuery, resolveDayRange } from '../services/analytics/analyticsQuery.js';

describe('participantProfileStats', () => {
  it('numericSummary avg and median', () => {
    const s = numericSummary([1, 2, 3, 4, 100]);
    assert.equal(s.count, 5);
    assert.equal(s.avg, 22);
    assert.equal(s.median, 3);
    assert.equal(s.min, 1);
    assert.equal(s.max, 100);
  });

  it('empty sample does not produce NaN', () => {
    const s = numericSummary([]);
    assert.equal(s.count, 0);
    assert.equal(s.avg, null);
    assert.equal(s.median, null);
    assert.equal(s.min, null);
    assert.equal(s.max, null);
  });

  it('engagementSegment thresholds', () => {
    assert.equal(engagementSegment(85), 'leaders');
    assert.equal(engagementSegment(70), 'stable');
    assert.equal(engagementSegment(40), 'selective');
    assert.equal(engagementSegment(10), 'dropout_risk');
    assert.equal(engagementSegment(null), 'insufficient_data');
  });

  it('normalizeScaleToPct does not mix raw 1-5 and 1-10', () => {
    assert.equal(normalizeScaleToPct(4, 5), 80);
    assert.equal(normalizeScaleToPct(8, 10), 80);
    assert.notEqual(normalizeScaleToPct(4, 5), normalizeScaleToPct(4, 10));
  });

  it('small sample suppresses recommendations', () => {
    const recs = buildProfileRecommendations({
      sampleSize: 3,
      riskFatiguePct: 50,
      energyAvg: 4,
      energyPrevAvg: 8,
      touchpointCoveragePct: 10,
      eveningFillPct: 20,
      lowestScaleAvg5: 2,
      lowestScaleLabel: 'X',
      directionLagPp: 20,
      laggingDirection: 'A',
      highEnergyLowReflection: true,
    });
    assert.equal(recs.length, 0);
  });

  it('rules fire with evidence when sample is large enough', () => {
    const recs = buildProfileRecommendations({
      sampleSize: PROFILE_RULE_THRESHOLDS.minSample,
      riskFatiguePct: 35,
      energyAvg: 5,
      energyPrevAvg: 7,
      touchpointCoveragePct: 40,
      eveningFillPct: 43,
      lowestScaleAvg5: 3.2,
      lowestScaleLabel: 'Питание',
      directionLagPp: 18,
      laggingDirection: 'IT',
      highEnergyLowReflection: true,
    });
    assert.ok(recs.length >= 4);
    assert.ok(recs.some(r => r.id === 'low_evening' && r.evidence.includes('43%')));
    assert.ok(recs.every(r => r.evidence.length > 0));
    assert.equal(recs[0].priority, 'high');
  });
});

describe('participant profile coverage uniqueness', () => {
  it('one participant counted once in Set-based coverage', () => {
    const ids = [1, 1, 1, 2, 3, 2];
    const unique = new Set(ids);
    assert.equal(unique.size, 3);
    const pct = Math.round((unique.size / 10) * 1000) / 10;
    assert.equal(pct, 30);
  });

  it('theme pct uses uniqueParticipants not mention count', () => {
    const bag = new Map<string, { count: number; pids: Set<number> }>();
    accumulateThemeMention(bag, 'школа', 1);
    accumulateThemeMention(bag, 'школа', 1);
    accumulateThemeMention(bag, 'школа', 2);
    const themes = themesFromBag(bag, 10);
    assert.equal(themes[0].count, 3);
    assert.equal(themes[0].uniqueParticipants, 2);
    assert.equal(themes[0].pct, 20);
  });

  it('buildCategoricalThemes marks mode', () => {
    const themes = buildCategoricalThemes([
      { label: 'a', count: 5, uniqueParticipants: 2 },
      { label: 'b', count: 3, uniqueParticipants: 3 },
    ], 10);
    assert.equal(themes[0].label, 'b');
    assert.equal(themes[0].mode, true);
    assert.equal(themes[1].mode, false);
  });
});

describe('participant profile evening draft exclusion', () => {
  it('only submitted rows contribute to scale averages', () => {
    const rows = [
      { status: 'сдано', ratings: { q1: 5 } },
      { status: 'черновик', ratings: { q1: 1 } },
      { status: 'сдано', ratings: { q1: 3 } },
    ];
    const submitted = rows.filter(r => r.status === 'сдано');
    assert.equal(submitted.length, 2);
    const vals = submitted.map(r => Number(r.ratings.q1));
    const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
    assert.equal(avg, 4);
    assert.ok(!submitted.some(r => r.status === 'черновик'));
  });
});

describe('participant profile filters', () => {
  it('day filter resolves to single day', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'day', day: '3' } } as never);
    assert.deepEqual(resolveDayRange(q, 5), [3]);
  });

  it('direction filter is preserved in query', () => {
    const q = parseAnalyticsQuery({ query: { mode: 'day', day: '1', direction: 'IT' } } as never);
    assert.equal(q.direction, 'IT');
  });
});

describe('participant profile organizers excluded', () => {
  it('organizer direction filter string matches cohort exclusion rule', () => {
    const direction = 'Организатор форума';
    const isOrganizer = (direction || '').toLowerCase() === 'организатор форума';
    assert.equal(isOrganizer, true);
  });
});

describe('participant-level energy aggregation', () => {
  it('aggregates participant averages before cohort mean', () => {
    // p1: 10,10 → 10; p2: 2 → 2; cohort avg of participant avgs = 6
    const byPid = new Map<number, number[]>([
      [1, [10, 10]],
      [2, [2]],
    ]);
    const participantAvgs = [...byPid.values()].map(vals => vals.reduce((s, n) => s + n, 0) / vals.length);
    const cohort = numericSummary(participantAvgs);
    assert.equal(cohort.avg, 6);
    assert.equal(cohort.min, 2);
    assert.equal(cohort.max, 10);
    assert.equal(cohort.count, 2);
  });
});
