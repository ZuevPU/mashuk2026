import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerLadderBucket,
  lenBin,
  medianFirstReplyMinutes,
  topShareCounts,
} from '../services/analytics/exchangeHubMetrics.js';

describe('exchangeHubMetrics', () => {
  it('answerLadderBucket', () => {
    assert.equal(answerLadderBucket(1), '1 ответ');
    assert.equal(answerLadderBucket(4), '2–4');
    assert.equal(answerLadderBucket(10), '5–10');
    assert.equal(answerLadderBucket(11), '11 и больше');
  });

  it('lenBin', () => {
    assert.equal(lenBin(10), 'меньше 20 знаков');
    assert.equal(lenBin(40), '20–59');
    assert.equal(lenBin(100), '60–149');
    assert.equal(lenBin(200), '150 и больше');
  });

  it('medianFirstReplyMinutes', () => {
    const t0 = new Date('2026-08-10T10:00:00Z');
    const t30 = new Date('2026-08-10T10:30:00Z');
    const t60 = new Date('2026-08-10T11:00:00Z');
    assert.equal(
      medianFirstReplyMinutes([
        { askedAt: t0, firstAnswerAt: t30 },
        { askedAt: t0, firstAnswerAt: t60 },
      ]),
      45,
    );
  });

  it('topShareCounts', () => {
    assert.ok(topShareCounts([40, 20, 5, 1, 1], 2) > 50);
  });
});
