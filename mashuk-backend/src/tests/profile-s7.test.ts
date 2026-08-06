import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAbProgressPercent, resolveProfileProgressWeights } from '../services/profileProgress.js';
import { pickProfileRecommendation } from '../services/profileRecommendations.js';
import { buildOutcomesHeuristic, parseOutcomesForDisplay } from '../services/profileOutcomes.js';
import { isSubstantiveProfileReflection } from '../services/profilePdfBuilder.js';

describe('profileProgress §7', () => {
  it('computes weighted A→B percent', () => {
    const pct = computeAbProgressPercent({
      touchpointRatio: 1,
      eveningDone: 7,
      eveningTotal: 7,
      tasksApproved: 5,
      tasksTotal: 5,
      piggyInWorkCount: 3,
    });
    assert.equal(pct, 100);
  });

  it('falls back to default weights for bad JSON', () => {
    const w = resolveProfileProgressWeights(null);
    assert.equal(w.touchpoints, 40);
    assert.equal(w.piggybankInWork, 10);
  });
});

describe('profileRecommendations §7', () => {
  it('picks low_answers template on day 2', () => {
    const rec = pickProfileRecommendation({
      participantId: 1,
      currentDay: 2,
      answersCount: 0,
      piggyCount: 5,
      missedTouchpoints: 0,
      recommendationThreshold: 2,
    });
    assert.match(rec.text, /рефлексивный|ответ/i);
    assert.equal(rec.kind, 'daily');
  });

  it('stable finale kind on day 7', () => {
    const rec = pickProfileRecommendation({
      participantId: 42,
      currentDay: 7,
      answersCount: 10,
      piggyCount: 10,
      missedTouchpoints: 0,
      recommendationThreshold: 2,
      growthRoleName: 'Исследователь',
    });
    assert.equal(rec.kind, 'finale');
    assert.match(rec.text, /Исследователь/);
  });
});

describe('profileOutcomes §7', () => {
  it('builds summary bullets without verbatim answer quotes', () => {
    const quote = 'Ценю каждого человека рядом здесь и тех, кто ждёт меня дома и на работе';
    const bullets = buildOutcomesHeuristic({
      answersCount: 5,
      tasksApproved: 2,
      piggyTotal: 4,
      piggyInWork: 1,
      eveningNotes: [quote],
      recentAnswerTexts: [quote, quote],
    });
    assert.ok(bullets.some(b => b.includes('задан')));
    assert.ok(bullets.some(b => /рефлекс/i.test(b)));
    assert.ok(bullets.some(b => /итогов/i.test(b) || /анкет/i.test(b)));
    assert.ok(!bullets.some(b => b.includes('Ценю каждого')), `must not leak quote: ${bullets.join(' | ')}`);
  });

  it('prefers edited bullets over heuristic and dedupes', () => {
    const display = parseOutcomesForDisplay(
      { bullets: ['Админ правка', 'Админ правка'] },
      ['heuristic'],
    );
    assert.deepEqual(display, ['Админ правка']);
  });
});

describe('isSubstantiveProfileReflection', () => {
  it('keeps open reflections and drops check-ins / scales', () => {
    assert.equal(isSubstantiveProfileReflection({
      type: 'open',
      preview: 'Сегодня поняла, что важно слушать команду дольше',
    }), true);
    assert.equal(isSubstantiveProfileReflection({
      type: 'checkin',
      block: 'Проверка состояния',
      preview: 'Радость · энергия 7/10',
    }), false);
    assert.equal(isSubstantiveProfileReflection({
      type: 'scale_10',
      preview: '8',
    }), false);
    assert.equal(isSubstantiveProfileReflection({
      type: 'open',
      preview: '7 · 8 · 5 · 9',
    }), false);
  });
});
