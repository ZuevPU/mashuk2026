import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultOnboardingConfig } from '../services/roleService.js';
import {
  buildRegistrationHeaders,
  buildRegistrationRow,
  buildRegistrationTemplateRows,
  pickDiagAnswer,
  pickGoalAnswer,
  pickInterestGroupTags,
} from '../services/exports/registrationExport.js';

describe('registrationExport', () => {
  const config = getDefaultOnboardingConfig();

  it('builds columns from registration template blocks', () => {
    const headers = buildRegistrationHeaders(config);
    assert.ok(headers.includes('Направление'));
    assert.ok(headers.some(h => h.startsWith('Точка А ·')));
    assert.ok(headers.some(h => h.startsWith('Интересы ·')));
    assert.ok(headers.some(h => h.startsWith('Диагностика ·')));
    assert.ok(headers.includes('Роль по диагностике'));
    assert.equal(
      headers.length,
      13 + config.goalQuestions.length + config.interestGroups.length + 1 + config.questions.length + 1,
    );
  });

  it('lists template blocks for the readme sheet', () => {
    const rows = buildRegistrationTemplateRows(config);
    assert.ok(rows.some(r => r[0] === 'Профиль' && r[1] === 'Направление'));
    assert.ok(rows.some(r => r[0] === 'Точка А'));
    assert.ok(rows.some(r => r[0] === 'Интересы'));
    assert.ok(rows.some(r => r[0] === 'Диагностика'));
  });

  it('reads point A answers by index and diagnostic option text', () => {
    const q = config.goalQuestions[0]!;
    assert.equal(pickGoalAnswer(['хочу практику', 'ещё'], 0, q), 'хочу практику');
    assert.equal(pickInterestGroupTags(['коучинг', 'другое'], { tags: ['коучинг', 'менторство'] }), 'коучинг');
    assert.equal(pickDiagAnswer([1], { options: ['А', 'Б', 'В'] }, 0), 'Б');
  });

  it('fills a participant row in header order', () => {
    const row = buildRegistrationRow({
      id: 7,
      vkId: 100,
      firstName: 'Анна',
      lastName: 'Иванова',
      age: 29,
      direction: 'Педагогика',
      workplace: 'Школа',
      position: 'Учитель',
      region: 'Москва',
      groupName: 'Г1',
      consentPd: true,
      consentAnalytics: true,
      onboardingCompletedAt: '2026-08-01T10:00:00.000Z',
      goalAnswers: config.goalQuestions.map((_, i) => `ответ ${i + 1}`),
      interests: config.interestGroups[0]?.tags.slice(0, 2) ?? [],
      roleAnswers: config.questions.map(() => 0),
      pedagogicalRole: 'practice_realizer',
    }, config);
    const headers = buildRegistrationHeaders(config);
    assert.equal(row.length, headers.length);
    assert.equal(row[1], 'Анна Иванова');
    assert.equal(row[4], 'Педагогика');
    assert.equal(row[13], 'ответ 1');
  });
});
