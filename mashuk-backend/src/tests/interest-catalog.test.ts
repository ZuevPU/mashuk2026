import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInterestCatalogToGroups,
  renameInterestInGroups,
} from '../services/interestCatalog.js';

describe('interestCatalog', () => {
  it('keeps existing groups and appends new names to Интересы', () => {
    const next = applyInterestCatalogToGroups(
      [
        { title: 'Педагогика', tags: ['открытые уроки', 'устаревшее'] },
        { title: 'Команда', tags: ['наставничество'] },
      ],
      ['открытые уроки', 'наставничество', 'медиа'],
    );
    assert.deepEqual(next, [
      { title: 'Педагогика', tags: ['открытые уроки'] },
      { title: 'Команда', tags: ['наставничество'] },
      { title: 'Интересы', tags: ['медиа'] },
    ]);
  });

  it('renames a tag in place without moving the group', () => {
    const next = renameInterestInGroups(
      [{ title: 'Педагогика', tags: ['открытые уроки', 'игра'] }],
      'открытые уроки',
      'открытый урок',
    );
    assert.deepEqual(next, [{ title: 'Педагогика', tags: ['открытый урок', 'игра'] }]);
  });

  it('drops a removed name', () => {
    const next = renameInterestInGroups(
      [{ title: 'Педагогика', tags: ['открытые уроки'] }],
      'открытые уроки',
      '',
    );
    assert.deepEqual(next, []);
  });
});
