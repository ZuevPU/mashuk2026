import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scorePedagogicalRole,
  ROLE_CATALOG,
  normalizeOnboardingConfig,
  normalizeGoalQuestions,
  getDefaultOnboardingConfig,
  validateGoalAnswers,
  GOAL_MULTI_SEP,
} from '../services/roleService.js';

describe('normalizeOnboardingConfig', () => {
  it('returns defaults for empty input', () => {
    const cfg = normalizeOnboardingConfig(null);
    assert.equal(cfg.goalQuestions.length, 5);
    assert.equal(cfg.goalQuestions[0].type, 'open');
    assert.equal(cfg.questions.length, 8);
    assert.equal(cfg.optionToRole.length, 8);
    assert.equal(cfg.optionToRole[0].length, 6);
    assert.equal(cfg.interestMin, 5);
    assert.equal(cfg.interestMax, 8);
    assert.ok(cfg.interestGroups.length > 0);
  });

  it('preserves custom goal question text from legacy strings', () => {
    const custom = 'Кастомный вопрос цели 1';
    const cfg = normalizeOnboardingConfig({
      goalQuestions: [custom, 'q2', 'q3', 'q4', 'q5'],
    });
    assert.equal(cfg.goalQuestions[0].text, custom);
    assert.equal(cfg.goalQuestions[0].type, 'open');
  });

  it('accepts custom goal question count', () => {
    const cfg = normalizeOnboardingConfig({
      goalQuestions: ['a', 'b', 'c'],
    });
    assert.equal(cfg.goalQuestions.length, 3);
    assert.deepEqual(cfg.goalQuestions.map(q => q.text), ['a', 'b', 'c']);
  });

  it('preserves choice/multi goal questions', () => {
    const cfg = normalizeOnboardingConfig({
      goalQuestions: [
        { text: 'Выбери цель', type: 'choice', options: ['A', 'B'] },
        { text: 'Несколько', type: 'multi', options: ['X', 'Y', 'Z'] },
      ],
    });
    assert.equal(cfg.goalQuestions.length, 2);
    assert.equal(cfg.goalQuestions[0].type, 'choice');
    assert.deepEqual(cfg.goalQuestions[0].options, ['A', 'B']);
    assert.equal(cfg.goalQuestions[1].type, 'multi');
    assert.deepEqual(cfg.goalQuestions[1].options, ['X', 'Y', 'Z']);
  });

  it('preserves interest pick limits', () => {
    const cfg = normalizeOnboardingConfig({ interestMin: 3, interestMax: 10 });
    assert.equal(cfg.interestMin, 3);
    assert.equal(cfg.interestMax, 10);
  });

  it('preserves custom diagnostic question text', () => {
    const defaults = getDefaultOnboardingConfig();
    const questions = defaults.questions.map((q, i) => (
      i === 0 ? { text: 'ADMIN_Q1', options: [...q.options] } : { text: q.text, options: [...q.options] }
    ));
    const cfg = normalizeOnboardingConfig({ questions });
    assert.equal(cfg.questions[0].text, 'ADMIN_Q1');
  });

  it('upgrades legacy 6×4 diagnostics to template 8×6', () => {
    const legacy = Array.from({ length: 6 }, (_, i) => ({
      text: `Old Q${i + 1}`,
      options: ['a', 'b', 'c', 'd'],
    }));
    const cfg = normalizeOnboardingConfig({
      questions: legacy,
      optionToRole: Array.from({ length: 6 }, () => [
        'meaning_researcher', 'practice_realizer', 'communication_guide', 'content_packer',
      ]),
    });
    assert.equal(cfg.questions.length, 8);
    assert.equal(cfg.questions[0].options.length, 6);
    assert.equal(cfg.optionToRole.length, 8);
    assert.equal(cfg.optionToRole[0].length, 6);
    assert.notEqual(cfg.questions[0].text, 'Old Q1');
  });
});

describe('normalizeGoalQuestions', () => {
  it('falls back when empty', () => {
    assert.equal(normalizeGoalQuestions([]).length, 5);
  });

  it('keeps custom length', () => {
    assert.equal(normalizeGoalQuestions(['only one']).length, 1);
    assert.equal(normalizeGoalQuestions(['a', 'b', 'c', 'd', 'e', 'f', 'g']).length, 7);
  });
});

describe('validateGoalAnswers', () => {
  it('accepts open answers', () => {
    const qs = normalizeGoalQuestions(['q1', 'q2']);
    assert.equal(validateGoalAnswers(qs, ['a', 'b']), null);
  });

  it('validates choice and multi', () => {
    const qs = normalizeGoalQuestions([
      { text: 'one', type: 'choice', options: ['A', 'B'] },
      { text: 'many', type: 'multi', options: ['X', 'Y', 'Z'] },
    ]);
    assert.equal(validateGoalAnswers(qs, ['A', `X${GOAL_MULTI_SEP}Z`]), null);
    assert.match(validateGoalAnswers(qs, ['C', 'X']) || '', /вариант/);
    assert.match(validateGoalAnswers(qs, ['A', 'X · W']) || '', /Некорректный/);
  });

  it('supports allowOther and conditional follow-ups', () => {
    const qs = normalizeGoalQuestions([
      { id: 'q1', text: 'one', type: 'choice', options: ['A', 'B'], allowOther: true },
      {
        id: 'q2',
        text: 'follow',
        type: 'open',
        options: [],
        showWhen: { questionId: 'q1', options: ['A', '__other__'] },
      },
    ]);
    assert.equal(validateGoalAnswers(qs, ['A', 'detail']), null);
    assert.equal(validateGoalAnswers(qs, ['my custom', 'detail']), null);
    // Hidden follow-up answers are pruned — only parent answer required when B selected.
    assert.equal(validateGoalAnswers(qs, ['B', '']), null);
    assert.equal(validateGoalAnswers(qs, ['B', 'stale hidden text']), null);
    assert.match(validateGoalAnswers(qs, ['A', '']) || '', /Ответьте/);
  });
});

describe('scorePedagogicalRole', () => {
  it('scores a role for a full answer vector', () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0];
    const role = scorePedagogicalRole(answers);
    assert.ok(ROLE_CATALOG.some(r => r.roleKey === role));
  });

  it('breaks ties using ROLE_PRIORITY', () => {
    const answers = [0, 5, 4, 3, 2, 1, 0, 5];
    const role = scorePedagogicalRole(answers);
    assert.ok(ROLE_CATALOG.some(r => r.roleKey === role));
  });

  it('rejects invalid length', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2]));
  });

  it('rejects out-of-range option', () => {
    assert.throws(() => scorePedagogicalRole([0, 1, 2, 3, 4, 0, 0, 9]));
  });
});
