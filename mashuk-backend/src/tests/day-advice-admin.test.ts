import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adviceCsvTemplate,
  filterAdviceList,
  parseAdviceCsv,
  validateAdvicePayload,
} from '../services/dayAdviceAdminService.js';

describe('dayAdviceAdminService', () => {
  it('validates body required and day range', () => {
    const bad = validateAdvicePayload({
      dayNumber: 8,
      roleKey: 'meaning_researcher',
      body: 'ok',
    });
    assert.equal(bad.ok, false);

    const noBody = validateAdvicePayload({
      dayNumber: 2,
      roleKey: 'meaning_researcher',
      title: 'x',
    });
    assert.equal(noBody.ok, false);

    const ok = validateAdvicePayload({
      dayNumber: 1,
      roleKey: 'practice_realizer',
      body: 'Текст совета без заголовка',
      status: 'published',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.data.status, 'published');
      assert.equal(ok.data.title, 'Текст совета без заголовка'.slice(0, 60));
      assert.equal(ok.data.hint, null);
    }
  });

  it('parses CSV header and filters list', () => {
    const tpl = adviceCsvTemplate();
    assert.match(tpl, /role_key,day_number,title/);
    const { rows, errors } = parseAdviceCsv(tpl);
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 1);

    const list = filterAdviceList(
      [
        { dayNumber: 2, roleKey: 'a', title: 'Hello', body: 'world', status: 'draft' },
        { dayNumber: 3, roleKey: 'b', title: 'Other', body: '', status: 'published' },
      ],
      { q: 'hello', status: 'draft' },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.title, 'Hello');
  });
});
