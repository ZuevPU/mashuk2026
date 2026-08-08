import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickEveningSurveyDay } from '../services/eveningSurveyDay.js';

describe('pickEveningSurveyDay', () => {
  it('keeps previous day while its evening is open and not completed', () => {
    const day = pickEveningSurveyDay(2, {
      previousDayOpen: true,
      previousDayCompleted: false,
      now: new Date('2026-08-02T21:30:00+03:00'),
    });
    assert.equal(day, 1);
  });

  it('moves to current day after previous evening is completed', () => {
    const day = pickEveningSurveyDay(2, {
      previousDayOpen: true,
      previousDayCompleted: true,
      now: new Date('2026-08-02T21:30:00+03:00'),
    });
    assert.equal(day, 2);
  });

  it('after midnight wrap still attributes to previous open day', () => {
    const day = pickEveningSurveyDay(2, {
      previousDayOpen: true,
      previousDayCompleted: false,
      now: new Date('2026-08-02T00:30:00+03:00'),
    });
    assert.equal(day, 1);
  });

  it('day 1 stays 1', () => {
    assert.equal(pickEveningSurveyDay(1, {
      previousDayOpen: false,
      previousDayCompleted: false,
    }), 1);
  });
});
