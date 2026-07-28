import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeDeliveryStatus,
  isPushDeliveredOk,
  shouldLogPushDeliveryIssue,
} from '../services/pushDeliveryStatus.js';

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
    const hint = describeDeliveryStatus('error: foo; error: bar');
    assert.match(hint, /→/);
  });

  it('isPushDeliveredOk and shouldLogPushDeliveryIssue', () => {
    assert.equal(isPushDeliveredOk('sent_mini'), true);
    assert.equal(shouldLogPushDeliveryIssue('sent_mini'), false);
    assert.equal(shouldLogPushDeliveryIssue('skipped_no_token'), false);
    assert.equal(shouldLogPushDeliveryIssue('error: denied'), true);
  });
});
