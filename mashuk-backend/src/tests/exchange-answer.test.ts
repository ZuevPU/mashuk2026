import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeQuestionAnswerable } from '../services/exchangeVisibility.js';

describe('exchange moderation', () => {
  it('only approved questions are answerable', () => {
    assert.equal(exchangeQuestionAnswerable('approved'), true);
    assert.equal(exchangeQuestionAnswerable('pending'), false);
    assert.equal(exchangeQuestionAnswerable(null), false);
    assert.equal(exchangeQuestionAnswerable(''), false);
  });
});
