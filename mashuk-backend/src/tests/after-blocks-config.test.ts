import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterBlocksPromptAnswerOk,
  composeAfterBlocksReflectionText,
  defaultAfterBlocksConfig,
  normalizeAfterBlocksConfig,
} from '../services/afterBlocksConfig.js';

describe('afterBlocksConfig', () => {
  it('falls back to one text prompt', () => {
    const cfg = normalizeAfterBlocksConfig(null);
    assert.equal(cfg.prompts.length, 1);
    assert.equal(cfg.prompts[0].answerType, 'text');
    assert.match(cfg.prompts[0].text, /вынесли/i);
  });

  it('keeps several prompts and drops empty ones', () => {
    const cfg = normalizeAfterBlocksConfig({
      prompts: [
        { id: 'a', text: 'Что запомнилось?', answerType: 'text' },
        { id: 'b', text: 'Оценка блока', answerType: 'scale_5' },
        { id: 'c', text: '   ', answerType: 'text' },
      ],
    });
    assert.equal(cfg.prompts.length, 2);
    assert.equal(cfg.prompts[1].answerType, 'scale_5');
  });

  it('validates text vs scale answers', () => {
    const text = defaultAfterBlocksConfig().prompts[0];
    assert.equal(afterBlocksPromptAnswerOk(text, 'коротко'), false);
    assert.equal(afterBlocksPromptAnswerOk(text, 'Это уже достаточно длинный осмысленный ответ'), true);
    const scale = { ...text, answerType: 'scale_5' as const, options: [] };
    assert.equal(afterBlocksPromptAnswerOk(scale, 4), true);
    assert.equal(afterBlocksPromptAnswerOk(scale, 9), false);
  });

  it('joins prompt answers for analytics text', () => {
    const cfg = normalizeAfterBlocksConfig({
      prompts: [
        { id: 'a', text: 'Мысль', answerType: 'text' },
        { id: 'b', text: 'Оценка', answerType: 'scale_5' },
      ],
    });
    const joined = composeAfterBlocksReflectionText(cfg.prompts, {
      a: 'Заберу приём в класс завтра утром',
      b: 5,
    });
    assert.match(joined, /Мысль:/);
    assert.match(joined, /Оценка: 5/);
  });
});
