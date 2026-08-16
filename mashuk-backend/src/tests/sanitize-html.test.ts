import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDescriptionHtml } from '../services/sanitizeDescriptionHtml.js';
import { parseAdminListPage } from '../services/adminListPage.js';

describe('sanitizeDescriptionHtml', () => {
  it('keeps ordinary paragraphs', () => {
    assert.equal(sanitizeDescriptionHtml('<p>Привет</p>'), '<p>Привет</p>');
  });

  it('strips script and onclick', () => {
    const raw = '<p onclick="alert(1)">x</p><script>alert(1)</script>';
    const out = sanitizeDescriptionHtml(raw) || '';
    assert.equal(out.includes('script'), false);
    assert.equal(out.includes('onclick'), false);
    assert.equal(out.includes('Привет') || out.includes('x'), true);
  });

  it('returns null for null', () => {
    assert.equal(sanitizeDescriptionHtml(null), null);
  });
});

describe('parseAdminListPage', () => {
  it('defaults to 500 / 0', () => {
    assert.deepEqual(parseAdminListPage({}), { limit: 500, offset: 0 });
  });

  it('caps limit at 1000', () => {
    assert.equal(parseAdminListPage({ limit: 9999 }).limit, 1000);
  });
});
