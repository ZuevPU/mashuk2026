import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countEmptySlots,
  countOpenSlots,
  pct,
  reconDiffTone,
  toolKeyFromTouchpoint,
} from '../services/analytics/dayStatsHubMetrics.js';

describe('dayStatsHubMetrics', () => {
  it('toolKeyFromTouchpoint', () => {
    assert.equal(toolKeyFromTouchpoint('checkin'), 'checkin');
    assert.equal(toolKeyFromTouchpoint('point_a'), 'lesson_important');
    assert.equal(toolKeyFromTouchpoint('point_b'), 'lesson_open');
    assert.equal(toolKeyFromTouchpoint('evening'), 'evening');
    assert.equal(toolKeyFromTouchpoint('weird'), 'other');
  });

  it('countEmptySlots excludes wait', () => {
    assert.equal(
      countEmptySlots([
        { status: 'ok' },
        { status: 'empty' },
        { status: 'wait' },
        { status: 'empty' },
      ]),
      2,
    );
    assert.equal(
      countOpenSlots([
        { status: 'ok' },
        { status: 'empty' },
        { status: 'wait' },
      ]),
      2,
    );
  });

  it('pct and reconDiffTone', () => {
    assert.equal(pct(87, 1199), 7.3);
    assert.equal(reconDiffTone(2807, 2837), 'warn');
    assert.equal(reconDiffTone(100, 100), 'ok');
    assert.equal(reconDiffTone(90, 100), 'bad');
  });
});
