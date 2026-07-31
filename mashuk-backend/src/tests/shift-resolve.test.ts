import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shiftOpsToForumShape } from '../services/shiftService.js';

describe('shiftOpsToForumShape', () => {
  it('exposes currentDay and shiftId for participant API compat', () => {
    const shape = shiftOpsToForumShape({
      id: 7,
      code: 'shift1',
      name: 'Смена 1',
      status: 'active',
      isSandbox: false,
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
  });
});
