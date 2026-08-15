import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeExchangeLimitsFromLevels,
  normalizeExchangeLimitsInput,
  resolveExchangeLimitsConfig,
} from '../services/exchangeLimits.js';

describe('exchangeLimits config', () => {
  it('resolveExchangeLimitsConfig falls back when raw empty', () => {
    const cfg = resolveExchangeLimitsConfig(null);
    assert.equal(typeof cfg.maxQuestionsTotal, 'number');
    assert.equal(typeof cfg.maxAnswersForPoints, 'number');
    assert.equal(typeof cfg.pointsPerQuestion, 'number');
    assert.equal(typeof cfg.pointsPerAnswer, 'number');
    assert.ok(cfg.maxQuestionsTotal >= 0);
    assert.ok(cfg.maxAnswersForPoints >= 0);
  });

  it('resolveExchangeLimitsConfig reads admin values', () => {
    const cfg = resolveExchangeLimitsConfig({
      maxQuestionsTotal: 7,
      maxAnswersForPoints: 12,
      pointsPerQuestion: 4,
      pointsPerAnswer: 6,
    });
    assert.equal(cfg.maxQuestionsTotal, 7);
    assert.equal(cfg.maxAnswersForPoints, 12);
    assert.equal(cfg.pointsPerQuestion, 4);
    assert.equal(cfg.pointsPerAnswer, 6);
  });

  it('resolveExchangeLimitsConfig supports legacy maxAnswersPerDay', () => {
    const cfg = resolveExchangeLimitsConfig({
      maxQuestionsTotal: 2,
      maxAnswersPerDay: 9,
      pointsPerQuestion: 1,
      pointsPerAnswer: 2,
    });
    assert.equal(cfg.maxAnswersForPoints, 9);
  });

  it('normalizeExchangeLimitsInput rejects invalid', () => {
    assert.equal(normalizeExchangeLimitsInput(null), null);
    assert.equal(normalizeExchangeLimitsInput({
      maxQuestionsTotal: -1,
      maxAnswersForPoints: 1,
      pointsPerQuestion: 1,
      pointsPerAnswer: 1,
    }), null);
    assert.equal(normalizeExchangeLimitsInput({ maxQuestionsTotal: 1 }), null);
  });

  it('normalizeExchangeLimitsInput floors numbers', () => {
    const cfg = normalizeExchangeLimitsInput({
      maxQuestionsTotal: 3.9,
      maxAnswersForPoints: 5.1,
      pointsPerQuestion: 2.8,
      pointsPerAnswer: 4.2,
    });
    assert.deepEqual(cfg, {
      maxQuestionsTotal: 3,
      maxAnswersForPoints: 5,
      pointsPerQuestion: 2,
      pointsPerAnswer: 4,
    });
  });

  it('mergeExchangeLimitsFromLevels copies stakes from the levels table', () => {
    const current = resolveExchangeLimitsConfig({
      maxQuestionsTotal: 3,
      maxAnswersForPoints: 5,
      pointsPerQuestion: 3,
      pointsPerAnswer: 5,
    });
    const merged = mergeExchangeLimitsFromLevels(current, {
      questionPoints: 7,
      answerPoints: 4,
      answerMax: 8,
      questionMax: 16,
    }, 8);
    assert.equal(merged.pointsPerQuestion, 7);
    assert.equal(merged.pointsPerAnswer, 4);
    assert.equal(merged.maxAnswersForPoints, 8);
    assert.equal(merged.maxQuestionsTotal, 2);
  });
});
