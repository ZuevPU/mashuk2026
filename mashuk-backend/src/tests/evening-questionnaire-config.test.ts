import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  filterEveningConfigForDirection,
  getEveningOpensAtMsk,
  isEveningOpenForConfig,
  isFieldForDirection,
  isFieldVisible,
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
    const at0730 = new Date('2026-07-02T04:30:00.000Z'); // 07:30 MSK next day
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2130),
      true,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '21:00' }, at2045),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forcePublishedAt: '2026-07-01T17:00:00.000Z',
      }, at2045),
      true,
    );
    // Legacy forcePublished without timestamp must not hang after the evening window
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '22:00', forcePublished: true }, at0730),
      false,
    );
    // Fresh force expires after 01:00 MSK
    assert.equal(
      isEveningOpenForConfig({
        steps: [],
        opensAtMsk: '22:00',
        forcePublished: true,
        forcePublishedAt: '2026-07-01T17:00:00.000Z',
      }, at0730),
      false,
    );
    assert.equal(
      isEveningOpenForConfig({ steps: [], opensAtMsk: '22:00' }, at2130, {
        scheduleDayPublished: false,
      }),
      false,
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

  it('default conditional step links practice to program_event pick', () => {
    const step = DEFAULT_EVENING_QUESTIONNAIRE_CONFIG.steps.find(s => s.id === 'conditional');
    assert.ok(step);
    const eventField = step!.fields.find(f => f.key === 'practiceEvent');
    assert.equal(eventField?.type, 'program_event');
    assert.deepEqual(eventField?.visibleWhen, { field: 'practiceYes', equals: true });
    const recommend = step!.fields.find(f => f.key === 'recommendYes');
    assert.deepEqual(recommend?.visibleWhen, { field: 'practiceEvent', equals: '__set__' });
  });

  it('isFieldVisible supports __set__ for program_event answers', () => {
    const score = {
      key: 'score',
      type: 'scale_1_10' as const,
      label: 'Score',
      visibleWhen: { field: 'ev', equals: '__set__' as const },
    };
    assert.equal(isFieldVisible(score, {}), false);
    assert.equal(isFieldVisible(score, { ev: null }), false);
    assert.equal(isFieldVisible(score, {
      ev: { eventId: 12, eventTitle: 'Практика А' },
    }), false);
    assert.equal(isFieldVisible(score, {
      ev: {
        items: [{
          eventId: 12,
          eventTitle: 'Практика А',
          parentEventId: 1,
          parentEventTitle: 'Блок',
          score: 8,
        }],
      },
    }), true);
  });

  it('filters fields by audienceDirectionIds (empty = all)', () => {
    const forAll = { key: 'a', type: 'text' as const, label: 'All' };
    const forOne = {
      key: 'b',
      type: 'text' as const,
      label: 'Dir 5',
      audienceDirectionIds: [5],
    };
    const forTwo = {
      key: 'c',
      type: 'text' as const,
      label: 'Dir 5/7',
      audienceDirectionIds: [5, 7],
    };
    assert.equal(isFieldForDirection(forAll, 5), true);
    assert.equal(isFieldForDirection(forAll, null), true);
    assert.equal(isFieldForDirection(forOne, 5), true);
    assert.equal(isFieldForDirection(forOne, 7), false);
    assert.equal(isFieldForDirection(forOne, null), false);
    assert.equal(isFieldForDirection(forTwo, 7), true);

    const filtered = filterEveningConfigForDirection({
      steps: [
        { id: 's1', title: 'S1', fields: [forAll, forOne] },
        { id: 's2', title: 'S2', fields: [forTwo] },
        { id: 's3', title: 'S3', fields: [forOne] },
      ],
      opensAtMsk: '21:00',
    }, 7);
    assert.equal(filtered.opensAtMsk, '21:00');
    assert.equal(filtered.steps.length, 2);
    assert.deepEqual(filtered.steps[0].fields.map(f => f.key), ['a']);
    assert.deepEqual(filtered.steps[1].fields.map(f => f.key), ['c']);
  });
});
