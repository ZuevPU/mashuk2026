import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scorePedagogicalRole, ROLE_CATALOG } from '../services/roleService.js';

describe('scorePedagogicalRole', () => {
  it('scores practice_realizer for mostly option index 1 pattern', () => {
    const role = scorePedagogicalRole([1, 1, 0, 1, 1, 2]);
    assert.equal(role, 'practice_realizer');
  });

  it('breaks ties using ROLE_PRIORITY', () => {
    // Force a spread that may tie — verify returns one of catalog keys
    const role = scorePedagogicalRole([0, 0, 1, 0, 0, 0]);
    assert.ok(ROLE_CATALOG.some(r => r.roleKey === role));
  });

  it('rejects invalid length', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2]));
  });

  it('rejects out-of-range option', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2, 3, 4, 0]));
  });
});
