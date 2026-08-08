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
    // effective = max(admin 6, calendar 3) = 6 → latest published ≤ 6 is 2
    assert.equal(resolveLiveProgramDay(settings, [1, 2], now), 2);
    assert.equal(resolveLiveProgramDay({ ...settings, currentDay: 2 }, [1, 2], now), 2);
  });

  it('shows published day 2 when admin advanced even if calendar still on day 1', () => {
    const now = new Date('2026-08-12T15:00:00+03:00'); // calendar day 1
    assert.equal(
      resolveLiveProgramDay({ ...settings, currentDay: 2 }, [1, 2], now),
      2,
    );
  });

  it('opens next published day when day 2 is published while still on day 1', () => {
    const now = new Date('2026-08-12T15:00:00+03:00'); // calendar day 1
    assert.equal(
      resolveLiveProgramDay({ ...settings, currentDay: 1 }, [1, 2], now),
      2,
    );
  });

  it('does not skip ahead by more than one unpublished gap', () => {
    const now = new Date('2026-08-12T15:00:00+03:00'); // calendar day 1
    // day 3 published without day 2 → stay on latest ≤ target (1), not jump to 3
    assert.equal(
      resolveLiveProgramDay({ ...settings, currentDay: 1 }, [1, 3], now),
      1,
    );
  });
});
