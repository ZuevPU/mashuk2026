import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  getEveningOpensAtMsk,
  isEveningOpenForConfig,
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

  it('isEveningOpenForConfig respects opensAtMsk and forcePublished', () => {
    const at2130 = new Date('2026-07-01T18:30:00.000Z'); // 21:30 MSK
    const at2045 = new Date('2026-07-01T17:45:00.000Z'); // 20:45 MSK
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2130),
      true,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2045),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '22:00', forcePublished: true }, at2045),
      true,
    );
    assert.equal(getEveningOpensAtMsk({ steps: [] }), '22:00');
    assert.equal(getEveningOpensAtMsk({ steps: [], opensAtMsk: '9:05' }), '09:05');
  });

  it('forceUnpublished hides even after schedule or forcePublished', () => {
    const at2130 = new Date('2026-07-01T18:30:00.000Z'); // 21:30 MSK
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00', forceUnpublished: true }, at2130),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forceUnpublished: true,
      }, at2130),
      false,
    );
  });

  it('preserves publish meta when stripping Point B / normalizing experiment', () => {
    const cfg = {
      opensAtMsk: '21:00',
      forcePublished: true,
      forceUnpublished: true,
      steps: [{
        id: 'open',
        title: 'Выводы',
        fields: [
          { key: 'likedMost', type: 'text' as const, label: 'Liked' },
          { key: 'experimentResult', type: 'experiment_text' as const, label: 'Exp' },
          { key: 'pointB_cta', type: 'point_b_cta' as const, label: 'Точка Б' },
        ],
      }],
    };
    const stripped = stripPointBFromEveningConfig(cfg);
    assert.equal(stripped.opensAtMsk, '21:00');
    assert.equal(stripped.forcePublished, true);
    assert.equal(stripped.forceUnpublished, true);
    assert.equal(stripped.steps[0].fields.some(f => f.type === 'point_b_cta'), false);
    const norm = normalizeExperimentStep(stripped);
    assert.equal(norm.opensAtMsk, '21:00');
    assert.equal(norm.forcePublished, true);
    assert.equal(norm.forceUnpublished, true);
  });

  it('strips point_b_cta from saved configs for days 1–7', () => {
    const withPointB = {
      opensAtMsk: '21:30',
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
    assert.equal(resolved.opensAtMsk, '21:30');
    assert.equal(stripPointBFromEveningConfig(withPointB).steps[0].fields.length, 1);
  });
});
