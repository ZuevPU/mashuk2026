import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isQuestionLiveForAnalytics,
  stateCheckPhaseFromQuestion,
} from '../services/analytics/analyticsQuestionLive.js';

describe('isQuestionLiveForAnalytics', () => {
  const now = new Date('2026-08-12T12:00:00+03:00');

  it('excludes seeded published questions with future publishTime', () => {
    assert.equal(isQuestionLiveForAnalytics({
      status: 'published',
      publishTime: new Date('2026-08-12T13:00:00+03:00'),
    }, now), false);
  });

  it('includes published questions after publishTime', () => {
    assert.equal(isQuestionLiveForAnalytics({
      status: 'published',
      publishTime: new Date('2026-08-12T11:00:00+03:00'),
    }, now), true);
  });

  it('includes published with null publishTime', () => {
    assert.equal(isQuestionLiveForAnalytics({
      status: 'published',
      publishTime: null,
    }, now), true);
  });

  it('excludes draft and hidden', () => {
    assert.equal(isQuestionLiveForAnalytics({ status: 'draft' }, now), false);
    assert.equal(isQuestionLiveForAnalytics({
      status: 'published',
      isHidden: true,
    }, now), false);
  });
});

describe('stateCheckPhaseFromQuestion', () => {
  it('uses timePoint over answer clock', () => {
    const eveningAnswer = new Date('2026-08-12T20:00:00+03:00');
    assert.equal(
      stateCheckPhaseFromQuestion({ timePoint: 'Утро' }, eveningAnswer),
      'morning',
    );
    assert.equal(
      stateCheckPhaseFromQuestion({ timePoint: 'День' }, eveningAnswer),
      'day',
    );
    assert.equal(
      stateCheckPhaseFromQuestion({ timePoint: 'Вечер' }, eveningAnswer),
      'evening',
    );
  });

  it('title wins over wrong payload timePoint default утро', () => {
    assert.equal(
      stateCheckPhaseFromQuestion({
        title: 'Дневная проверка состояния',
        timePoint: 'утро',
      }, null),
      'day',
    );
    assert.equal(
      stateCheckPhaseFromQuestion({
        title: 'Вечерняя проверка состояния',
        timePoint: 'утро',
      }, null),
      'evening',
    );
  });

  it('falls back to title keywords', () => {
    assert.equal(
      stateCheckPhaseFromQuestion({ title: 'Дневная проверка состояния' }, null),
      'day',
    );
  });
});
