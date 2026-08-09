import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTaskAnswerOptions,
  parseTaskMultiAnswer,
  formatTaskAnswerForDisplay,
  validateTaskSubmissionPayload,
} from '../services/taskAdminHelpers.js';

describe('task answer formats', () => {
  it('normalizes string and object options', () => {
    assert.deepEqual(normalizeTaskAnswerOptions(['A', 'B']), [
      { label: 'A', value: '0' },
      { label: 'B', value: '1' },
    ]);
  });

  it('parses multi answers', () => {
    assert.deepEqual(parseTaskMultiAnswer('["0","2"]'), ['0', '2']);
  });

  it('formats choice answer', () => {
    const text = formatTaskAnswerForDisplay(
      { answerType: 'choice', answerOptions: [{ label: 'Да', value: 'yes' }] },
      'yes',
    );
    assert.equal(text, 'Да');
  });

  it('requires text for text tasks', () => {
    const task = { answerType: 'text', answerOptions: [], confirmationMethods: [], confirmationType: 'text_photo', autoConfirm: false } as any;
    assert.equal(validateTaskSubmissionPayload(task, {}).ok, false);
    assert.equal(validateTaskSubmissionPayload(task, { answerText: 'hi' }).ok, true);
  });

  it('QR tasks accept only matching qrToken even with photo answerType', () => {
    const task = {
      answerType: 'text_and_photo',
      answerOptions: [],
      confirmationMethods: ['qr'],
      confirmationType: 'qr',
      autoConfirm: true,
      qrToken: 'A7K2X9',
    } as any;
    assert.equal(validateTaskSubmissionPayload(task, {}).ok, false);
    assert.equal(validateTaskSubmissionPayload(task, { qrToken: 'WRONG1' }).ok, false);
    assert.equal(validateTaskSubmissionPayload(task, { qrToken: 'A7K2X9' }).ok, true);
  });
});
