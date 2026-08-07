import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiveScheduleDay } from '../services/timePhase.js';

describe('resolveLiveScheduleDay', () => {
  const settings = {
    currentDay: 6,
    totalDays: 8,
    startDate: new Date('2026-08-12T00:00:00+03:00'),
  };

  it('uses admin day before the configured calendar window', () => {
    assert.equal(
      resolveLiveScheduleDay(settings, new Date('2026-08-07T11:00:00+03:00')),
      6,
    );
  });

  it('uses calendar day while the shift is running', () => {
    assert.equal(
      resolveLiveScheduleDay(settings, new Date('2026-08-14T11:00:00+03:00')),
      3,
    );
  });

  it('uses admin day after the configured calendar window', () => {
    assert.equal(
      resolveLiveScheduleDay({ ...settings, currentDay: 8 }, new Date('2026-08-25T11:00:00+03:00')),
      8,
    );
  });
});
