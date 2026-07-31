import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clusterOverlappingTimedItems } from '../services/programSlots.js';

describe('programSlots', () => {
  it('clusters overlapping blocks with different start times', () => {
    const day = '2026-07-01';
    const rows = [
      { item: 'culture', start: new Date(`${day}T14:00:00+03:00`), end: new Date(`${day}T17:30:00+03:00`) },
      { item: 'consult', start: new Date(`${day}T16:30:00+03:00`), end: new Date(`${day}T18:00:00+03:00`) },
      { item: 'dinner', start: new Date(`${day}T18:00:00+03:00`), end: new Date(`${day}T19:00:00+03:00`) },
    ];
    const clusters = clusterOverlappingTimedItems(rows);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters[0].map(c => c.item), ['culture', 'consult']);
    assert.deepEqual(clusters[1].map(c => c.item), ['dinner']);
  });
});
