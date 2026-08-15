import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFLECTION_BONUS_REASON,
  attachReflectionBonusSources,
  isReflectionBonusLog,
  type PointsLogSource,
} from '../services/pointsLogSource.js';

function questionSource(title: string): PointsLogSource {
  return {
    sourceKind: 'question',
    sourceId: 11,
    sourceTitle: title,
    sourceDescription: 'День 1 · Как ты себя чувствуешь сейчас, в начале форума?',
    answerPreview: 'Включение · энергия 6/10 · Тяжелая дорога',
    track: 'path',
  };
}

describe('points log reflection bonus', () => {
  it('treats +3 question_answer as the depth bonus', () => {
    assert.equal(isReflectionBonusLog({ actionType: 'question_answer', points: 3 }), true);
    assert.equal(isReflectionBonusLog({ actionType: 'question_answer', points: 5 }), false);
    assert.equal(isReflectionBonusLog({ actionType: 'state_check_evening', points: 5 }), false);
  });

  it('copies the primary question onto a related +3 row', () => {
    const sources = new Map<number, PointsLogSource>([
      [10, questionSource('Дневная проверка состояния')],
      [11, { sourceKind: null, sourceId: null, sourceTitle: null, sourceDescription: null, answerPreview: null, track: 'path' }],
    ]);
    attachReflectionBonusSources([
      { id: 10, participantId: 1, actionType: 'state_check_evening', points: 5, createdAt: '2026-08-15T12:32:20Z' },
      { id: 11, participantId: 1, actionType: 'question_answer', points: 3, relatedLogId: 10, createdAt: '2026-08-15T12:32:20Z' },
    ], sources);
    const bonus = sources.get(11);
    assert.equal(bonus?.isReflectionBonus, true);
    assert.equal(bonus?.sourceTitle, 'Дневная проверка состояния');
    assert.equal(bonus?.answerPreview, 'Включение · энергия 6/10 · Тяжелая дорога');
    assert.equal(bonus?.awardReason, REFLECTION_BONUS_REASON);
  });

  it('matches an old +3 row by the same second when relatedLogId is missing', () => {
    const sources = new Map<number, PointsLogSource>([
      [10, questionSource('Дневная проверка состояния')],
      [11, { sourceKind: null, sourceId: null, sourceTitle: null, sourceDescription: null, answerPreview: null, track: 'path' }],
    ]);
    attachReflectionBonusSources([
      { id: 10, participantId: 1, actionType: 'state_check_evening', points: 5, createdAt: '2026-08-15T12:32:20Z' },
      { id: 11, participantId: 1, actionType: 'question_answer', points: 3, createdAt: '2026-08-15T12:32:20Z' },
    ], sources);
    assert.equal(sources.get(11)?.sourceTitle, 'Дневная проверка состояния');
    assert.equal(sources.get(11)?.isReflectionBonus, true);
  });
});
