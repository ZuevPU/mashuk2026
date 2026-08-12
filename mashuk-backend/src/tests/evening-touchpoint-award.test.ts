import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  touchpointCompletionRatio,
  touchpointCompletionRatioCumulative,
  buildTouchpointItemsForDay,
  isEveningTouchpointSlot,
} from '../services/touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';

describe('evening questionnaire as touchpoint 7', () => {
  it('identifies evening slot', () => {
    const evening = TOUCHPOINT_SLOTS.find(s => s.index === 7)!;
    assert.equal(isEveningTouchpointSlot(evening), true);
    assert.equal(isEveningTouchpointSlot(TOUCHPOINT_SLOTS[0]), false);
  });

  it('ratio without marker: eveningDone adds exactly one slot', () => {
    const off = touchpointCompletionRatio([], new Set(), 1, { eveningDone: false });
    const on = touchpointCompletionRatio([], new Set(), 1, { eveningDone: true });
    // Без опубликованных вопросов ожидается только слот итогов дня
    assert.equal(off.expected, 1);
    assert.equal(off.completed, 0);
    assert.equal(on.completed, 1);
    assert.equal(on.expected, 1);
  });

  it('cumulative counts eveningDoneDays across days', () => {
    const { completed, expected } = touchpointCompletionRatioCumulative(
      [],
      new Set(),
      3,
      { eveningDoneDays: new Set([1, 3]) },
    );
    assert.equal(completed, 2);
    assert.equal(expected, 3);
  });

  it('items: eveningRatings alone marks slot 7 done', () => {
    const items = buildTouchpointItemsForDay([], new Set(), 4, 4, new Date(), {
      eveningDone: true,
    });
    assert.equal(items.filter(i => i.state === 'done').length, 1);
    assert.equal(items[6].state, 'done');
    assert.equal(items[6].title, 'Итоговая анкета по дню');
  });
});
