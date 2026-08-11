import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { questionVisibleToParticipant } from '../services/questionEligibility.js';
import {
  isTouchpointQuestionForForumDay,
  questionMatchesTouchpointSlot,
  touchpointCompletionRatio,
} from '../services/touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';

describe('touchpoint D-1 catch-up visibility', () => {
  const participant = { directionId: 1, groupId: 2, pedagogicalRole: 'guide' };

  it('hides isHidden questions from participants', () => {
    const q = {
      title: 'Скрытый вопрос',
      block: 'Точки осмысления',
      questionKind: 'after_blocks',
      dayNumber: 3,
      dayNumbers: [3],
      audienceType: 'all' as const,
      isHidden: true,
    };
    assert.equal(questionVisibleToParticipant(q, participant, 3), false);
  });

  it('allows yesterday sense-making question for submit/list', () => {
    const q = {
      title: 'Осмысление по направлению',
      block: 'Точки осмысления',
      questionKind: 'after_blocks',
      dayNumber: 3,
      dayNumbers: [3],
      audienceType: 'all' as const,
    };
    assert.equal(questionVisibleToParticipant(q, participant, 4), true);
    assert.equal(questionVisibleToParticipant(q, participant, 3), true);
    assert.equal(questionVisibleToParticipant(q, participant, 5), false);
  });

  it('hides yesterday state check (hard_close — no D−1 catch-up)', () => {
    const q = {
      title: 'Утренняя проверка состояния',
      block: 'Проверка состояния',
      type: 'checkin',
      questionKind: 'state_check',
      timePoint: 'утро',
      dayNumber: 2,
      dayNumbers: [2],
      audienceType: 'all' as const,
    };
    assert.equal(questionVisibleToParticipant(q, participant, 3), false);
    assert.equal(questionVisibleToParticipant(q, participant, 2), true);
  });
});

describe('touchpoint matching for after_blocks aliases', () => {
  const directionSlot = TOUCHPOINT_SLOTS.find(s => s.title === 'Осмысление по направлению')!;

  it('matches after_blocks by kind even when block label differs', () => {
    const q = {
      id: 55,
      title: 'Рефлексия направления',
      type: 'open',
      block: 'После блоков',
      timePoint: 'день',
      questionKind: 'after_blocks',
      reflectionKind: null as string | null,
      dayNumber: 4,
      dayNumbers: [4],
    };
    assert.equal(questionMatchesTouchpointSlot(q, directionSlot), true);
    assert.equal(isTouchpointQuestionForForumDay(q as never, 4), true);
  });

  it('counts twin + eveningDone as full day for bonus parity', () => {
    const older = {
      id: 10,
      title: 'Осмысление по направлению',
      type: 'open',
      block: 'Точки осмысления',
      timePoint: 'день',
      questionKind: 'after_blocks',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const newer = { ...older, id: 99 };
    const morning = {
      id: 1,
      title: 'Утренняя проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'утро',
      questionKind: 'state_check',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const dayCheck = {
      id: 2,
      title: 'Дневная проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'день',
      questionKind: 'state_check',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const lesson1 = {
      id: 3,
      title: 'Осмысление урока (слот 1)',
      type: 'open',
      block: 'Точки осмысления',
      timePoint: 'день',
      questionKind: 'after_blocks',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const lesson2 = {
      id: 4,
      title: 'Осмысление урока (слот 2)',
      type: 'open',
      block: 'Точки осмысления',
      timePoint: 'вечер',
      questionKind: 'after_blocks',
      dayNumber: 2,
      dayNumbers: [2],
    };
    const eveningState = {
      id: 5,
      title: 'Вечерняя проверка состояния',
      type: 'checkin',
      block: 'Проверка состояния',
      timePoint: 'вечер',
      questionKind: 'state_check',
      dayNumber: 2,
      dayNumbers: [2],
    };
    // Answer older twin of direction slot — not the newest id
    const answered = new Set([1, 10, 2, 3, 4, 5]);
    const { completed, expected } = touchpointCompletionRatio(
      [morning, dayCheck, older, newer, lesson1, lesson2, eveningState] as never,
      answered,
      2,
      { eveningDone: true },
    );
    assert.equal(expected, 7);
    assert.equal(completed, 7);
  });
});
