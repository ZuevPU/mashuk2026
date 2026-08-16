import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maxQrSuccessesPerForumDay } from '../services/qrScanGuard.js';

describe('maxQrSuccessesPerForumDay', () => {
  it('once with default limit stays one; once with a higher limit uses that number', () => {
    assert.equal(maxQrSuccessesPerForumDay('once', 1), 1);
    assert.equal(maxQrSuccessesPerForumDay('once', null), 1);
    assert.equal(maxQrSuccessesPerForumDay('once', 2), 2);
  });

  it('uses dailyRepeatLimit for daily as well as repeatable', () => {
    assert.equal(maxQrSuccessesPerForumDay('daily', 2), 2);
    assert.equal(maxQrSuccessesPerForumDay('daily', 1), 1);
    assert.equal(maxQrSuccessesPerForumDay('daily', null), 1);
  });

  it('uses dailyRepeatLimit for repeatable/multiple', () => {
    assert.equal(maxQrSuccessesPerForumDay('repeatable', 3), 3);
    assert.equal(maxQrSuccessesPerForumDay('multiple', 2), 2);
    assert.equal(maxQrSuccessesPerForumDay('repeatable', null), 1);
    assert.equal(maxQrSuccessesPerForumDay('repeatable', 0), 1);
  });
});
