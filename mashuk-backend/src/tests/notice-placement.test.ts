import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticePlacement } from '../controllers/homeNoticeController.js';

describe('parseNoticePlacement', () => {
  it('defaults to home', () => {
    assert.equal(parseNoticePlacement(undefined), 'home');
    assert.equal(parseNoticePlacement(''), 'home');
    assert.equal(parseNoticePlacement('other'), 'home');
  });

  it('accepts tasks and home', () => {
    assert.equal(parseNoticePlacement('tasks'), 'tasks');
    assert.equal(parseNoticePlacement('HOME'), 'home');
  });
});
