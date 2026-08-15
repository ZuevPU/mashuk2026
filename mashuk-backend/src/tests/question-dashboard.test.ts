import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionStateSummary,
  buildZoneDirectionHeatmap,
} from '../services/analytics/questionDashboard.js';

describe('question dashboard', () => {
  it('builds a zone × direction heatmap', () => {
    const heat = buildZoneDirectionHeatmap([
      { direction: 'Навигаторы', zone: 'risk' },
      { direction: 'Навигаторы', zone: 'risk' },
      { direction: 'Навигаторы', zone: 'lift' },
      { direction: 'Медиа', zone: 'engagement' },
    ]);
    assert.deepEqual(heat.zones.map(z => z.label), [
      'Подъём', 'Включение', 'Нейтраль', 'Усталость', 'Риск',
    ]);
    const nav = heat.rows.find(r => r.direction === 'Навигаторы');
    assert.equal(nav?.total, 3);
    assert.equal(nav?.cells[0].n, 1);
    assert.equal(nav?.cells[4].n, 2);
    assert.equal(nav?.cells[4].pct, 66.7);
  });

  it('writes a confident summary when risk sits in one direction', () => {
    const heatmap = buildZoneDirectionHeatmap([
      { direction: 'Навигаторы', zone: 'risk' },
      { direction: 'Навигаторы', zone: 'risk' },
      { direction: 'Навигаторы', zone: 'fatigue' },
      { direction: 'Медиа', zone: 'lift' },
      { direction: 'Медиа', zone: 'lift' },
      { direction: 'Медиа', zone: 'engagement' },
    ]);
    const summary = buildQuestionStateSummary({
      answers: 6,
      reasons: 5,
      zones: [
        { key: 'lift', label: 'Подъём', n: 2, pct: 33.3 },
        { key: 'engagement', label: 'Включение', n: 1, pct: 16.7 },
        { key: 'neutral', label: 'Нейтраль', n: 0, pct: 0 },
        { key: 'fatigue', label: 'Усталость', n: 1, pct: 16.7 },
        { key: 'risk', label: 'Риск', n: 2, pct: 33.3 },
      ],
      heatmapRows: heatmap.rows,
      topNegTheme: 'Сон',
    });
    assert.match(summary.h, /Навигаторы/);
    assert.match(summary.p, /Сон/);
    assert.match(summary.a, /Навигаторы/);
  });

  it('says the picture is clear when minus is low', () => {
    const summary = buildQuestionStateSummary({
      answers: 10,
      reasons: 8,
      zones: [
        { key: 'lift', label: 'Подъём', n: 4, pct: 40 },
        { key: 'engagement', label: 'Включение', n: 5, pct: 50 },
        { key: 'neutral', label: 'Нейтраль', n: 1, pct: 10 },
        { key: 'fatigue', label: 'Усталость', n: 0, pct: 0 },
        { key: 'risk', label: 'Риск', n: 0, pct: 0 },
      ],
      heatmapRows: [],
    });
    assert.match(summary.h, /Включение|Подъём/);
    assert.match(summary.p, /10 ответов/);
  });
});
