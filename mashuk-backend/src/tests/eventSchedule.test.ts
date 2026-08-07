import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENT_DURATION_MS,
  getEventLiveStatus,
  parseClockPair,
  resolveEventInterval,
} from '../services/eventSchedule.js';

const START = new Date('2026-08-12T00:00:00+03:00');

describe('eventSchedule', () => {
  it('parses single and range time slots', () => {
    assert.deepEqual(parseClockPair('09:00'), { startH: 9, startM: 0 });
    assert.deepEqual(parseClockPair('09:00–11:30'), { startH: 9, startM: 0, endH: 11, endM: 30 });
  });

  it('builds MSK interval from day + timeSlot when DB times missing', () => {
    const { start, end } = resolveEventInterval(
      { dayNumber: 1, timeSlot: '10:00–11:00' },
      { startDate: START },
    );
    assert.equal(start?.toISOString(), '2026-08-12T07:00:00.000Z');
    assert.equal(end?.toISOString(), '2026-08-12T08:00:00.000Z');
  });

  it('uses default duration instead of perpetual now when endTime missing', () => {
    const start = new Date('2026-08-12T06:00:00.000Z'); // 09:00 MSK
    const now = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS + 60_000);
    const { end } = resolveEventInterval({ startTime: start, dayNumber: 1 }, { startDate: START });
    const status = getEventLiveStatus(1, 1, start, end, now);
    assert.equal(status, 'past');
  });

  it('prefers timeSlot over stale DB startTime for live status', () => {
    const settings = { startDate: START };
    const staleStart = new Date('2026-08-12T14:00:00.000Z'); // 17:00 MSK
    const { start, end } = resolveEventInterval(
      { dayNumber: 1, timeSlot: '19:00–21:00', startTime: staleStart },
      settings,
    );
    const now = new Date('2026-08-12T17:05:00.000Z'); // 20:05 MSK
    assert.equal(getEventLiveStatus(1, 1, start, end, now), 'now');
  });

  it('rebinds legacy stored clocks to the configured forum day', () => {
    const staleStart = new Date('2026-06-30T05:00:00.000Z'); // 08:00 MSK
    const staleEnd = new Date('2026-06-30T06:30:00.000Z'); // 09:30 MSK
    const { start, end } = resolveEventInterval(
      { dayNumber: 2, startTime: staleStart, endTime: staleEnd },
      { startDate: START },
    );
    assert.equal(start?.toISOString(), '2026-08-13T05:00:00.000Z');
    assert.equal(end?.toISOString(), '2026-08-13T06:30:00.000Z');
    assert.equal(
      getEventLiveStatus(2, 2, start, end, new Date('2026-08-13T05:30:00.000Z')),
      'now',
    );
  });

  it('marks only one block as now on current day', () => {
    const settings = { startDate: START };
    const morning = resolveEventInterval({ dayNumber: 3, timeSlot: '09:00–10:00' }, settings);
    const afternoon = resolveEventInterval({ dayNumber: 3, timeSlot: '14:00–15:00' }, settings);
    const now = new Date('2026-08-14T10:30:00+03:00');
    assert.equal(getEventLiveStatus(3, 3, morning.start, morning.end, now), 'past');
    assert.equal(getEventLiveStatus(3, 3, afternoon.start, afternoon.end, now), 'future');
  });

  it('forces past for earlier forum days', () => {
    const start = new Date('2026-08-14T10:00:00+03:00');
    const end = new Date('2026-08-14T11:00:00+03:00');
    const now = new Date('2026-08-14T10:30:00+03:00');
    assert.equal(getEventLiveStatus(2, 3, start, end, now), 'past');
  });

  it('forces future for later forum days', () => {
    const start = new Date('2026-08-14T10:00:00+03:00');
    const end = new Date('2026-08-14T11:00:00+03:00');
    const now = new Date('2026-08-14T10:30:00+03:00');
    assert.equal(getEventLiveStatus(4, 3, start, end, now), 'future');
  });

  it('uses clock on calendar day when admin currentDay is ahead', () => {
    const settings = { startDate: START };
    const { start, end } = resolveEventInterval({ dayNumber: 3, timeSlot: '19:00–21:00' }, settings);
    const now = new Date('2026-08-14T17:05:00.000Z'); // 20:05 MSK on forum day 3
    assert.equal(getEventLiveStatus(3, 3, start, end, now), 'now');
    assert.equal(getEventLiveStatus(3, 5, start, end, now), 'past');
  });
});
