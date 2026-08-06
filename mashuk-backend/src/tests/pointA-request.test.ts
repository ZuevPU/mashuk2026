import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPointARequestItems, POINT_A_REQUEST_CANONICAL } from '../services/pointARequest.js';
import { parseOutcomesForDisplay } from '../services/profileOutcomes.js';

describe('buildPointARequestItems', () => {
  it('picks goal and criteria questions with labels', () => {
    const questions = [
      POINT_A_REQUEST_CANONICAL[0],
      'Лишний вопрос про направление',
      POINT_A_REQUEST_CANONICAL[1],
    ];
    const answers = ['Цель: форматы', 'не показывать', '10 форматов'];
    const items = buildPointARequestItems(questions, answers);
    assert.equal(items.length, 2);
    assert.equal(items[0].question, POINT_A_REQUEST_CANONICAL[0]);
    assert.equal(items[0].answer, 'Цель: форматы');
    assert.equal(items[1].question, POINT_A_REQUEST_CANONICAL[1]);
    assert.equal(items[1].answer, '10 форматов');
  });

  it('falls back to first two when labels are generic', () => {
    const items = buildPointARequestItems(
      ['Вопрос 1', 'Вопрос 2', 'Вопрос 3'],
      ['a', 'b', 'c'],
    );
    assert.equal(items.length, 2);
    assert.equal(items[0].answer, 'a');
    assert.equal(items[1].answer, 'b');
  });
});

describe('parseOutcomesForDisplay', () => {
  it('dedupes identical bullets', () => {
    const out = parseOutcomesForDisplay(
      { bullets: ['Одна мысль', 'Одна мысль', 'Другая'] },
      [],
    );
    assert.deepEqual(out, ['Одна мысль', 'Другая']);
  });
});
