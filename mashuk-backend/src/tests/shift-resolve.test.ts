import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shiftOpsToForumShape,
  pickParticipantForVk,
  pickLiveShifts,
  resolveRegistrationRoute,
} from '../services/shiftService.js';

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
      forumWrapQuestionnaireConfig: null,
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
      forumWrapQuestionnaireConfig: null,
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

describe('resolveRegistrationRoute', () => {
  const published = [
    { id: 10, code: 'shift1', name: 'Смена 1' },
    { id: 20, code: 'shift2', name: 'Смена 2' },
  ];

  it('sends shift-1 alumni into shift 1', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 10, onboardingCompleted: true },
    ]);
    assert.deepEqual(route, { action: 'enter', shiftId: 10 });
  });

  it('starts shift-2 registration when vk id is new', () => {
    const route = resolveRegistrationRoute(published, []);
    assert.deepEqual(route, { action: 'register', shiftId: 20 });
  });

  it('resumes shift-1 registration when an incomplete shift-1 row exists', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 10, onboardingCompleted: false },
    ]);
    assert.deepEqual(route, { action: 'register', shiftId: 10 });
  });

  it('asks copied shift-1 alumni to choose a shift', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 10, onboardingCompleted: true },
      { shiftId: 20, onboardingCompleted: false },
    ]);
    assert.deepEqual(route, { action: 'choose', shiftId: null });
  });

  it('honors explicit switch from shift 2 to shift 1 without a profile', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 20, onboardingCompleted: true },
    ], 10);
    assert.deepEqual(route, { action: 'register', shiftId: 10 });
  });

  it('enters preferred shift when that profile already exists', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 10, onboardingCompleted: true },
      { shiftId: 20, onboardingCompleted: true },
    ], 10);
    assert.deepEqual(route, { action: 'enter', shiftId: 10 });
  });

  it('stays on preferred shift 2 even for shift-1 alumni', () => {
    const route = resolveRegistrationRoute(published, [
      { shiftId: 10, onboardingCompleted: true },
      { shiftId: 20, onboardingCompleted: true },
    ], 20);
    assert.deepEqual(route, { action: 'enter', shiftId: 20 });
  });

  it('ignores preferred id that is not published', () => {
    const route = resolveRegistrationRoute(published, [], 99);
    assert.deepEqual(route, { action: 'register', shiftId: 20 });
  });
});

describe('live shifts for push planner', () => {
  it('includes every active non-sandbox shift', () => {
    const live = pickLiveShifts([
      { status: 'active', isSandbox: false, id: 1 },
      { status: 'active', isSandbox: false, id: 2 },
      { status: 'draft', isSandbox: false, id: 3 },
      { status: 'active', isSandbox: true, id: 4 },
    ]);
    assert.deepEqual(live.map(s => s.id), [1, 2]);
  });
});
