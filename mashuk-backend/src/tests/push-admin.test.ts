import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandPushPlaceholders } from '../services/pushPlaceholderExpand.js';
import { optOutCategoryForNotificationType } from '../services/pushNotificationTypes.js';
import { formatVkPushText } from '../services/pushService.js';

describe('§8 admin push helpers', () => {
  it('expandPushPlaceholders replaces tokens', () => {
    const out = expandPushPlaceholders(
      '{ФИО}, {День}, {Роль}, {Событие}',
      { firstName: 'Иван', lastName: 'Петров', pedagogicalRole: 'Наставник' },
      { programDay: 3, eventTitle: 'Пленар' },
    );
    assert.match(out, /Иван Петров/);
    assert.match(out, /Д3/);
    assert.match(out, /Наставник/);
    assert.match(out, /Пленар/);
  });

  it('optOutCategoryForNotificationType maps org', () => {
    assert.equal(optOutCategoryForNotificationType('org'), 'org');
    assert.equal(optOutCategoryForNotificationType('state_check'), 'touchpoints');
  });

  it('formatVkPushText respects length', () => {
    const t = formatVkPushText('Hi', 'x'.repeat(300));
    assert.ok(t.length <= 254);
  });
});
