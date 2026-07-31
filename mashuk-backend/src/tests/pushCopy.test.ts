import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushCopy, qTitle } from '../services/pushCopy.js';

describe('pushCopy', () => {
  it('formats task moderation texts', () => {
    assert.match(pushCopy.taskPendingModerator('тестик'), /на проверку/);
    assert.match(pushCopy.taskApproved('тестик', 19), /\+19 к опыту/);
    assert.match(pushCopy.taskRejected('тестик', 'мало деталей'), /мало деталей/);
    assert.doesNotMatch(pushCopy.taskApproved('x', 1), /⚡/);
  });

  it('truncates long titles', () => {
    const long = 'а'.repeat(100);
    assert.ok(qTitle(long).length <= 81);
  });

  it('slot texts avoid hash deep links', () => {
    assert.doesNotMatch(pushCopy.slots.slot_2200.text, /#\?/);
    assert.doesNotMatch(pushCopy.slots.slot_2200.retryText, /#\?/);
  });
});
