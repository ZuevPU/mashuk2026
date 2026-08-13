import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleJourney,
  classifyRoleChange,
  emptyRoleJourney,
  roleFamily,
} from '../services/analytics/roleJourney.js';

const roles = [
  { roleKey: 'meaning_researcher', name: 'Исследователь смыслов' },
  { roleKey: 'content_packer', name: 'Упаковщик содержания' },
  { roleKey: 'practice_realizer', name: 'Реализатор практики' },
  { roleKey: 'process_navigator', name: 'Навигатор процесса' },
  { roleKey: 'communication_guide', name: 'Проводник коммуникации' },
  { roleKey: 'environment_keeper', name: 'Хранитель среды' },
];

describe('roleJourney', () => {
  it('classifies start → now into exclusive buckets', () => {
    assert.equal(classifyRoleChange(null, 'practice_realizer'), 'unknown');
    assert.equal(classifyRoleChange('meaning_researcher', 'meaning_researcher'), 'stayed');
    assert.equal(classifyRoleChange('meaning_researcher', 'content_packer'), 'refined');
    assert.equal(classifyRoleChange('meaning_researcher', 'practice_realizer'), 'shifted');
    assert.equal(roleFamily('communication_guide'), 'people');
  });

  it('builds mutually exclusive what-happened shares and a current-role histogram', () => {
    const journey = buildRoleJourney([
      { start: 'meaning_researcher', now: 'meaning_researcher' },
      { start: 'meaning_researcher', now: 'meaning_researcher' },
      { start: 'meaning_researcher', now: 'content_packer' },
      { start: 'content_packer', now: 'practice_realizer' },
      { start: null, now: 'communication_guide' },
    ], roles);

    assert.equal(journey.n, 5);
    const byKey = Object.fromEntries(journey.whatHappened.map(r => [r.key, r]));
    assert.equal(byKey.stayed.count, 2);
    assert.equal(byKey.refined.count, 1);
    assert.equal(byKey.shifted.count, 1);
    assert.equal(byKey.unknown.count, 1);
    const sum = journey.whatHappened.reduce((s, r) => s + r.pct, 0);
    assert.ok(Math.abs(sum - 100) < 0.2);
    assert.equal(journey.dominant?.roleKey, 'meaning_researcher');
    assert.equal(journey.nowN, 5);
    assert.ok(journey.helped.some(h => h.label === 'Перешли к действию' && h.count === 1));
    assert.match(journey.conclusion, /роль/i);
  });

  it('returns an empty snapshot without people', () => {
    const empty = emptyRoleJourney(roles);
    assert.equal(empty.n, 0);
    assert.equal(empty.now.length, 6);
    assert.equal(empty.dominant, null);
  });
});
