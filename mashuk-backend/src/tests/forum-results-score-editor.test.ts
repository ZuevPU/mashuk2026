import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canSilentEditEveningForm, isForumResultsScoreEditor } from '../services/adminEveningForm.js';

describe('forum results evening form', () => {
  it('does not allow any admin login to edit participant answers', () => {
    assert.equal(isForumResultsScoreEditor('zuev'), false);
    assert.equal(isForumResultsScoreEditor('Zuev'), false);
    assert.equal(isForumResultsScoreEditor('serveeva'), false);
    assert.equal(isForumResultsScoreEditor('admin'), false);
    assert.equal(isForumResultsScoreEditor(''), false);
    assert.equal(isForumResultsScoreEditor(null), false);
  });

  it('silent edit is off for every role', async () => {
    assert.equal(await canSilentEditEveningForm({ adminLogin: 'zuev', adminRole: 'superadmin' } as never), false);
    assert.equal(await canSilentEditEveningForm({ adminLogin: 'admin', adminRole: 'admin' } as never), false);
  });
});
