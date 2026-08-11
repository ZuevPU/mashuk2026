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

  it('does not offer hidden question as touchpoint CTA', () => {
    const hidden = {
      id: 50,
      title: 'Утренняя проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      questionKind: 'state_check',
      dayNumber: 1,
      dayNumbers: [1],
      isHidden: true,
      publishTime: new Date('2026-07-31T05:00:00Z'),
      closeTime: new Date('2026-07-31T07:00:00Z'),
    };
    assert.equal(findTouchpointQuestionForSlot([hidden as never], morningSlot), undefined);
    const items = buildTouchpointItemsForDay(
      [hidden as never],
      new Set(),
      1,
      1,
      new Date('2026-07-31T06:00:00Z'),
    );
    assert.equal(items[0].state, 'pending');
    assert.notEqual(items[0].id, 50);
  });

  it('prefers visible twin over hidden for CTA', () => {
    const hidden = {
      id: 100,
      title: 'Утренняя проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      questionKind: 'state_check',
      dayNumber: 1,
      dayNumbers: [1],
      isHidden: true,
      publishTime: new Date('2026-07-31T05:00:00Z'),
      closeTime: new Date('2026-07-31T07:00:00Z'),
    };
    const visible = { ...hidden, id: 80, isHidden: false };
    const found = findTouchpointQuestionForSlot([hidden, visible] as never, morningSlot, {
      currentDay: 1,
      now: new Date('2026-07-31T06:00:00Z'),
    });
    assert.equal(found?.id, 80);
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

  it('counts evening slot from eveningRatings without marker question', () => {
    const { completed } = touchpointCompletionRatio([], new Set(), 3, { eveningDone: true });
    assert.equal(completed, 1);
    assert.equal(TOUCHPOINT_SLOTS.length, 7);
  });

  it('does not double-count evening slot when marker answered and eveningDone', () => {
    const marker = {
      id: 77,
      title: 'Итоговая анкета по дню',
      type: 'open',
      block: 'Итоги дня',
      timePoint: 'вечер',
      dayNumber: 3,
      dayNumbers: [3],
    };
    const { completed } = touchpointCompletionRatio(
      [marker as never],
      new Set([77]),
      3,
      { eveningDone: true },
    );
    assert.equal(completed, 1);
  });

  it('marks evening item done from eveningRatings even without marker questions', () => {
    const items = buildTouchpointItemsForDay(
      [] as never,
      new Set(),
      2,
      2,
      new Date(),
      { eveningDone: true },
    );
    const evening = items.find(i => i.title === 'Итоговая анкета по дню');
    assert.ok(evening);
    assert.equal(evening!.state, 'done');
  });
});
