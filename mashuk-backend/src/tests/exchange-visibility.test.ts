import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeQuestionAnswerable,
  participantCanAnswerExchangeQuestion,
  participantCanViewExchangeQuestion,
  sameExchangeShift,
} from '../services/exchangeVisibility.js';

describe('exchange shift isolation', () => {
  const shift1 = { id: 10, direction: 'IT', shiftId: 1 };
  const shift2 = { id: 20, direction: 'IT', shiftId: 2 };
  const q = { participantId: 10, audience: 'all', moderationStatus: 'approved' };

  it('only approved questions are answerable', () => {
    assert.equal(exchangeQuestionAnswerable('approved'), true);
    assert.equal(exchangeQuestionAnswerable('pending'), false);
    assert.equal(exchangeQuestionAnswerable(null), false);
  });

  it('same-shift peers can see approved questions', () => {
    assert.equal(sameExchangeShift(shift1, 1), true);
    assert.equal(participantCanViewExchangeQuestion(q, { ...shift1, id: 11 }, shift1), true);
  });

  it('other-shift participants cannot see or answer another shift question', () => {
    assert.equal(sameExchangeShift(shift2, 1), false);
    assert.equal(participantCanViewExchangeQuestion(q, shift2, shift1), false);
    assert.equal(
      participantCanAnswerExchangeQuestion(q, shift2, shift1),
      'Этот вопрос из другой смены',
    );
  });

  it('author still sees own question from any viewer context of the same account', () => {
    assert.equal(participantCanViewExchangeQuestion(q, shift1, shift1), true);
  });
});
