import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectionDayRatings,
  isDirectionWorkField,
} from '../services/analytics/dayResultsMetrics.js';

describe('directionDayRatings', () => {
  it('matches the thematic-direction work question', () => {
    assert.equal(isDirectionWorkField({
      key: 'direction',
      label: 'Работа в рамках тематического направления',
    }), true);
    assert.equal(isDirectionWorkField({
      key: 'housing',
      label: 'Организация проживания и быта',
    }), false);
  });

  it('builds filled counts and averages by direction and day', () => {
    const result = buildDirectionDayRatings({
      days: [
        { day: 1, label: '8 августа' },
        { day: 2, label: '9 августа' },
      ],
      directions: ['Вожатые', 'Педагоги'],
      field: { key: 'direction', label: 'Работа в рамках тематического направления', type: 'scale_1_5' },
      rows: [
        { dayNumber: 1, direction: 'Вожатые', ratings: { direction: 5 } },
        { dayNumber: 1, direction: 'Вожатые', ratings: { direction: 4 } },
        { dayNumber: 2, direction: 'Вожатые', ratings: { direction: 3 } },
        { dayNumber: 1, direction: 'Педагоги', ratings: { direction: 5 } },
      ],
    });
    assert.equal(result.rows[0]?.direction, 'Вожатые');
    assert.deepEqual(result.rows[0]?.cells[0], { filled: 2, avg: 4.5 });
    assert.deepEqual(result.rows[0]?.cells[1], { filled: 1, avg: 3 });
    assert.deepEqual(result.rows[1]?.cells[0], { filled: 1, avg: 5 });
    assert.deepEqual(result.rows[1]?.cells[1], { filled: 0, avg: null });
  });
});
