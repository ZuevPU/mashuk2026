import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import {
  buildTouchpointItemsForDay,
  findTouchpointQuestionForSlot,
  questionMatchesTouchpointSlot,
  touchpointCompletionRatio,
} from '../services/touchpointProgress.js';

describe('touchpoint slot matching', () => {
  const morningSlot = TOUCHPOINT_SLOTS[0];
  const directionSlot = TOUCHPOINT_SLOTS.find(s => s.title === 'Осмысление по направлению')!;

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

  it('matches sense-making without requiring type=open', () => {
    const q = {
      id: 11,
      title: 'Рефлексия по направлению',
      type: 'text',
      block: 'Точки осмысления',
      timePoint: 'день',
      questionKind: null as string | null,
    };
    assert.equal(questionMatchesTouchpointSlot(q, directionSlot), true);
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

  it('marks slot done if older twin answered while newer is preferred for CTA', () => {
    const older = {
      id: 10,
      title: 'Утренняя проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      dayNumber: 1,
      dayNumbers: [1],
      publishTime: new Date('2026-07-31T05:00:00Z'),
      closeTime: new Date('2026-07-31T07:00:00Z'),
    };
    const newer = {
      ...older,
      id: 99,
      publishTime: new Date('2099-01-01T05:00:00Z'),
      closeTime: new Date('2099-01-01T07:00:00Z'),
    };
    const items = buildTouchpointItemsForDay(
      [older, newer] as never,
      new Set([10]),
      1,
      1,
      new Date('2026-07-31T06:00:00Z'),
    );
    const morning = items[0];
    assert.equal(morning.state, 'done');
  });
});
