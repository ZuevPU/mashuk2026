import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalRestateDay5,
  isGoalRestateField,
} from '../services/analytics/goalRestateDay5.js';

describe('goalRestateDay5', () => {
  it('matches the restated-goal question by label', () => {
    assert.equal(isGoalRestateField({
      key: 'new_field_8',
      label: 'Если цель изменилась / уточнилась, как бы ты сформулировал(а) её сейчас?',
    }), true);
    assert.equal(isGoalRestateField({
      key: 'mainThesis',
      label: 'Главный тезис (ключевая мысль) дня',
    }), false);
  });

  it('keeps day-5 comments and builds theme counts', () => {
    const result = buildGoalRestateDay5(
      [{
        key: 'goalNowText',
        type: 'text',
        label: 'Если цель изменилась / уточнилась, как бы ты сформулировал(а) её сейчас?',
      }],
      [
        {
          dayNumber: 5,
          directionName: 'Воспитатели',
          p: { groupName: 'А1' },
          ratings: { goalNowText: 'Хочу выстроить работу с родителями через короткие встречи' },
        },
        {
          dayNumber: 5,
          directionName: 'Воспитатели',
          ratings: { goalNowText: 'Работа с родителями и командой наставников' },
        },
        {
          dayNumber: 4,
          directionName: 'Воспитатели',
          ratings: { goalNowText: 'Это не день 5 и не должно попасть' },
        },
        {
          dayNumber: 5,
          directionName: 'Учителя',
          ratings: { goalNowText: 'ок' },
        },
      ],
    );
    assert.ok(result);
    assert.equal(result.answered, 2);
    assert.equal(result.comments.length, 2);
    assert.ok(result.themes.some(t => t.token === 'родителями' || t.token === 'работа'));
    assert.equal(result.byDirection[0].direction, 'Воспитатели');
    assert.equal(result.byDirection[0].answered, 2);
  });
});
