import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampForumDay,
  filterLeaderboardParticipants,
  parseLeaderboardQuery,
  participantDisplayName,
} from '../services/leaderboardQuery.js';
import { NOMINATION_LEADERBOARD_KEYS, NOMINATION_LABELS } from '../services/leaderboardService.js';

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

  it('defaults medal mode on points filter', () => {
    const q = parseLeaderboardQuery({ mode: 'points', medalMode: 'count' });
    assert.equal(q.medalMode, 'count');
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
