import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeakerIds, snapshotSpeakerName } from '../services/speakerLabels.js';

describe('normalizeSpeakerIds', () => {
  it('keeps numbers and drops junk', () => {
    assert.deepEqual(normalizeSpeakerIds([2, 0, -1, 2, '3', 'x']), [2, 3]);
  });

  it('reads id from objects and ignores a bare string', () => {
    assert.deepEqual(normalizeSpeakerIds([{ id: 8 }, { id: '9' }]), [8, 9]);
    assert.deepEqual(normalizeSpeakerIds('1,2'), []);
  });
});

describe('snapshotSpeakerName', () => {
  const byId = new Map<number, { name?: string | null }>([
    [1, { name: 'Иванов Иван' }],
    [2, { name: '  Петрова  ' }],
  ]);

  it('joins catalog names and keeps a fallback when ids miss', () => {
    assert.equal(snapshotSpeakerName([1, 2], byId), 'Иванов Иван; Петрова');
    assert.equal(snapshotSpeakerName([9], byId, 'Сидоров'), 'Сидоров');
    assert.equal(snapshotSpeakerName([9], byId, null), null);
  });
});
