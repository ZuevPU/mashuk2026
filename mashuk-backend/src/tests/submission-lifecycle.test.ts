import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveLifecycleStage,
  enrichSubmissionRow,
  inferProofType,
  inferVerificationType,
  lifecycleChainProgress,
  submissionCreatePatch,
} from '../services/submissionLifecycle.js';

const baseTask = {
  confirmationMethods: ['photo'] as string[],
  confirmationType: 'text_photo',
  autoConfirm: true,
  scopeType: 'individual',
};

describe('inferProofType', () => {
  it('detects qr token', () => {
    assert.equal(inferProofType(baseTask, { qrToken: 'x' }), 'qr');
  });

  it('detects post url', () => {
    assert.equal(inferProofType({ ...baseTask, confirmationMethods: ['link'] }, { postUrl: 'https://vk.com/w' }), 'post');
  });

  it('detects volunteer', () => {
    assert.equal(inferProofType(baseTask, { volunteer: true }), 'volunteer');
  });
});

describe('inferVerificationType', () => {
  it('team confirm for team flow', () => {
    assert.equal(inferVerificationType({ isTeam: true, forceAuto: false }), 'team_confirm');
  });

  it('auto for qr auto', () => {
    assert.equal(inferVerificationType({ isTeam: false, forceAuto: true }), 'auto');
  });

  it('volunteer path', () => {
    assert.equal(inferVerificationType({ isTeam: false, forceAuto: false, via: 'volunteer' }), 'manual_volunteer');
  });
});

describe('deriveLifecycleStage', () => {
  it('uses stored lifecycle when valid', () => {
    assert.equal(deriveLifecycleStage({ status: 'approved', lifecycleStage: 'medal_awarded' }), 'medal_awarded');
  });

  it('derives awaiting_confirm from pending', () => {
    assert.equal(deriveLifecycleStage({ status: 'pending' }), 'awaiting_confirm');
  });

  it('derives points_awarded from log id', () => {
    assert.equal(deriveLifecycleStage({
      status: 'approved',
      pointsLogId: 42,
      pointsAwarded: 10,
    }), 'points_awarded');
  });
});

describe('lifecycleChainProgress', () => {
  it('marks current and done steps', () => {
    const { chain } = lifecycleChainProgress('points_awarded');
    const confirmed = chain.find(s => s.key === 'confirmed');
    const points = chain.find(s => s.key === 'points_awarded');
    assert.equal(confirmed?.done, true);
    assert.equal(points?.current, true);
  });
});

describe('submissionCreatePatch', () => {
  it('sets awaiting_confirm for pending team', () => {
    const patch = submissionCreatePatch({
      task: { ...baseTask, confirmationMethods: ['team'], confirmationType: 'team' },
      payload: { teamMemberIds: [2] },
      status: 'pending_team',
      isTeam: true,
      forceAuto: false,
    });
    assert.equal(patch.lifecycleStage, 'awaiting_confirm');
    assert.equal(patch.verificationType, 'team_confirm');
  });
});

describe('enrichSubmissionRow', () => {
  it('adds labels and chain', () => {
    const row = enrichSubmissionRow({
      id: 1,
      status: 'pending',
      proofType: 'photo',
      verificationType: 'manual_moderator',
    });
    assert.equal(row.lifecycleStage, 'awaiting_confirm');
    assert.equal(row.proofTypeLabel, 'Фото');
    assert.equal(row.verificationTypeLabel, 'Модератор');
    assert.ok(Array.isArray(row.lifecycleChain));
  });
});
