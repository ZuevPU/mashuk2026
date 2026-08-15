import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isForumResultsScoreEditor } from '../services/adminEveningForm.js';

describe('isForumResultsScoreEditor', () => {
  it('allows only admin zuev', () => {
    assert.equal(isForumResultsScoreEditor('zuev'), true);
    assert.equal(isForumResultsScoreEditor('Zuev'), true);
    assert.equal(isForumResultsScoreEditor(' zuev '), true);
  });

  it('hides the editor from every other login', () => {
    assert.equal(isForumResultsScoreEditor('serveeva'), false);
    assert.equal(isForumResultsScoreEditor('avakan'), false);
    assert.equal(isForumResultsScoreEditor('admin'), false);
    assert.equal(isForumResultsScoreEditor(''), false);
    assert.equal(isForumResultsScoreEditor(null), false);
  });
});
