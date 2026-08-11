import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appropriationPct,
  classifyReflection,
  containsMarker,
} from '../services/analytics/afterBlocksHubMetrics.js';

describe('afterBlocksHubMetrics', () => {
  it('does not match «буду» inside «Будущее»', () => {
    assert.equal(containsMarker('Клуб «Будущее» про образование', 'буду'), false);
    assert.equal(containsMarker('буду применять на уроках', 'буду'), true);
  });

  it('classifies transfer / self / reaction / thesis', () => {
    assert.equal(
      classifyReflection('Буду применять на своих занятиях игру «Объясни»'),
      'Перенос в практику',
    );
    assert.equal(
      classifyReflection('Я открыла для себя новые компетенции вожатого'),
      'Связь с собой',
    );
    assert.equal(
      classifyReflection('Спасибо все хорошо полезные занятия'),
      'Реакция',
    );
    assert.equal(
      classifyReflection('Наставничество играет важную роль в развитии'),
      'Тезис',
    );
  });

  it('appropriationPct', () => {
    assert.equal(
      appropriationPct(['Перенос в практику', 'Тезис', 'Тезис', 'Связь с собой']),
      50,
    );
  });
});
