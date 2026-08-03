import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clusterOverlappingTimedItems } from '../services/programSlots.js';

describe('programSlots', () => {
  it('puts different start times into separate cells even if intervals overlap', () => {
    const day = '2026-07-01';
    const rows = [
      { item: 'culture', start: new Date(`${day}T14:00:00+03:00`), end: new Date(`${day}T17:30:00+03:00`) },
      { item: 'consult', start: new Date(`${day}T16:30:00+03:00`), end: new Date(`${day}T18:00:00+03:00`) },
      { item: 'dinner', start: new Date(`${day}T18:00:00+03:00`), end: new Date(`${day}T19:00:00+03:00`) },
    ];
    const clusters = clusterOverlappingTimedItems(rows);
    assert.equal(clusters.length, 3);
    assert.deepEqual(clusters.map(c => c.map(x => x.item)), [['culture'], ['consult'], ['dinner']]);
  });

  it('groups parallel tracks that share the same start minute', () => {
    const day = '2026-07-01';
    const rows = [
      { item: 'track-a', start: new Date(`${day}T10:00:00+03:00`), end: new Date(`${day}T11:30:00+03:00`) },
      { item: 'track-b', start: new Date(`${day}T10:00:00+03:00`), end: new Date(`${day}T12:00:00+03:00`) },
      { item: 'later', start: new Date(`${day}T12:00:00+03:00`), end: new Date(`${day}T13:00:00+03:00`) },
    ];
    const clusters = clusterOverlappingTimedItems(rows);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters[0].map(c => c.item), ['track-a', 'track-b']);
    assert.deepEqual(clusters[1].map(c => c.item), ['later']);
  });
});
