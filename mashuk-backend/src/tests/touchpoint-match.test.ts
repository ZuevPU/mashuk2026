import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import {
  findTouchpointQuestionForSlot,
  questionMatchesTouchpointSlot,
  touchpointCompletionRatio,
} from '../services/touchpointProgress.js';

describe('touchpoint slot matching', () => {
  const morningSlot = TOUCHPOINT_SLOTS[0];

  it('matches checkin by block and timePoint when title differs', () => {
    const q = {
      id: 99,
      title: 'Как ты сегодня утром?',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      questionKind: 'state_check',
    };
    assert.equal(questionMatchesTouchpointSlot(q, morningSlot), true);
    const found = findTouchpointQuestionForSlot([q as never], morningSlot);
    assert.equal(found?.id, 99);
  });

  it('counts completion when answer is on alias checkin question', () => {
    const q = {
      id: 42,
      title: 'Утро: настроение',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const { completed } = touchpointCompletionRatio([q as never], new Set([42]), 2);
    assert.equal(completed, 1);
  });
});
