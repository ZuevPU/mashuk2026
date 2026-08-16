import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMaterialUnlockedForParticipant } from '../controllers/programController.js';
import { materialVisibleWhenShiftOpen } from '../services/kbOpenShift.js';

describe('isMaterialUnlockedForParticipant', () => {
  it('immediate mode ignores touchpoint count', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'immediate', kbUnlockMinTouchpoints: 7 }, 0, 4),
      true,
    );
  });

  it('touchpoints mode uses material N when set', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: 3 }, 2, 4),
      false,
    );
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: 3 }, 3, 4),
      true,
    );
  });

  it('touchpoints mode falls back to forum default', () => {
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: null }, 3, 4),
      false,
    );
    assert.equal(
      isMaterialUnlockedForParticipant({ kbUnlockMode: 'touchpoints', kbUnlockMinTouchpoints: null }, 4, 4),
      true,
    );
  });
});

describe('materialVisibleWhenShiftOpen', () => {
  it('hides everything while the day is locked', () => {
    assert.equal(materialVisibleWhenShiftOpen(false, false, true), false);
    assert.equal(materialVisibleWhenShiftOpen(true, false, true), false);
  });

  it('skips per-material gate when admin opened the shift', () => {
    assert.equal(materialVisibleWhenShiftOpen(true, true, false), true);
  });

  it('keeps per-material gate when the shift still uses the threshold', () => {
    assert.equal(materialVisibleWhenShiftOpen(false, true, false), false);
    assert.equal(materialVisibleWhenShiftOpen(false, true, true), true);
  });
});
