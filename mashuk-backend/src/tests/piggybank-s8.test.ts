import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePiggybankTags,
  entryHasTag,
  entryTags,
  pointsActionForTags,
} from '../services/piggybankDict.js';
import { filterPiggybankEntries } from '../services/piggybankService.js';

describe('piggybank multi-tag §8', () => {
  it('normalizes up to 3 unique tags', () => {
    const tags = normalizePiggybankTags(['идея', 'идея', 'в работу', 'мысль', 'контакт']);
    assert.deepEqual(tags, ['идея', 'в работу', 'мысль']);
  });

  it('entryHasTag reads jsonb tags', () => {
    assert.equal(entryHasTag({ tags: ['идея', 'в работу'], tag: 'идея' }, 'в работу'), true);
    assert.equal(entryHasTag({ tag: 'мысль' }, 'идея'), false);
  });

  it('pointsActionForTags picks highest priority', () => {
    assert.equal(pointsActionForTags(['контакт', 'идея']), 'piggybank_idea');
  });

  it('filterPiggybankEntries matches any tag', () => {
    const rows = [
      { text: 'a', source: 'Своя мысль', forumDay: 2, tags: ['идея'] },
      { text: 'b', source: 'Клуб', forumDay: 3, tags: ['мысль', 'в работу'] },
    ];
    const filtered = filterPiggybankEntries(rows, { tag: 'в работу' }, (e, t) => entryHasTag(e, t));
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].text, 'b');
  });
});
