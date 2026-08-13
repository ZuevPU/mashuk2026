import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shiftOpsToForumShape, pickParticipantForVk } from '../services/shiftService.js';

describe('shiftOpsToForumShape', () => {
  it('exposes currentDay and shiftId for participant API compat', () => {
    const shape = shiftOpsToForumShape({
      id: 7,
      code: 'shift1',
      name: 'Смена 1',
      status: 'active',
      isSandbox: false,
      isPublished: true,
      currentDay: 3,
      totalDays: 8,
      startDate: new Date('2026-08-12'),
      recommendationThreshold: 1,
      sectionsVisibility: {},
      groupAssignMode: 'list',
      kbUnlockThreshold: 4,
      kbUnlockDisabled: false,
      kbPastDaysPolicy: 'locked',
      pushBlockTypes: {},
      pushNightSlotEnabled: false,
      teamConfirmHoursDefault: 24,
      eveningQuestionnaireConfig: null,
      eveningQuestionnaireByDay: null,
      answerConfirmation: null,
      exchangeLimits: null,
      profileProgressWeights: null,
      shiftLabel: 'Смена 1',
      pdfTemplate: null,
      recommendationTemplates: null,
      programRecEmptyNoMatchText: null,
      programRecEmptyNoEventsText: null,
      roleDiagnosticsConfig: null,
      leaderboardScopes: null,
      createdAt: null,
      updatedAt: null,
    });
    assert.equal(shape.currentDay, 3);
    assert.equal(shape.shiftId, 7);
    assert.equal(shape.activeShiftId, 7);
    assert.equal(shape.totalDays, 8);
    assert.equal(shape.isPublished, true);
    assert.equal(shape.shiftLive, true);
  });

  it('marks unpublished draft as not live', () => {
    const shape = shiftOpsToForumShape({
      id: 8,
      code: 'aug16',
      name: 'Смена 16 августа',
      status: 'draft',
      isSandbox: false,
      isPublished: true,
      currentDay: 1,
      totalDays: 8,
      startDate: new Date('2026-08-16'),
      recommendationThreshold: 1,
      sectionsVisibility: {},
      groupAssignMode: 'list',
      kbUnlockThreshold: 4,
      kbUnlockDisabled: false,
      kbPastDaysPolicy: 'locked',
      pushBlockTypes: {},
      pushNightSlotEnabled: false,
      teamConfirmHoursDefault: 24,
      eveningQuestionnaireConfig: null,
      eveningQuestionnaireByDay: null,
      answerConfirmation: null,
      exchangeLimits: null,
      profileProgressWeights: null,
      shiftLabel: 'Смена 16 августа',
      pdfTemplate: null,
      recommendationTemplates: null,
      programRecEmptyNoMatchText: null,
      programRecEmptyNoEventsText: null,
      roleDiagnosticsConfig: null,
      leaderboardScopes: null,
      createdAt: null,
      updatedAt: null,
    });
    assert.equal(shape.isPublished, true);
    assert.equal(shape.shiftLive, false);
    assert.equal(shape.shiftStatus, 'draft');
  });
});

describe('pickParticipantForVk', () => {
  const row = (
    shiftId: number,
    opts: { onboarded?: boolean; last?: number; deleted?: boolean } = {},
  ) => ({
    shiftId,
    onboardingCompletedAt: opts.onboarded === false ? null : new Date(opts.last ?? 1),
    selfDeletedAt: opts.deleted ? new Date(2) : null,
    lastActiveAt: opts.last != null ? new Date(opts.last) : null,
  });

  it('returns null without enrollments', () => {
    assert.equal(pickParticipantForVk([], 1), null);
  });

  it('uses preferred shift when header is present and strict', () => {
    const rows = [row(1, { last: 100 }), row(2, { last: 200 })];
    const picked = pickParticipantForVk(rows, 1, { fallback: false });
    assert.equal(picked?.shiftId, 1);
  });

  it('does not fall back when preferred shift has no row', () => {
    const rows = [row(1, { last: 100 })];
    assert.equal(pickParticipantForVk(rows, 9, { fallback: false }), null);
  });

  it('falls back to latest activity when no preferred shift', () => {
    const rows = [row(1, { last: 100 }), row(2, { last: 500 })];
    assert.equal(pickParticipantForVk(rows, null)?.shiftId, 2);
  });
});
