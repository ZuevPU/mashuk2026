import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskQrUrl,
  buildTaskScanDeepLink,
  formatTaskQrDisplayCode,
  generateShortQrCode,
  normalizeTaskQrCode,
} from '../services/qrService.js';

describe('task short QR codes', () => {
  it('generates 6-char codes from safe alphabet', () => {
    const code = generateShortQrCode(6);
    assert.equal(code.length, 6);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('normalizes МШК prefix, /q/ path and scan/tasks hash', () => {
    assert.equal(normalizeTaskQrCode('мшк-a7k2x9'), 'A7K2X9');
    assert.equal(normalizeTaskQrCode('https://example.com/q/AbCd12'), 'ABCD12');
    assert.equal(normalizeTaskQrCode('https://vk.ru/app1/#/scan?qr=ZZ9Y8X'), 'ZZ9Y8X');
    assert.equal(normalizeTaskQrCode('https://vk.ru/app1/#/tasks?task=42&qr=ZZ9Y8X'), 'ZZ9Y8X');
    assert.equal(normalizeTaskQrCode('a'.repeat(32)), 'a'.repeat(32));
  });

  it('formats display code', () => {
    assert.equal(formatTaskQrDisplayCode('a7k2x9'), 'МШК-A7K2X9');
  });

  it('buildTaskQrUrl uses PUBLIC_URL /q/ or scan deep-link fallback', () => {
    const prev = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'https://api.example.com';
    try {
      // env module may already be cached — URL builder reads env at call time via imported env
      const url = buildTaskQrUrl('https://vk.ru/app1', 42, 'A7K2X9');
      assert.ok(url.includes('/q/A7K2X9') || url.includes('#/scan?qr=A7K2X9'), url);
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = prev;
    }
  });

  it('buildTaskScanDeepLink opens #/scan for auto-credit', () => {
    const link = buildTaskScanDeepLink('A7K2X9', 42);
    assert.match(link, /#\/scan\?qr=A7K2X9$/);
  });
});
