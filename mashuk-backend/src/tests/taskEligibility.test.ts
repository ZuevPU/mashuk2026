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

  it('uses Moscow clock time and ignores calendar date on bounds', () => {
    // 12:00 MSK = 09:00 UTC
    const now = new Date('2026-08-12T09:00:00Z');
    // from 10:00 MSK, to 18:00 MSK (dates intentionally different / past)
    assert.equal(
      isQrInValidWindow({
        qrValidFrom: new Date('2000-01-01T07:00:00Z'), // 10:00 MSK
        qrValidTo: new Date('2000-01-01T15:00:00Z'), // 18:00 MSK
      }, now),
      true,
    );
    // 08:00 MSK = 05:00 UTC — before window
    assert.equal(
      isQrInValidWindow({
        qrValidFrom: new Date('2000-01-01T07:00:00Z'),
        qrValidTo: new Date('2000-01-01T15:00:00Z'),
      }, new Date('2026-08-12T05:00:00Z')),
      false,
    );
  });

  it('rejects when forum day is outside task dayNumbers', () => {
    const now = new Date('2026-08-12T09:00:00Z');
    assert.equal(
      isQrInValidWindow(
        {
          qrValidFrom: new Date('2000-01-01T07:00:00Z'),
          qrValidTo: new Date('2000-01-01T15:00:00Z'),
          dayNumbers: [1, 2],
        },
        now,
        4,
      ),
      false,
    );
    assert.equal(
      isQrInValidWindow(
        {
          qrValidFrom: new Date('2000-01-01T07:00:00Z'),
          qrValidTo: new Date('2000-01-01T15:00:00Z'),
          dayNumbers: [1, 2, 4],
        },
        now,
        4,
      ),
      true,
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
