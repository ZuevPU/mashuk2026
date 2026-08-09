import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipDeliveryStatus,
  describeDeliveryStatus,
  isPushDeliveredOk,
  shouldLogPushDeliveryIssue,
} from '../services/pushDeliveryStatus.js';
import { filterUnsentParticipantIds } from '../services/pushAudienceResolve.js';

describe('pushDeliveryStatus', () => {
  it('describeDeliveryStatus maps success codes', () => {
    assert.match(describeDeliveryStatus('sent_mini'), /мини-приложения/);
    assert.match(describeDeliveryStatus('sent_community'), /сообщества/);
  });

  it('describeDeliveryStatus maps skip codes', () => {
    assert.match(describeDeliveryStatus('skipped_opt_out'), /отключил/);
    assert.match(describeDeliveryStatus('skipped_no_token'), /VK_SERVICE_TOKEN/);
  });

  it('describeDeliveryStatus expands combined mini+community failure', () => {
    const hint = describeDeliveryStatus(
      'error: Unknown method passed; error: Can\'t send messages for users without permission',
    );
    assert.match(hint, /→/);
    assert.match(hint, /notifications\.sendMessage|ЛС/);
  });

  it('describeDeliveryStatus maps VK mini codes 2 and 3', () => {
    assert.match(describeDeliveryStatus('error: code_2'), /час|code 2/i);
    assert.match(describeDeliveryStatus('error: code_3'), /сут|code 3/i);
  });

  it('clipDeliveryStatus truncates long VK errors for DB', () => {
    const long = `error: ${'x'.repeat(400)}`;
    const clipped = clipDeliveryStatus(long, 50);
    assert.equal(clipped.length, 50);
    assert.ok(clipped.endsWith('…'));
  });

  it('isPushDeliveredOk and shouldLogPushDeliveryIssue', () => {
    assert.equal(isPushDeliveredOk('sent_mini'), true);
    assert.equal(isPushDeliveredOk('sent_mini; sent_community'), true);
    assert.equal(isPushDeliveredOk('sent_mini; error: Can\'t send messages (code_901)'), true);
    assert.equal(shouldLogPushDeliveryIssue('sent_mini'), false);
    assert.equal(shouldLogPushDeliveryIssue('sent_mini; sent_community'), false);
    assert.equal(shouldLogPushDeliveryIssue('sent_mini; error: code_901'), true);
    assert.equal(shouldLogPushDeliveryIssue('skipped_no_token'), false);
    assert.equal(shouldLogPushDeliveryIssue('error: denied'), true);
  });
});

describe('push audience / slot idempotency helpers', () => {
  it('filterUnsentParticipantIds skips already sent, keeps the rest', () => {
    const need = filterUnsentParticipantIds([1, 2, 3, 4], new Set([2, 4]));
    assert.deepEqual(need, [1, 3]);
  });

  it('filterUnsentParticipantIds returns all when none sent', () => {
    assert.deepEqual(filterUnsentParticipantIds([10, 20], new Set()), [10, 20]);
  });
});
