import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function exchangeQuestionAnswerable(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'approved';
}

describe('exchange moderation', () => {
  it('only approved questions are answerable', () => {
    assert.equal(exchangeQuestionAnswerable('approved'), true);
    assert.equal(exchangeQuestionAnswerable('pending'), false);
    assert.equal(exchangeQuestionAnswerable(null), false);
    assert.equal(exchangeQuestionAnswerable(''), false);
  });
});
