import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupNameKey,
  groupSeatsLeft,
  groupsMatchingDirection,
  normalizeGroupName,
} from '../services/groupDirectionSync.js';

describe('groupsMatchingDirection', () => {
  const groups = [
    { id: 1, name: 'Ученые-1', directionId: 10 },
    { id: 2, name: 'Наставники-1', directionId: 20 },
    { id: 3, name: 'Общая', directionId: null },
  ];

  it('keeps groups of the chosen direction and unassigned groups', () => {
    assert.deepEqual(
      groupsMatchingDirection(groups, 10).map(g => g.id),
      [1, 3],
    );
  });

  it('does not fall back to a mismatched direction', () => {
    assert.deepEqual(
      groupsMatchingDirection(groups, 99).map(g => g.id),
      [3],
    );
  });

  it('returns empty when every group belongs to another direction', () => {
    assert.deepEqual(
      groupsMatchingDirection(groups.filter(g => g.directionId != null), 99),
      [],
    );
  });
});

describe('group names and seats', () => {
  it('treats 2Г / 2г / 2 Г / 2G as the same group on a shift', () => {
    assert.equal(groupNameKey('2Г'), groupNameKey('2г'));
    assert.equal(groupNameKey('2Г'), groupNameKey('2 Г'));
    assert.equal(groupNameKey('2Г'), groupNameKey('2G'));
  });

  it('does not collapse different letters', () => {
    assert.notEqual(groupNameKey('2А'), groupNameKey('2Б'));
    assert.notEqual(groupNameKey('2В'), groupNameKey('2Г'));
  });

  it('trims group names', () => {
    assert.equal(normalizeGroupName('  2Г  '), '2Г');
  });

  it('counts only live occupants toward capacity', () => {
    assert.equal(groupSeatsLeft(40, 30), 10);
    assert.equal(groupSeatsLeft(30, 30), 0);
    assert.equal(groupSeatsLeft(null, 30), null);
  });
});
