import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalProgressByDirection,
  isGoalProgressField,
  parseGoalProgressScore,
} from '../services/analytics/goalProgressByDirection.js';

describe('goalProgressByDirection', () => {
  it('matches the goal-progress question by label or options', () => {
    assert.equal(isGoalProgressField({
      key: 'new_field_4',
      label: 'Где ты сейчас находишься в движении к своей цели (даже если она поменялась или уточнилась)',
    }), true);
    assert.equal(isGoalProgressField({
      key: 'x',
      type: 'choice',
      options: [
        '1 — Ничего не изменилось: я остался(ась) примерно там же',
        '2 — Появилось понимание, куда двигаться',
        '3 — Я сделал(а) первые конкретные шаги',
      ],
    }), true);
    assert.equal(isGoalProgressField({ key: 'direction', label: 'Работа в рамках тематического направления' }), false);
  });

  it('parses scale numbers and labelled choice answers', () => {
    assert.equal(parseGoalProgressScore(4), 4);
    assert.equal(parseGoalProgressScore('3'), 3);
    assert.equal(parseGoalProgressScore('5 — Я существенно приблизился(ась) к цели / достиг(ла) значимого результата'), 5);
    assert.equal(parseGoalProgressScore('Появилось понимание, куда двигаться'), 2);
    assert.equal(parseGoalProgressScore('нет'), null);
  });

  it('aggregates averages and 1–5 mix by direction', () => {
    const result = buildGoalProgressByDirection(
      [{
        key: 'goalNow',
        label: 'Где ты сейчас находишься в движении к своей цели',
        type: 'scale_1_5',
      }],
      [
        { ratings: { goalNow: 1 }, directionName: 'А' },
        { ratings: { goalNow: 5 }, directionName: 'А' },
        { ratings: { goalNow: 4 }, directionName: 'Б' },
        { ratings: { food: 5 }, directionName: 'Б' },
      ],
    );
    assert.ok(result);
    assert.equal(result.answered, 3);
    assert.equal(result.avg, 3.3);
    assert.equal(result.byDirection[0].direction, 'Б');
    assert.equal(result.byDirection[0].avg, 4);
    assert.equal(result.byDirection[1].direction, 'А');
    assert.equal(result.byDirection[1].avg, 3);
    assert.equal(result.byDirection[1].dist[0].count, 1);
    assert.equal(result.byDirection[1].dist[4].count, 1);
  });
});
