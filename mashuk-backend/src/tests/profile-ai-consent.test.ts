import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectProfileAiConsentFieldKeys,
  extractProfileAiConsent,
  isProfileAiConsentField,
  parseYesNoAnswer,
  pickLatestProfileAiConsent,
} from '../services/profileAiConsent.js';

const CONSENT_LABEL = 'Я даю согласие на автоматизированную обработку моих текстовых ответов (включая использование технологий искусственного интеллекта) для формирования моего итогового профиля участия в форуме';

describe('profileAiConsent', () => {
  it('matches the final-questionnaire AI consent question', () => {
    assert.equal(isProfileAiConsentField({
      key: 'aiProfileConsent',
      type: 'yes_no',
      label: CONSENT_LABEL,
    }), true);
  });

  it('does not match other yes/no evening questions', () => {
    assert.equal(isProfileAiConsentField({
      key: 'tripYes',
      type: 'yes_no',
      label: 'Выезжал ли ты на полезную программу?',
    }), false);
    assert.equal(isProfileAiConsentField({
      key: 'note',
      type: 'text',
      label: CONSENT_LABEL,
    }), false);
  });

  it('parses Да/Нет and boolean answers', () => {
    assert.equal(parseYesNoAnswer(true), true);
    assert.equal(parseYesNoAnswer(false), false);
    assert.equal(parseYesNoAnswer('Да'), true);
    assert.equal(parseYesNoAnswer('нет'), false);
    assert.equal(parseYesNoAnswer(''), null);
  });

  it('extracts consent from ratings by configured key', () => {
    assert.equal(extractProfileAiConsent({ aiProfileConsent: true }, ['aiProfileConsent']), true);
    assert.equal(extractProfileAiConsent({ aiProfileConsent: false }, ['aiProfileConsent']), false);
    assert.equal(extractProfileAiConsent({ tripYes: true }, ['aiProfileConsent']), null);
  });

  it('takes the latest day with an answer', () => {
    assert.equal(pickLatestProfileAiConsent([
      { dayNumber: 7, eveningRatings: { aiProfileConsent: false } },
      { dayNumber: 8, eveningRatings: { aiProfileConsent: true } },
    ], ['aiProfileConsent']), true);
    assert.equal(pickLatestProfileAiConsent([
      { dayNumber: 8, eveningRatings: { tripYes: true } },
      { dayNumber: 7, eveningRatings: { aiProfileConsent: false } },
    ], ['aiProfileConsent']), false);
  });

  it('finds the field in evening config for the final day', () => {
    const keys = collectProfileAiConsentFieldKeys({
      eveningQuestionnaireByDay: {
        8: {
          steps: [{
            id: 'final',
            title: 'Итог',
            fields: [
              { key: 'tripYes', type: 'yes_no', label: 'Выезд?' },
              { key: 'aiProfileConsent', type: 'yes_no', label: CONSENT_LABEL },
            ],
          }],
        },
      },
    } as never);
    assert.deepEqual(keys, ['aiProfileConsent']);
  });
});
