import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAutoNotifyTouchpointQuestion,
  isQuestionLiveNow,
  touchpointOpenTrigger,
} from '../services/questionAutoNotify.js';

describe('questionAutoNotify helpers', () => {
  it('marks state_check and after_blocks for auto notify', () => {
    assert.equal(isAutoNotifyTouchpointQuestion({
      questionKind: 'state_check',
      title: 'Дневная проверка состояния',
    }), true);
    assert.equal(isAutoNotifyTouchpointQuestion({
      questionKind: 'after_blocks',
      title: 'Осмысление по направлению',
    }), true);
    assert.equal(isAutoNotifyTouchpointQuestion({
      block: 'Точки осмысления',
      title: 'Осмысление урока',
    }), true);
  });

  it('skips evening / practices / diagnostic', () => {
    assert.equal(isAutoNotifyTouchpointQuestion({ questionKind: 'day_summary' }), false);
    assert.equal(isAutoNotifyTouchpointQuestion({ questionKind: 'practices_vote' }), false);
    assert.equal(isAutoNotifyTouchpointQuestion({ questionKind: 'diagnostic' }), false);
    assert.equal(isAutoNotifyTouchpointQuestion({ isHidden: true, questionKind: 'state_check' }), false);
  });

  it('is live only when published and publishTime passed', () => {
    const now = new Date('2026-08-12T12:00:00+03:00');
    assert.equal(isQuestionLiveNow({
      status: 'published',
      publishTime: new Date('2026-08-12T11:00:00+03:00'),
    }, now), true);
    assert.equal(isQuestionLiveNow({
      status: 'published',
      publishTime: new Date('2026-08-12T13:00:00+03:00'),
    }, now), false);
    assert.equal(isQuestionLiveNow({ status: 'draft' }, now), false);
    assert.equal(isQuestionLiveNow({ status: 'published', isHidden: true }, now), false);
    assert.equal(isQuestionLiveNow({ status: 'published', publishTime: null }, now), true);
    assert.equal(isQuestionLiveNow({
      status: 'published',
      publishTime: new Date('2026-08-12T11:00:00+03:00'),
      closeTime: new Date('2026-08-12T11:30:00+03:00'),
    }, now), false);
  });

  it('builds stable open trigger', () => {
    assert.equal(touchpointOpenTrigger(42), 'touchpoint_open_42');
  });
});
