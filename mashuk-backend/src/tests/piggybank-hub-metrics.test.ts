import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasActionTag,
  isAutoBookmark,
  ladderBucket,
  topShareCounts,
} from '../services/analytics/piggybankHubMetrics.js';

describe('piggybankHubMetrics', () => {
  it('isAutoBookmark detects program material saves', () => {
    assert.equal(isAutoBookmark('Блок: Направление\nМатериал: Лекция'), true);
    assert.equal(isAutoBookmark('Материал: Файл\nСсылка: https://x'), true);
    assert.equal(isAutoBookmark('  Блок: Урок'), true);
    assert.equal(isAutoBookmark('Своя мысль про практику'), false);
    assert.equal(isAutoBookmark(''), false);
  });

  it('hasActionTag', () => {
    assert.equal(hasActionTag(['мысль', 'в работу']), true);
    assert.equal(hasActionTag(['на будущее']), true);
    assert.equal(hasActionTag(['мысль', 'идея']), false);
  });

  it('ladderBucket', () => {
    assert.equal(ladderBucket(1), '1 запись');
    assert.equal(ladderBucket(3), '2–3');
    assert.equal(ladderBucket(7), '4–7');
    assert.equal(ladderBucket(8), '8 и больше');
  });

  it('topShareCounts', () => {
    const counts = [31, 10, 5, 2, 1, 1, 1, 1, 1, 1, 1];
    assert.ok(topShareCounts(counts, 10) > 50);
  });
});
