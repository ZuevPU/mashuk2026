import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePostUrl,
  isQrInValidWindow,
} from '../services/taskEligibility.js';
import { validateTaskSubmissionPayload } from '../services/taskAdminHelpers.js';

describe('normalizePostUrl', () => {
  it('lowercases host and strips trailing slash', () => {
    assert.equal(
      normalizePostUrl('https://VK.COM/user/'),
      'vk.com/user',
    );
  });

  it('adds https when scheme missing', () => {
    assert.equal(normalizePostUrl('example.com/path'), 'example.com/path');
  });

  it('preserves query string', () => {
    assert.equal(
      normalizePostUrl('https://Example.com/x?a=1'),
      'example.com/x?a=1',
    );
  });
});

describe('isQrInValidWindow', () => {
  it('allows when no bounds set', () => {
    assert.equal(isQrInValidWindow({}, new Date()), true);
  });

  it('rejects before qrValidFrom', () => {
    const now = new Date('2026-08-12T12:00:00Z');
    assert.equal(
      isQrInValidWindow({ qrValidFrom: new Date('2026-08-13T00:00:00Z') }, now),
      false,
    );
  });

  it('rejects after qrValidTo', () => {
    const now = new Date('2026-08-12T12:00:00Z');
    assert.equal(
      isQrInValidWindow({ qrValidTo: new Date('2026-08-11T00:00:00Z') }, now),
      false,
    );
  });
});

describe('validateTaskSubmissionPayload text-only', () => {
  const textTask = {
    confirmationMethods: ['text', 'moderator'],
    confirmationType: 'text_photo',
    answerType: 'text',
    autoConfirm: false,
    qrToken: null,
  } as never;

  it('accepts text without photo', () => {
    const r = validateTaskSubmissionPayload(textTask, { answerText: 'Мой ответ' });
    assert.equal(r.ok, true);
  });

  it('rejects empty text', () => {
    const r = validateTaskSubmissionPayload(textTask, { answerText: '  ' });
    assert.equal(r.ok, false);
  });

  it('still requires photo when photo method selected', () => {
    const photoTask = {
      confirmationMethods: ['photo', 'moderator'],
      confirmationType: 'photo',
      answerType: 'photo',
      autoConfirm: false,
      qrToken: null,
    } as never;
    const r = validateTaskSubmissionPayload(photoTask, { answerText: 'есть текст' });
    assert.equal(r.ok, false);
  });
});
