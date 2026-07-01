import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { buildSignedLaunchParams } from '../utils/vkSign.js';

const SECRET = process.env.VK_APP_SECRET || 'test-vk-secret-for-ci';
const strictMode = process.env.SKIP_VK_SIGN === 'false';

describe('vk auth strict (SKIP_VK_SIGN=false)', { skip: !strictMode }, () => {
  const app = createApp();

  it('rejects /api/auth/me without Bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects /api/auth/me with invalid sign', async () => {
    const raw = buildSignedLaunchParams(42, SECRET);
    const tampered = raw.replace(/sign=[^&]+/, 'sign=invalid');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);
    assert.equal(res.status, 401);
  });

  it('rejects /api/auth/me with expired vk_ts', async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 90000);
    const raw = buildSignedLaunchParams(42, SECRET, { vk_ts: oldTs });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${raw}`);
    assert.equal(res.status, 401);
  });

  it('accepts /api/auth/me with valid signed launch params', async () => {
    const vkId = 888777;
    const raw = buildSignedLaunchParams(vkId, SECRET);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${raw}`);
    assert.equal(res.status, 200);
    assert.ok(['ok', 'needs_registration'].includes(res.body.status));
    if (res.body.status === 'needs_registration') {
      assert.equal(res.body.vkUserId, vkId);
    }
  });
});
