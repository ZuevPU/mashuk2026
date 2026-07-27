import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pushCategoryOf, deliverToVkUser } from '../services/pushService.js';

describe('§10 push delivery', () => {
  it('pushCategoryOf covers exchange transactional', () => {
    assert.equal(pushCategoryOf('transactional_exchange_answer_received'), 'exchange');
  });

  it('deliverToVkUser without tokens skips', async () => {
    const status = await deliverToVkUser(1, 'test');
    assert.match(status, /skipped/);
  });
});
