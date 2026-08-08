import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegion, RU_REGIONS } from '../data/regions.js';

describe('normalizeRegion', () => {
  it('keeps canonical names', () => {
    assert.equal(normalizeRegion('Москва'), 'Москва');
    assert.equal(normalizeRegion(RU_REGIONS[0]), RU_REGIONS[0]);
  });

  it('maps historical short forms', () => {
    assert.equal(normalizeRegion('КЧР'), 'Карачаево-Черкесская Республика');
    assert.equal(normalizeRegion('кчр'), 'Карачаево-Черкесская Республика');
    assert.equal(normalizeRegion('СПб'), 'Санкт-Петербург');
  });

  it('strips trailing period and odd dashes', () => {
    assert.equal(
      normalizeRegion('Карачаево‑Черкесская Республика.'),
      'Карачаево-Черкесская Республика',
    );
  });

  it('keeps foreign / custom values', () => {
    assert.equal(normalizeRegion('Казахстан'), 'Казахстан');
  });
});
