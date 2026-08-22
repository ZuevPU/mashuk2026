import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canSilentEditEveningForm } from '../services/adminEveningForm.js';

describe('forum results evening form', () => {
  it('lets admin and superadmin silently edit participant answers', async () => {
    assert.equal(await canSilentEditEveningForm({ adminLogin: 'zuev', adminRole: 'superadmin' } as never), true);
    assert.equal(await canSilentEditEveningForm({ adminLogin: 'admin', adminRole: 'admin' } as never), true);
    assert.equal(await canSilentEditEveningForm({ adminLogin: 'serveeva', adminRole: 'admin' } as never), true);
  });
});
