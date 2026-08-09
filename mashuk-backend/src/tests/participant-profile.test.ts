import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileRecommendations,
  engagementSegment,
  normalizeScaleToPct,
  numericSummary,
  PROFILE_RULE_THRESHOLDS,
} from '../services/analytics/participantProfileStats.js';

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
    assert.ok(!Number.isNaN(s.avg as never));
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

describe('participant profile coverage uniqueness (unit)', () => {
  it('one participant counted once in Set-based coverage', () => {
    const ids = [1, 1, 1, 2, 3, 2];
    const unique = new Set(ids);
    assert.equal(unique.size, 3);
    const pct = Math.round((unique.size / 10) * 1000) / 10;
    assert.equal(pct, 30);
  });
});
