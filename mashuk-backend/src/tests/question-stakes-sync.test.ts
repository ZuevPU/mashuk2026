import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayCatalogStakes,
  pickStakeFromQuestionPoints,
} from '../services/questionStakesSync.js';

describe('question stakes sync', () => {
  it('picks the most common question points', () => {
    assert.equal(pickStakeFromQuestionPoints([5, 5, 5, 0]), 5);
    assert.equal(pickStakeFromQuestionPoints([0, 0, 5]), 0);
    assert.equal(pickStakeFromQuestionPoints([]), null);
  });

  it('overlays levels catalog from question stakes', () => {
    const catalog = overlayCatalogStakes([
      { actionType: 'state_check_day', pointsPerUnit: 0 },
      { actionType: 'evening_complete', pointsPerUnit: 15 },
    ], new Map([['state_check_day', 5]]));
    assert.equal(catalog[0].pointsPerUnit, 5);
    assert.equal(catalog[1].pointsPerUnit, 15);
  });
});
