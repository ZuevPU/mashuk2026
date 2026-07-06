import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedLaunchParams, verifyVkLaunchParams } from '../utils/vkSign.js';

describe('vk launch params', () => {
  const SECRET = 'test-secret';

  it('builds valid sign payload', () => {
    const raw = buildSignedLaunchParams(42, SECRET);
    const params = new URLSearchParams(raw);
    assert.equal(params.get('vk_user_id'), '42');
    assert.ok(params.get('sign'));
  });

  it('detects expired ts', () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 90000);
    const raw = buildSignedLaunchParams(1, SECRET, { vk_ts: oldTs });
    assert.equal(verifyVkLaunchParams(raw, SECRET).ok, false);
  });

  it('accepts fresh ts', () => {
    const raw = buildSignedLaunchParams(1, SECRET);
    assert.equal(verifyVkLaunchParams(raw, SECRET).ok, true);
  });

  it('accepts official VK documentation example', () => {
    const raw =
      'vk_user_id=494075&vk_app_id=6736218&vk_is_app_user=1&vk_are_notifications_enabled=1&vk_language=ru&vk_access_token_settings=&vk_platform=android&sign=htQFduJpLxz7ribXRZpDFUH-XEUhC9rBPTJkjUFEkRA';
    const result = verifyVkLaunchParams(raw, 'wvl68m4dR1UpLrVRli');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.vkUserId, 494075);
  });

  it('accepts params with comma in vk_access_token_settings', () => {
    const raw = buildSignedLaunchParams(99, SECRET, {
      vk_access_token_settings: 'friends,photos',
    });
    assert.equal(verifyVkLaunchParams(raw, SECRET).ok, true);
  });
});
