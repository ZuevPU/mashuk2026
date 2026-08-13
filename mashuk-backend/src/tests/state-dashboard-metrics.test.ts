import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransition,
  cellNeg,
  classifyReasonTheme,
  countThemes,
  isPsychoReason,
  negSharePct,
  quotePolarity,
  zoneDistCounts,
} from '../services/analytics/stateDashboardMetrics.js';

describe('stateDashboardMetrics', () => {
  it('negSharePct needs n ≥ 5', () => {
    assert.equal(negSharePct([1, 1, 1, 1, 0]), null);
    assert.equal(negSharePct([2, 2, 2, 2, 2]), 40);
  });

  it('zoneDistCounts follows lift→risk order', () => {
    assert.deepEqual(
      zoneDistCounts(['lift', 'risk', 'fatigue', 'lift', null]),
      [2, 0, 0, 1, 1],
    );
  });

  it('cellNeg greys out small samples', () => {
    assert.deepEqual(cellNeg(3, 2), { n: 3, neg: null });
    assert.deepEqual(cellNeg(8, 2), { n: 8, neg: 25 });
  });

  it('classifies reason themes and psycho markers', () => {
    assert.equal(classifyReasonTheme('Не выспался совсем'), 'Сон и режим');
    assert.equal(isPsychoReason('Тревога за близких дома'), true);
    const themes = countThemes([
      'Очередь в душ',
      'Бот не работает',
      'Тревога за семью',
    ]);
    assert.ok(themes.some(t => t.name === 'Быт и инфраструктура'));
    assert.ok(!themes.some(t => t.name === 'Внешние события'));
  });

  it('quotePolarity maps emotion zones to tone', () => {
    assert.equal(quotePolarity('risk'), 'neg');
    assert.equal(quotePolarity('fatigue'), 'neg');
    assert.equal(quotePolarity('lift'), 'pos');
    assert.equal(quotePolarity('engagement'), 'pos');
    assert.equal(quotePolarity('neutral'), 'neu');
    assert.equal(quotePolarity(null), 'neu');
  });

  it('buildTransition fills 5×5 matrix', () => {
    const t = buildTransition([
      { from: 'lift', to: 'lift' },
      { from: 'lift', to: 'risk' },
      { from: 'risk', to: 'risk' },
    ]);
    assert.equal(t.n, 3);
    assert.equal(t.m[0][0], 1);
    assert.equal(t.m[0][4], 1);
    assert.equal(t.m[4][4], 1);
  });
});
