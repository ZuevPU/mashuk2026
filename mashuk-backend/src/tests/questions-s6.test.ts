import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getReflectionTypeLabel, reflectionKindFromQuestion } from '../services/reflectionTypeLabel.js';
import { pointsTrackForAction } from '../services/pointsService.js';
import { isSameMoscowCalendarDay } from '../services/timePhase.js';

describe('§6 reflection labels', () => {
  it('maps point B block to label', () => {
    assert.equal(getReflectionTypeLabel({ block: 'Точка Б' }), 'Точка Б');
    assert.equal(reflectionKindFromQuestion({ reflectionKind: 'point_a' }), 'point_a');
  });

  it('maps checkin to state check', () => {
    assert.equal(getReflectionTypeLabel({ type: 'checkin', block: '' }), 'Проверка состояния');
  });

  it('maps lesson reflection title', () => {
    assert.equal(getReflectionTypeLabel({ title: 'Осмысление урока слот 1', block: '' }), 'После события');
  });
});

describe('§6 points tracks', () => {
  it('exchange actions award path track (§9)', () => {
    assert.equal(pointsTrackForAction('exchange_question'), 'path');
    assert.equal(pointsTrackForAction('exchange_answer'), 'path');
  });

  it('reflection and point completions stay on path', () => {
    assert.equal(pointsTrackForAction('question_answer'), 'path');
    assert.equal(pointsTrackForAction('point_b_complete'), 'path');
    assert.equal(pointsTrackForAction('evening_complete'), 'path');
  });
});

describe('§6 answered today MSK', () => {
  it('compares calendar days in Moscow', () => {
    const now = new Date();
    assert.equal(isSameMoscowCalendarDay(now, now), true);
  });
});
