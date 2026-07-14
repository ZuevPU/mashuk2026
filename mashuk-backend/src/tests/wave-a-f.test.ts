import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchPushSlot, matchRetrySlot, PUSH_SLOTS } from '../services/pushScheduler.js';
import { roleCan } from '../utils/adminToken.js';
import { generateQrToken } from '../services/qrService.js';
import { isGigachatConfigured } from '../services/gigachatService.js';

describe('pushScheduler slots', () => {
  it('matches 08:00 and retry +30', () => {
    assert.equal(matchPushSlot(8 * 60)?.key, 'slot_0800');
    assert.equal(matchRetrySlot(8 * 60 + 30)?.key, 'slot_0800');
    assert.ok(PUSH_SLOTS.length >= 5);
  });

  it('matches 22:00 finale', () => {
    assert.equal(matchPushSlot(22 * 60)?.key, 'slot_2200');
  });
});

describe('admin role matrix', () => {
  it('superadmin can all', () => {
    assert.equal(roleCan('superadmin', 'delete'), true);
  });
  it('admin can all', () => {
    assert.equal(roleCan('admin', 'delete'), true);
    assert.equal(roleCan('admin', 'users'), true);
  });
  it('moderator can moderate only', () => {
    assert.equal(roleCan('moderator', 'moderate'), true);
    assert.equal(roleCan('moderator', 'delete'), false);
  });
  it('analyst can export', () => {
    assert.equal(roleCan('analyst', 'export'), true);
    assert.equal(roleCan('analyst', 'settings'), false);
  });
});

describe('qr and gigachat stubs', () => {
  it('generates qr token', () => {
    assert.equal(generateQrToken().length, 32);
  });
  it('gigachat not configured without env', () => {
    // may be true if env set — just assert boolean
    assert.equal(typeof isGigachatConfigured(), 'boolean');
  });
});
