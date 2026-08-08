import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampForumDay,
  filterLeaderboardParticipants,
  isOrganizerDirection,
  parseLeaderboardQuery,
  participantDisplayName,
} from '../services/leaderboardQuery.js';
import { NOMINATION_LEADERBOARD_KEYS, NOMINATION_LABELS } from '../services/leaderboardService.js';
import { participantRatingScore } from '../services/pointsService.js';

describe('clampForumDay', () => {
  it('clamps to 1-6', () => {
    assert.equal(clampForumDay(7), 6);
    assert.equal(clampForumDay(0), 1);
    assert.equal(clampForumDay(3), 3);
  });
});

describe('parseLeaderboardQuery', () => {
  it('parses group and search', () => {
    const q = parseLeaderboardQuery({ groupId: '5', search: 'Иванов', showAll: 'true' });
    assert.equal(q.groupId, 5);
    assert.equal(q.search, 'иванов');
    assert.equal(q.limit, 0);
  });

  it('keeps explicit medal mode on points filter', () => {
    const q = parseLeaderboardQuery({ mode: 'points', medalMode: 'count' });
    assert.equal(q.medalMode, 'count');
  });

  it('does not treat missing medalMode as medal-count ranking', () => {
    const q = parseLeaderboardQuery({ mode: 'points', scope: 'shift', track: 'total' });
    assert.equal(q.medalMode, null);
  });
});

describe('filterLeaderboardParticipants', () => {
  const base = [
    { id: 1, firstName: 'Иван', lastName: 'Иванов', direction: 'A', groupId: 10, groupName: 'G1', hideFromLeaderboard: false, selfDeletedAt: null },
    { id: 2, firstName: 'Пётр', lastName: 'Петров', direction: 'B', groupId: 20, groupName: 'G2', hideFromLeaderboard: false, selfDeletedAt: null },
  ];

  it('filters by group', () => {
    const out = filterLeaderboardParticipants(base as any, { groupId: 10 });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 1);
  });

  it('filters by search', () => {
    const out = filterLeaderboardParticipants(base as any, { search: 'петр' });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 2);
  });

  it('excludes organizers even when keepParticipantId matches', () => {
    const list = [
      { id: 1, firstName: 'Яна', lastName: 'Авакян', direction: 'Учителя', directionStored: 'Организатор форума', hideFromLeaderboard: false, selfDeletedAt: null },
      { id: 2, firstName: 'Пётр', lastName: 'Зуев', direction: 'Организатор Форума', hideFromLeaderboard: false, selfDeletedAt: null },
      { id: 3, firstName: 'Иван', lastName: 'Иванов', direction: 'Учителя', hideFromLeaderboard: false, selfDeletedAt: null },
    ];
    const out = filterLeaderboardParticipants(list as any, {
      hideFromLeaderboard: true,
      keepParticipantId: 2,
    });
    assert.deepEqual(out.map(p => p.id), [3]);
  });

  it('excludes by organizerDirectionIds even if display name is stale', () => {
    const list = [
      { id: 1, firstName: 'Яна', lastName: 'Авакян', direction: 'Учителя', directionId: 99, hideFromLeaderboard: false, selfDeletedAt: null },
      { id: 2, firstName: 'Иван', lastName: 'Иванов', direction: 'Учителя', directionId: 1, hideFromLeaderboard: false, selfDeletedAt: null },
    ];
    const out = filterLeaderboardParticipants(list as any, {
      hideFromLeaderboard: true,
      organizerDirectionIds: new Set([99]),
    });
    assert.deepEqual(out.map(p => p.id), [2]);
  });
});

describe('isOrganizerDirection', () => {
  it('matches normalized organizer names', () => {
    assert.equal(isOrganizerDirection('Организатор Форума'), true);
    assert.equal(isOrganizerDirection('  организатор   форума '), true);
    assert.equal(isOrganizerDirection('Учителя', 'Организатор форума'), true);
    assert.equal(isOrganizerDirection('Учителя'), false);
  });
});

describe('nominations TZ list', () => {
  it('includes networking and leadership', () => {
    assert.ok(NOMINATION_LEADERBOARD_KEYS.includes('networking'));
    assert.ok(NOMINATION_LEADERBOARD_KEYS.includes('leadership'));
    assert.equal(NOMINATION_LABELS.networking, 'Нетворкинг');
    assert.equal(NOMINATION_LABELS.leadership, 'Лидерство');
  });
});

describe('participantDisplayName', () => {
  it('formats name', () => {
    assert.equal(participantDisplayName({ firstName: 'Иван', lastName: 'Иванов' }), 'Иванов Иван');
  });
});

describe('participantRatingScore', () => {
  it('falls back to path+exp+bonus when forum_points is stale zero', () => {
    assert.equal(participantRatingScore({
      pathPoints: 10,
      experiencePoints: 5,
      bonusPoints: 2,
      forumPoints: 0,
    }), 17);
  });

  it('keeps zero when participant truly has no points', () => {
    assert.equal(participantRatingScore({
      pathPoints: 0,
      experiencePoints: 0,
      bonusPoints: 0,
      forumPoints: 0,
    }), 0);
  });
});
