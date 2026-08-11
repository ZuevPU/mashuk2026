import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maxQrSuccessesPerForumDay } from '../services/qrScanGuard.js';

describe('maxQrSuccessesPerForumDay', () => {
  it('allows one success for once/daily', () => {
    assert.equal(maxQrSuccessesPerForumDay('once', 5), 1);
    assert.equal(maxQrSuccessesPerForumDay('daily', 5), 1);
  });

  it('uses dailyRepeatLimit for repeatable/multiple', () => {
    assert.equal(maxQrSuccessesPerForumDay('repeatable', 3), 3);
    assert.equal(maxQrSuccessesPerForumDay('multiple', 2), 2);
    assert.equal(maxQrSuccessesPerForumDay('repeatable', null), 1);
    assert.equal(maxQrSuccessesPerForumDay('repeatable', 0), 1);
  });
});
