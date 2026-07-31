import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAgeCategory, matchesActivity } from '../services/analytics/cohortFilters.js';
import { cosineSimilarity, tokenVector } from '../services/gigachatService.js';
import { computeShiftEndDate } from '../services/exports/delayedMeasureService.js';

describe('cohortFilters', () => {
  it('matches age buckets', () => {
    assert.equal(matchesAgeCategory(20, '18-24'), true);
    assert.equal(matchesAgeCategory(20, '25-34'), false);
    assert.equal(matchesAgeCategory(null, '18-24'), false);
    assert.equal(matchesAgeCategory(30, null), true);
  });

  it('matches activity by position substring', () => {
    assert.equal(matchesActivity('Учитель биологии', 'учитель'), true);
    assert.equal(matchesActivity('Директор', 'учитель'), false);
  });
});

describe('gigachat embeddings fallback', () => {
  it('cosineSimilarity identical vectors = 1', () => {
    const v = tokenVector('образование школа будущее');
    assert.ok(cosineSimilarity(v, v) > 0.99);
  });
});

describe('shift auto rotate helper', () => {
  it('computeShiftEndDate for 8-day shift', () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = computeShiftEndDate(start, 8);
    assert.equal(end?.toISOString().slice(0, 10), '2026-07-08');
  });
});
