import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTagCloudTokens,
  extractAnswerPlainText,
  tokenizeForTagCloud,
} from '../services/wordCloudTokens.js';

describe('wordCloudTokens', () => {
  it('strips stop-words and short tokens', () => {
    const tokens = tokenizeForTagCloud('Я и ты на форуме про лидерство и развитие в команде');
    assert.ok(tokens.includes('форуме'));
    assert.ok(tokens.includes('лидерство'));
    assert.ok(tokens.includes('развитие'));
    assert.ok(tokens.includes('команде'));
    assert.ok(!tokens.includes('я'));
    assert.ok(!tokens.includes('и'));
    assert.ok(!tokens.includes('на'));
    assert.ok(!tokens.includes('про'));
  });

  it('extracts nested answer text fields', () => {
    const text = extractAnswerPlainText({
      text: 'Вдохновение',
      reason: 'от спикера',
      values: ['энергия', 'и'],
    });
    assert.match(text.toLowerCase(), /вдохновение/);
    assert.match(text.toLowerCase(), /спикера/);
    assert.match(text.toLowerCase(), /энергия/);
  });

  it('ranks by frequency and respects limit', () => {
    const tokens = buildTagCloudTokens(
      [
        { text: 'лидерство команда лидерство' },
        { text: 'лидерство энергия' },
        { text: 'команда' },
      ],
      2,
    );
    assert.equal(tokens.length, 2);
    assert.deepEqual(tokens[0], { token: 'лидерство', count: 3 });
    assert.deepEqual(tokens[1], { token: 'команда', count: 2 });
  });
});
