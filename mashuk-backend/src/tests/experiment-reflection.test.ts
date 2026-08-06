import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLastExperimentReflection,
  EXPERIMENT_REFLECTION_CANONICAL,
} from '../services/experimentReflection.js';

describe('buildLastExperimentReflection', () => {
  it('labels experimentResult from evening ratings and skips day notes', () => {
    const result = buildLastExperimentReflection({
      settings: null,
      dayStates: [{
        dayNumber: 3,
        eveningRatings: {
          likedMost: 'Ценю каждого человека рядом',
          freeNote: 'Все',
          experimentResult: 'Не попробовала осознанно',
          mainThesis: 'Не надо ничего делать',
        },
        eveningDraft: null,
      } as any],
    });
    assert.ok(result);
    assert.equal(result!.dayNumber, 3);
    assert.equal(result!.items.length, 1);
    assert.equal(result!.items[0].answer, 'Не попробовала осознанно');
    assert.match(result!.items[0].question, /эксперимент/i);
    assert.ok(!result!.items.some(i => i.answer.includes('Ценю каждого')));
  });

  it('uses canonical label when config label is absent for known key', () => {
    const result = buildLastExperimentReflection({
      settings: {
        eveningQuestionnaireByDay: {
          '2': {
            steps: [{
              id: 'experiment',
              title: 'Exp',
              fields: [{ key: 'experimentResult', type: 'experiment_text', label: '' }],
            }],
          },
        },
      } as any,
      dayStates: [{
        dayNumber: 2,
        eveningRatings: { experimentResult: 'Вошла в роль куратора на практике' },
        eveningDraft: null,
      } as any],
    });
    assert.equal(result!.items[0].question, EXPERIMENT_REFLECTION_CANONICAL[0]);
  });

  it('pairs answer reflections by real question titles', () => {
    const result = buildLastExperimentReflection({
      settings: null,
      dayStates: [],
      answerReflections: [
        {
          title: 'Что понял(а) о своём способе действия',
          preview: 'Действую через поддержку команды',
          answeredAt: new Date('2026-08-05'),
        },
        {
          title: 'Как включился(ась) в эксперимент',
          preview: 'Попробовала роль исследователя',
          answeredAt: new Date('2026-08-06'),
        },
        {
          title: 'Что понравилось',
          preview: 'Ценю каждого',
          answeredAt: new Date('2026-08-06'),
        },
      ],
    });
    assert.ok(result);
    assert.equal(result!.items.length, 2);
    assert.equal(result!.items[0].question, 'Как включился(ась) в эксперимент');
    assert.equal(result!.items[1].question, 'Что понял(а) о своём способе действия');
    assert.ok(!result!.items.some(i => i.answer.includes('Ценю')));
  });
});
