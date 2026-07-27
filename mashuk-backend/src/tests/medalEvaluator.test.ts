import assert from 'node:assert/strict';
import { longestConsecutiveRun } from '../services/streakHelpers.js';
import { parseMedalRule } from '../services/medalEvaluator.js';

assert.equal(parseMedalRule('tasks_completed>=5')?.value, 5);
assert.equal(parseMedalRule('  piggybank_count>=20 ')?.metric, 'piggybank_count');
assert.equal(parseMedalRule('invalid'), null);
assert.equal(parseMedalRule('reflection_streak>=7')?.metric, 'reflection_streak');

assert.equal(longestConsecutiveRun([1, 2, 3, 5, 6]), 3);
assert.equal(longestConsecutiveRun([3, 4, 5, 6, 7]), 5);
assert.equal(longestConsecutiveRun([]), 0);

console.log('medalEvaluator.test: ok');
