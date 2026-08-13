import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { remapEveningLinkedEvents, remapLinkedIds } from '../services/shiftCopy.js';

describe('shift copy id remap', () => {
  it('remaps linked event ids and drops unknown ones', () => {
    const map = new Map<number, number>([[10, 110], [11, 111]]);
    assert.deepEqual(remapLinkedIds([10, 99, '11'], map), [110, 111]);
    assert.deepEqual(remapLinkedIds(null, map), []);
  });

  it('remaps program_event linkedEventIds in evening config and by-day map', () => {
    const map = new Map<number, number>([[5, 50]]);
    const config = {
      steps: [{
        fields: [
          { type: 'program_event', linkedEventIds: [5, 9] },
          { type: 'text', label: 'Комментарий' },
        ],
      }],
    };
    const remapped = remapEveningLinkedEvents(config, map) as typeof config;
    assert.deepEqual(remapped.steps[0].fields[0].linkedEventIds, [50]);

    const byDay = remapEveningLinkedEvents({ '1': config, '2': config }, map) as {
      '1': typeof config;
    };
    assert.deepEqual(byDay['1'].steps[0].fields[0].linkedEventIds, [50]);
  });
});
