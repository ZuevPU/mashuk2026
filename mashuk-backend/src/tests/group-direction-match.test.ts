import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupsMatchingDirection } from '../services/groupDirectionSync.js';

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
