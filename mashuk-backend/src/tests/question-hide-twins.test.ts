import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { questionsAreVisibilityTwins } from '../services/questionHideCascade.js';
import {
  buildSuppressedVisibilityKeys,
  isSuppressedByHiddenTwin,
} from '../services/questionVisibilityKeys.js';
import { lateAnswerPolicyForQuestion } from '../services/timePhase.js';

describe('question hide twins', () => {
  it('matches same state-check slot twins with different titles/windows', () => {
    const hidden = {
      id: 89,
      shiftId: 1,
      title: 'Дневная проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'день',
      questionKind: 'state_check',
      dayNumber: 4,
      dayNumbers: [4],
      isHidden: true,
      status: 'published',
    };
    const twin = {
      ...hidden,
      id: 201,
      title: 'Дневная проверка',
      timePoint: '', // пустой timePoint — фаза из заголовка
      isHidden: false,
    };
    assert.equal(questionsAreVisibilityTwins(hidden as never, twin as never), true);
    const suppressed = buildSuppressedVisibilityKeys([hidden, twin]);
    assert.equal(isSuppressedByHiddenTwin(twin, suppressed), true);
  });

  it('matches direction sense-making twins by slot', () => {
    const hidden = {
      id: 88,
      shiftId: 1,
      title: 'Осмысление по направлению',
      type: 'open',
      block: 'Точки осмысления',
      timePoint: 'день',
      questionKind: 'after_blocks',
      dayNumber: 4,
      dayNumbers: [4],
      isHidden: true,
      status: 'published',
    };
    const twin = {
      ...hidden,
      id: 199,
      isHidden: false,
    };
    assert.equal(questionsAreVisibilityTwins(hidden as never, twin as never), true);
    const suppressed = buildSuppressedVisibilityKeys([hidden, twin]);
    assert.equal(isSuppressedByHiddenTwin(twin, suppressed), true);
  });

  it('after_blocks closes by midnight policy', () => {
    assert.equal(
      lateAnswerPolicyForQuestion({ questionKind: 'after_blocks', title: 'Осмысление по направлению' }),
      'until_midnight',
    );
  });
});
