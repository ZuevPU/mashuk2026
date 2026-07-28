import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bonusParamInt, bonusRuleEnabled } from '../services/ratingBonusRulesConfig.js';

describe('ratingBonusRulesConfig', () => {
  it('bonusParamInt uses fallback', () => {
    assert.equal(bonusParamInt({}, 'minDays', 7), 7);
    assert.equal(bonusParamInt({ minDays: 5 }, 'minDays', 7), 5);
    assert.equal(bonusParamInt({ minDays: 0 }, 'minDays', 7), 7);
  });

  it('bonusRuleEnabled respects row flag', () => {
    assert.equal(bonusRuleEnabled(null), true);
    assert.equal(bonusRuleEnabled({ enabled: false } as never), false);
    assert.equal(bonusRuleEnabled({ enabled: true } as never), true);
  });
});
