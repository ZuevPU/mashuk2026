import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePostUrl,
  isQrInValidWindow,
  isRepeatableExecution,
  pickDisplaySubmission,
  resolveSubmissionWriteAction,
} from '../services/taskEligibility.js';

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

describe('isRepeatableExecution', () => {
  it('treats daily and repeatable as repeatable', () => {
    assert.equal(isRepeatableExecution('daily'), true);
    assert.equal(isRepeatableExecution('repeatable'), true);
    assert.equal(isRepeatableExecution('multiple'), true);
    assert.equal(isRepeatableExecution('once'), false);
  });
});

describe('pickDisplaySubmission', () => {
  it('prefers pending over approved', () => {
    const subs = [
      { id: 1, status: 'approved', submittedAt: new Date('2026-08-12T12:00:00Z') },
      { id: 2, status: 'pending', submittedAt: new Date('2026-08-12T11:00:00Z') },
    ] as Parameters<typeof pickDisplaySubmission>[0];
    assert.equal(pickDisplaySubmission(subs)?.id, 2);
  });
});

describe('resolveSubmissionWriteAction', () => {
  const baseTask = { executionType: 'repeatable', allowRetry: true } as Parameters<typeof resolveSubmissionWriteAction>[0];

  it('blocks when pending exists', () => {
    const action = resolveSubmissionWriteAction(baseTask, [
      { id: 1, status: 'pending', submittedAt: new Date() },
    ] as Parameters<typeof resolveSubmissionWriteAction>[1], true, false);
    assert.equal(action.action, 'block');
  });

  it('inserts new row after approved repeatable when eligible', () => {
    const action = resolveSubmissionWriteAction(baseTask, [
      { id: 1, status: 'approved', submittedAt: new Date() },
    ] as Parameters<typeof resolveSubmissionWriteAction>[1], true, false);
    assert.equal(action.action, 'insert');
  });

  it('updates rejected row when retry allowed', () => {
    const action = resolveSubmissionWriteAction(
      { executionType: 'once', allowRetry: true } as Parameters<typeof resolveSubmissionWriteAction>[0],
      [{ id: 5, status: 'rejected', submittedAt: new Date() }] as Parameters<typeof resolveSubmissionWriteAction>[1],
      true,
      true,
    );
    assert.deepEqual(action, { action: 'update', submissionId: 5 });
  });

  it('blocks rejected without retry', () => {
    const action = resolveSubmissionWriteAction(
      { executionType: 'once', allowRetry: false } as Parameters<typeof resolveSubmissionWriteAction>[0],
      [{ id: 5, status: 'rejected', submittedAt: new Date() }] as Parameters<typeof resolveSubmissionWriteAction>[1],
      true,
      false,
    );
    assert.equal(action.action, 'block');
  });
});
