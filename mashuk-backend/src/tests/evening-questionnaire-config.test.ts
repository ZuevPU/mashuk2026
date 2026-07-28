import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  resolveEveningConfigForDay,
  stripPointBFromEveningConfig,
  normalizeExperimentStep,
} from '../services/eveningQuestionnaireConfig.js';

describe('eveningQuestionnaireConfig', () => {
  it('default config has experiment on separate step', () => {
    const expStep = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'experiment');
    assert.ok(expStep);
    assert.equal(expStep!.fields.some(f => f.key === 'experimentResult'), true);
    const open = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'open');
    assert.equal(open!.fields.some(f => f.type === 'experiment_text'), false);
  });

  it('normalizeExperimentStep splits legacy embedded experiment field', () => {
    const legacy = {
      steps: [{
        id: 'open',
        title: 'Выводы',
        fields: [
          { key: 'likedMost', type: 'text' as const, label: 'Liked' },
          { key: 'experimentResult', type: 'experiment_text' as const, label: 'Exp' },
        ],
      }],
    };
    const norm = normalizeExperimentStep(legacy);
    assert.equal(norm.steps.length, 2);
    assert.equal(norm.steps[0].fields.length, 1);
    assert.equal(norm.steps[1].id, 'experiment');
  });

  it('default config has no Point B field', () => {
    const types = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.flatMap(s => s.fields.map(f => f.type));
    assert.equal(types.includes('point_b_cta'), false);
  });

  it('strips point_b_cta from saved configs for days 1–7', () => {
    const withPointB = {
      steps: [{
        id: 'role',
        title: 'Роль',
        fields: [
          { key: 'tomorrowRoleKey', type: 'role_select' as const, label: 'Роль' },
          { key: 'pointB_cta', type: 'point_b_cta' as const, label: 'Точка Б' },
        ],
      }],
    };
    const resolved = resolveEveningConfigForDay(
      { eveningQuestionnaireByDay: { '3': withPointB } } as never,
      3,
    );
    assert.equal(resolved.steps[0].fields.some(f => f.type === 'point_b_cta'), false);
    assert.equal(stripPointBFromEveningConfig(withPointB).steps[0].fields.length, 1);
  });
});
