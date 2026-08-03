import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EVENT_DEPTH,
  attachEventChildren,
  childDepthOfParent,
  collectDescendantIds,
  wouldCreateCycle,
  flattenEventTreeDepthFirst,
} from '../services/eventTree.js';

describe('eventTree', () => {
  const rows = [
    { id: 1, parentEventId: null, sortOrder: 0, title: 'root' },
    { id: 2, parentEventId: 1, sortOrder: 0, title: 'section' },
    { id: 3, parentEventId: 2, sortOrder: 0, title: 'nested' },
    { id: 4, parentEventId: 3, sortOrder: 0, title: 'leaf-a' },
    { id: 5, parentEventId: 3, sortOrder: 1, title: 'leaf-b' },
    { id: 6, parentEventId: null, sortOrder: 1, title: 'other' },
  ];

  it('builds recursive tree up to max depth', () => {
    const tree = attachEventChildren(rows);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].title, 'root');
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].title, 'section');
    assert.equal(tree[0].children[0].children[0].title, 'nested');
    assert.equal(tree[0].children[0].children[0].children.length, 2);
    assert.equal(tree[0].children[0].children[0].children[0].title, 'leaf-a');
    assert.equal(tree[0].children[0].children[0].children[1].title, 'leaf-b');
  });

  it('computes child depth and enforces max nesting', () => {
    const byId = new Map(rows.map(r => [r.id, r]));
    assert.equal(MAX_EVENT_DEPTH, 4);
    assert.equal(childDepthOfParent(null, byId), 1);
    assert.equal(childDepthOfParent(1, byId), 2);
    assert.equal(childDepthOfParent(2, byId), 3);
    assert.equal(childDepthOfParent(3, byId), 4);
    assert.equal(childDepthOfParent(4, byId), 5);
    assert.ok(childDepthOfParent(4, byId) > MAX_EVENT_DEPTH);
  });

  it('detects cycles and collects descendants', () => {
    const byId = new Map(rows.map(r => [r.id, r]));
    assert.equal(wouldCreateCycle(1, 4, byId), true);
    assert.equal(wouldCreateCycle(6, 1, byId), false);
    assert.deepEqual(collectDescendantIds(1, rows).sort(), [2, 3, 4, 5]);
    assert.deepEqual(collectDescendantIds(2, rows).sort(), [3, 4, 5]);
  });

  it('flattens depth-first for clone order', () => {
    const tree = attachEventChildren(rows);
    const flat = flattenEventTreeDepthFirst(tree);
    assert.deepEqual(flat.map(n => n.id), [1, 2, 3, 4, 5, 6]);
  });
});
