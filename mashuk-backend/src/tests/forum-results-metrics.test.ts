import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForumNps,
  classifyForumField,
  clusterSimilarTexts,
} from '../services/analytics/forumResultsMetrics.js';

describe('forumResultsMetrics', () => {
  it('classifies final-forum question types by label', () => {
    assert.equal(classifyForumField({
      key: 'housing', type: 'scale_1_5', label: 'Организация проживания и быта',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'nps', type: 'scale_1_10', label: 'Готовы рекомендовать форум коллегам?',
    }), 'nps');
    assert.equal(classifyForumField({
      key: 'improve', type: 'text', label: 'Что сделать, чтобы оценка стала выше',
    }), 'improve');
    assert.equal(classifyForumField({
      key: 'goal', type: 'choice', label: 'Что произошло с целью',
    }), 'point_b');
    assert.equal(classifyForumField({
      key: 'role', type: 'choice', label: 'Способ действия — роль на финише',
    }), 'role');
    assert.equal(classifyForumField({
      key: 'when', type: 'choice', label: 'Когда планируете сделать первый шаг',
    }), 'plan_when');
    assert.equal(classifyForumField({
      key: 'psych', type: 'yes_no', label: 'Были на консультации психолога?',
    }), 'psych');
  });

  it('builds NPS as promoters minus critics', () => {
    const nps = buildForumNps(
      [
        { ratings: { rec: 10 } },
        { ratings: { rec: 9 } },
        { ratings: { rec: 8 } },
        { ratings: { rec: 4 } },
      ],
      { key: 'rec', type: 'scale_1_10', label: 'Рекомендуете?' },
    );
    assert.ok(nps);
    assert.equal(nps!.n, 4);
    assert.equal(nps!.promotersPct, 50);
    assert.equal(nps!.criticsPct, 25);
    assert.equal(nps!.score, 25);
  });

  it('clusters repeated open answers', () => {
    const clusters = clusterSimilarTexts([
      'Больше практики на уроках наоборот, меньше теории',
      'Больше практики на уроках наоборот, меньше теории',
      'Сделайте ремонт душевых',
    ]);
    assert.equal(clusters[0].n, 2);
  });
});
