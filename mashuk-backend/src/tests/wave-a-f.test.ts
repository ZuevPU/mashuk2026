import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchPushSlot, matchRetrySlot, PUSH_SLOTS } from '../services/pushScheduler.js';
import { allowAutoContentPush, isAdminQueuedPush, isManualAdminPushTrigger, allowOutgoingPush } from '../services/broadcastPushPolicy.js';
import { pushCategoryOf } from '../services/pushService.js';
import { roleCan } from '../utils/adminToken.js';
import { generateQrToken } from '../services/qrService.js';
import { isGigachatConfigured, tokenVector, cosineSimilarity } from '../services/gigachatService.js';
import { parseEventAttendanceRef } from '../services/eventAttendanceService.js';

describe('broadcastPushPolicy', () => {
  it('keeps content broadcasts manual-only', () => {
    assert.equal(allowAutoContentPush(), false);
    assert.equal(isAdminQueuedPush(null), false);
    assert.equal(isAdminQueuedPush(0), false);
    assert.equal(isAdminQueuedPush(12), true);
    assert.equal(isManualAdminPushTrigger('question_notify_12'), true);
    assert.equal(isManualAdminPushTrigger('task_notify_5'), true);
    assert.equal(isManualAdminPushTrigger('admin_campaign_3_reminder'), true);
    assert.equal(isManualAdminPushTrigger('evening_questionnaire_notify_d2'), true);
    assert.equal(allowOutgoingPush('touchpoint_open_12'), false);
    assert.equal(allowOutgoingPush('auto_slot_0800'), false);
    assert.equal(allowOutgoingPush('transactional_task_approved'), false);
    assert.equal(allowOutgoingPush('transactional_medal'), false);
    assert.equal(allowOutgoingPush('event_reminder_1'), false);
    assert.equal(allowOutgoingPush('team_confirm_9'), false);
  });
});

describe('pushScheduler slots', () => {
  it('matches 08:00 and retry +30', () => {
    assert.equal(matchPushSlot(8 * 60)?.key, 'slot_0800');
    assert.equal(matchRetrySlot(8 * 60 + 30)?.key, 'slot_0800');
    assert.ok(PUSH_SLOTS.length >= 5);
  });

  it('matches 22:00 finale', () => {
    assert.equal(matchPushSlot(22 * 60)?.key, 'slot_2200');
  });
});

describe('pushCategoryOf', () => {
  it('maps scheduled slot triggers to touchpoints', () => {
    assert.equal(pushCategoryOf('auto_slot_0800'), 'touchpoints');
    assert.equal(pushCategoryOf('auto_retry_slot_0800'), 'touchpoints');
    assert.equal(pushCategoryOf('touchpoint_open_42'), 'touchpoints');
  });

  it('maps question_publish to touchpoints (opt-out «точки»)', () => {
    assert.equal(pushCategoryOf('question_publish'), 'touchpoints');
  });

  it('maps transactional triggers', () => {
    assert.equal(pushCategoryOf('transactional_medal'), 'tasks');
    assert.equal(pushCategoryOf('transactional_level_up'), 'tasks');
    assert.equal(pushCategoryOf('transactional_task_pending_1'), 'tasks');
    assert.equal(pushCategoryOf('transactional_exchange_answer_received'), 'exchange');
    assert.equal(pushCategoryOf('event_reminder_1'), 'program');
  });
});

describe('admin role matrix', () => {
  it('superadmin can all', () => {
    assert.equal(roleCan('superadmin', 'delete'), true);
  });
  it('admin can all', () => {
    assert.equal(roleCan('admin', 'delete'), true);
    assert.equal(roleCan('admin', 'users'), true);
  });
  it('moderator can moderate only', () => {
    assert.equal(roleCan('moderator', 'moderate'), true);
    assert.equal(roleCan('moderator', 'delete'), false);
  });
  it('analyst can export', () => {
    assert.equal(roleCan('analyst', 'export'), true);
    assert.equal(roleCan('analyst', 'settings'), false);
    assert.equal(roleCan('gamification', 'export'), true);
    assert.equal(roleCan('gamification', 'settings'), false);
  });
});

describe('qr and heuristics', () => {
  it('generates legacy qr token', () => {
    assert.equal(generateQrToken().length, 32);
  });
  it('LLM client permanently disabled', () => {
    assert.equal(isGigachatConfigured(), false);
  });
  it('parses event attendance ref', () => {
    const token = 'a'.repeat(32);
    const parsed = parseEventAttendanceRef(`event_42_${token}`);
    assert.equal(parsed?.eventId, 42);
    assert.equal(parsed?.qrToken, token);
  });
  it('token vector cosine self-similarity', () => {
    const v = tokenVector('образование школа');
    assert.ok(cosineSimilarity(v, v) > 0.99);
  });
});
