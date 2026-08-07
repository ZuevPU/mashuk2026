import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLiveProgramDay,
  resolveLiveScheduleDateKey,
  resolveLiveScheduleDay,
} from '../services/timePhase.js';

describe('resolveLiveScheduleDay', () => {
  const settings = {
    currentDay: 6,
    totalDays: 8,
    startDate: new Date('2026-08-12T00:00:00+03:00'),
  };

  it('uses admin day before the configured calendar window', () => {
    const now = new Date('2026-08-07T11:00:00+03:00');
    assert.equal(resolveLiveScheduleDay(settings, now), 6);
    assert.equal(resolveLiveScheduleDateKey(settings, 6, now), '2026-08-07');
  });

  it('uses calendar day while the shift is running', () => {
    const now = new Date('2026-08-14T11:00:00+03:00');
    assert.equal(resolveLiveScheduleDay(settings, now), 3);
    assert.equal(resolveLiveScheduleDateKey(settings, 3, now), '2026-08-14');
  });

  it('uses admin day after the configured calendar window', () => {
    assert.equal(
      resolveLiveScheduleDay({ ...settings, currentDay: 8 }, new Date('2026-08-25T11:00:00+03:00')),
      8,
    );
  });

  it('falls back to latest published day when calendar day is unpublished', () => {
    const now = new Date('2026-08-14T11:00:00+03:00'); // calendar day 3
    assert.equal(resolveLiveProgramDay(settings, [1, 2], now), 2);
    assert.equal(resolveLiveProgramDay({ ...settings, currentDay: 2 }, [1, 2], now), 2);
  });
});
