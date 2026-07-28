import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMaterialUnlockedForParticipant } from '../controllers/programController.js';

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
