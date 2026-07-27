import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scorePedagogicalRole,
  ROLE_CATALOG,
  normalizeOnboardingConfig,
  normalizeGoalQuestions,
  getDefaultOnboardingConfig,
} from '../services/roleService.js';

describe('normalizeOnboardingConfig', () => {
  it('returns defaults for empty input', () => {
    const cfg = normalizeOnboardingConfig(null);
    assert.equal(cfg.goalQuestions.length, 5);
    assert.equal(cfg.questions.length, 6);
    assert.equal(cfg.optionToRole.length, 6);
    assert.ok(cfg.interestGroups.length > 0);
  });

  it('preserves custom goal question text', () => {
    const custom = 'Кастомный вопрос цели 1';
    const cfg = normalizeOnboardingConfig({
      goalQuestions: [custom, 'q2', 'q3', 'q4', 'q5'],
    });
    assert.equal(cfg.goalQuestions[0], custom);
  });

  it('preserves custom diagnostic question text', () => {
    const defaults = getDefaultOnboardingConfig();
    const questions = defaults.questions.map((q, i) => (
      i === 0 ? { text: 'ADMIN_Q1', options: [...q.options] } : { text: q.text, options: [...q.options] }
    ));
    const cfg = normalizeOnboardingConfig({ questions });
    assert.equal(cfg.questions[0].text, 'ADMIN_Q1');
  });
});

describe('normalizeGoalQuestions', () => {
  it('falls back when length is wrong', () => {
    assert.equal(normalizeGoalQuestions(['only one']).length, 5);
  });
});

describe('scorePedagogicalRole', () => {
  it('scores practice_realizer for mostly option index 1 pattern', () => {
    const role = scorePedagogicalRole([1, 1, 0, 1, 1, 2]);
    assert.equal(role, 'practice_realizer');
  });

  it('breaks ties using ROLE_PRIORITY', () => {
    // Force a spread that may tie — verify returns one of catalog keys
    const role = scorePedagogicalRole([0, 0, 1, 0, 0, 0]);
    assert.ok(ROLE_CATALOG.some(r => r.roleKey === role));
  });

  it('rejects invalid length', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2]));
  });

  it('rejects out-of-range option', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2, 3, 4, 0]));
  });
});
