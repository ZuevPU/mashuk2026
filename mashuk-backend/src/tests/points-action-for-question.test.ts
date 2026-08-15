import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pointsActionForQuestion } from '../services/pointsService.js';

describe('pointsActionForQuestion', () => {
  it('maps state-check by timePoint slot, not by title text', () => {
    assert.equal(pointsActionForQuestion({
      questionKind: 'state_check',
      timePoint: 'утро',
      title: 'Как проходит день',
    }), 'state_check_morning');
    assert.equal(pointsActionForQuestion({
      questionKind: 'state_check',
      timePoint: 'вечер',
      title: 'Утренние мысли',
    }), 'state_check_evening');
    assert.equal(pointsActionForQuestion({
      type: 'checkin',
      timePoint: 'день',
    }), 'state_check_day');
  });

  it('falls back to title only when timePoint is empty', () => {
    assert.equal(pointsActionForQuestion({
      questionKind: 'state_check',
      title: 'Утренняя проверка',
    }), 'state_check_morning');
  });

  it('keeps point B and regular touchpoints on their own actions', () => {
    assert.equal(pointsActionForQuestion({ block: 'Точка Б' }), 'point_b_complete');
    assert.equal(pointsActionForQuestion({
      questionKind: 'after_blocks',
      title: 'Что забрали с блока',
    }), 'question_answer');
  });
});
