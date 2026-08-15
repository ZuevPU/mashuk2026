import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { awardLabel, classifyAward, matchAwardsToAnswer } from '../services/answerModeration.js';

const at = new Date('2026-08-15T12:00:00.000Z');

function log(partial: {
  id: number;
  actionType?: string | null;
  points: number;
  participantId?: number;
  relatedLogId?: number | null;
  createdAt?: Date | null;
  revokedAt?: Date | null;
}) {
  return {
    id: partial.id,
    actionType: partial.actionType ?? 'state_check_day',
    points: partial.points,
    participantId: partial.participantId ?? 1,
    relatedLogId: partial.relatedLogId ?? null,
    createdAt: partial.createdAt ?? at,
    revokedAt: partial.revokedAt ?? null,
  };
}

describe('answerModeration matching', () => {
  it('labels depth bonus and primary state-check separately', () => {
    assert.equal(awardLabel('question_answer', 3, 'bonus'), 'За развёрнутый ответ');
    assert.equal(awardLabel('state_check_day', 5, 'primary'), 'За ответ на проверку состояния');
    assert.equal(classifyAward({ actionType: 'question_answer', points: 3, relatedLogId: 10 }, 'state_check_day', 10), 'bonus');
    assert.equal(classifyAward({ actionType: 'state_check_day', points: 5, relatedLogId: null }, 'state_check_day', 10), 'primary');
  });

  it('attaches +5 and historical +3 to the same answer', () => {
    const awards = matchAwardsToAnswer(
      [
        log({ id: 10, actionType: 'state_check_day', points: 5 }),
        log({ id: 11, actionType: 'question_answer', points: 3, relatedLogId: 10 }),
        log({ id: 99, actionType: 'state_check_morning', points: 5, createdAt: new Date('2026-08-14T08:00:00.000Z') }),
      ],
      { participantId: 1, pointsLogId: 10, createdAt: at },
      'state_check_day',
    );
    assert.deepEqual(awards.map(a => ({ logId: a.logId, points: a.points, kind: a.kind })), [
      { logId: 10, points: 5, kind: 'primary' },
      { logId: 11, points: 3, kind: 'bonus' },
    ]);
  });

  it('skips revoked and other participants', () => {
    const awards = matchAwardsToAnswer(
      [
        log({ id: 10, points: 5, revokedAt: at }),
        log({ id: 11, points: 5, participantId: 2 }),
      ],
      { participantId: 1, pointsLogId: 10, createdAt: at },
      'state_check_day',
    );
    assert.equal(awards.length, 0);
  });
});
