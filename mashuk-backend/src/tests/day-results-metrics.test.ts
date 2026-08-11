import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  directionSpread,
  deviation,
  formalSharePct,
  isFormalAnswer,
  lowSharePct,
  pickGroupExtremes,
  scaleDist,
  transferIndexPct,
} from '../services/analytics/dayResultsMetrics.js';

describe('dayResultsMetrics', () => {
  it('lowSharePct counts ratings 1–3', () => {
    const dist = scaleDist([1, 2, 3, 4, 5, 5, 5, 5, 5, 5]);
    assert.deepEqual(dist, [1, 1, 1, 1, 6]);
    assert.equal(lowSharePct(dist), 30);
  });

  it('directionSpread ignores small n', () => {
    const spread = directionSpread([
      { n: 12, mean: 4.8 },
      { n: 11, mean: 4.1 },
      { n: 5, mean: 3.0 },
    ], 10);
    assert.equal(spread, 0.7);
  });

  it('deviation is value − baseline', () => {
    assert.equal(deviation(4.09, 4.45), -0.36);
  });

  it('pickGroupExtremes requires n ≥ 8', () => {
    const { worst, best } = pickGroupExtremes([
      {
        group: '2Ж', dir: 'Флагманы', n: 10, idx: 4.12,
        byBlock: { food: { mean: 3.4, n: 10, label: 'Питание' } },
      },
      {
        group: 'tiny', dir: 'X', n: 5, idx: 3.5,
        byBlock: { food: { mean: 2, n: 5, label: 'Питание' } },
      },
      {
        group: '1И', dir: 'Учителя', n: 10, idx: 4.88,
        byBlock: { food: { mean: 5, n: 10, label: 'Питание' } },
      },
    ]);
    assert.equal(worst.length, 2);
    assert.equal(worst[0].group, '2Ж');
    assert.equal(worst[0].weak, 'Питание');
    assert.equal(best[0].group, '1И');
    assert.ok(!worst.some(w => w.group === 'tiny'));
  });

  it('isFormalAnswer catches short and stop-list', () => {
    assert.equal(isFormalAnswer('.'), true);
    assert.equal(isFormalAnswer('все ок'), true);
    assert.equal(isFormalAnswer('Очень полезный день'), false);
  });

  it('formalSharePct and transferIndexPct', () => {
    assert.equal(formalSharePct(['.', 'ок', 'длинный осмысленный ответ']), 66.7);
    const pct = transferIndexPct([
      { name: 'Получилось естественно', n: 31 },
      { name: 'Получилось, но было непривычно', n: 18 },
      { name: 'Попробовал(а), но пока не понимаю результат', n: 22 },
      { name: 'Осознанно решил(а) отказаться', n: 29 },
    ]);
    assert.equal(pct, 49);
  });
});
