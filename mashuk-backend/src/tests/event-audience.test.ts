import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  audienceWriteFields,
  eventVisibleForParticipantDirection,
  resolveEventAudienceDirectionIds,
} from '../services/eventAudience.js';

describe('eventAudience', () => {
  it('empty ids mean all participants', () => {
    assert.deepEqual(resolveEventAudienceDirectionIds({ audienceType: 'all' }), []);
    assert.equal(eventVisibleForParticipantDirection({ audienceType: 'all' }, 1), true);
    assert.equal(eventVisibleForParticipantDirection({ audienceDirectionIds: [] }, 2), true);
  });

  it('multi-select filters by participant direction', () => {
    const event = { audienceDirectionIds: [2, 5] };
    assert.equal(eventVisibleForParticipantDirection(event, 2), true);
    assert.equal(eventVisibleForParticipantDirection(event, 5), true);
    assert.equal(eventVisibleForParticipantDirection(event, 3), false);
    assert.equal(eventVisibleForParticipantDirection(event, null), true);
  });

  it('legacy single direction still works', () => {
    const event = { audienceType: 'direction', audienceDirectionId: 7 };
    assert.deepEqual(resolveEventAudienceDirectionIds(event), [7]);
    assert.equal(eventVisibleForParticipantDirection(event, 7), true);
    assert.equal(eventVisibleForParticipantDirection(event, 1), false);
  });

  it('audienceWriteFields syncs legacy columns', () => {
    assert.deepEqual(audienceWriteFields({ audienceDirectionIds: [] }), {
      audienceType: 'all',
      audienceDirectionId: null,
      audienceDirectionIds: [],
    });
    assert.deepEqual(audienceWriteFields({ audienceDirectionIds: [3, 1, 3] }), {
      audienceType: 'direction',
      audienceDirectionId: 3,
      audienceDirectionIds: [3, 1],
    });
  });
});
