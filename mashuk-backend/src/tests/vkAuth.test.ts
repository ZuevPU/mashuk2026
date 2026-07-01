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
});
