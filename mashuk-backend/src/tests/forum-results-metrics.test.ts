import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChoiceDist,
  buildForumNps,
  classifyForumField,
  clusterSimilarTexts,
  rowHasForumFinalAnswer,
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
    assert.equal(classifyForumField({
      key: 'customYn', type: 'yes_no', label: 'Был ли ты на выезде?',
    }), 'yesno');
    assert.equal(classifyForumField({
      key: 'customChoice', type: 'choice', label: 'Какой формат удобнее?', options: ['A', 'B'],
    }), 'choice');
    assert.equal(classifyForumField({
      key: 'mood10', type: 'scale_1_10', label: 'Насколько день был насыщенным?',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'rating', type: 'scale_1_5', label: 'Оцените рейтинговую систему',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'bot', type: 'scale_1_5', label: 'Насколько полезен бот форума',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'rating', type: 'scale_1_5', label: 'Оцените рейтинговую систему',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'bot', type: 'scale_1_5', label: 'Насколько полезен бот форума',
    }), 'scale_block');
    assert.equal(classifyForumField({
      key: 'practice', type: 'program_event', label: 'Какие практики посетили?',
    }), 'program_event');
  });

  it('buildChoiceDist maps yes_no answers to Да/Нет', () => {
    const dist = buildChoiceDist(
      [
        { ratings: { trip: true } },
        { ratings: { trip: false } },
        { ratings: { trip: true } },
      ],
      { key: 'trip', type: 'yes_no', label: 'Выезд?' },
      'yesno',
    );
    assert.equal(dist.n, 3);
    assert.deepEqual(
      dist.items.map(i => [i.name, i.n]),
      [['Да', 2], ['Нет', 1]],
    );
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

  it('rowHasForumFinalAnswer looks only at marked fields', () => {
    const marked = [{ key: 'housing', type: 'scale_1_5' as const, label: 'Быт' }];
    assert.equal(rowHasForumFinalAnswer({ housing: 5, skip: 'секрет' }, marked), true);
    assert.equal(rowHasForumFinalAnswer({ skip: 'секрет', likedMost: 'много текста' }, marked), false);
    assert.equal(rowHasForumFinalAnswer({}, marked), false);
    assert.equal(rowHasForumFinalAnswer(
      { housing: 5 },
      marked,
      { dayNumber: 2, daysByKey: new Map([['housing', [1]]]) },
    ), false);
    assert.equal(rowHasForumFinalAnswer(
      { housing: 5 },
      marked,
      { dayNumber: 1, daysByKey: new Map([['housing', [1]]]) },
    ), true);
  });
});
