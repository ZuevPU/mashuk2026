import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countValidInterests,
  isSecondShift,
  needsShift2InterestsReselection,
} from '../services/shift2InterestsGate.js';

const allowed = new Set(['медиа', 'спорт', 'школа']);

describe('shift2 interests reselect gate', () => {
  it('detects shift 2 by code or name', () => {
    assert.equal(isSecondShift({ code: 'shift2', name: 'Август' }), true);
    assert.equal(isSecondShift({ code: 'shift1', name: 'Смена 2' }), true);
    assert.equal(isSecondShift({ code: 'shift1', name: 'Смена 1' }), false);
  });

  it('does not gate first-time users without onboarding', () => {
    assert.equal(needsShift2InterestsReselection({
      onboardingCompleted: false,
      shift: { code: 'shift2', name: 'Смена 2' },
      interestsReselectedAt: null,
      interests: [],
      interestMin: 5,
      allowedTags: allowed,
    }), false);
  });

  it('does not gate shift 1', () => {
    assert.equal(needsShift2InterestsReselection({
      onboardingCompleted: true,
      shift: { code: 'shift1', name: 'Смена 1' },
      interestsReselectedAt: null,
      interests: [],
      interestMin: 5,
      allowedTags: allowed,
    }), false);
  });

  it('asks returning shift-2 users without enough valid interests', () => {
    assert.equal(needsShift2InterestsReselection({
      onboardingCompleted: true,
      shift: { code: 'shift2', name: 'Смена 2' },
      interestsReselectedAt: null,
      interests: ['медиа'],
      interestMin: 5,
      allowedTags: allowed,
    }), true);
  });

  it('asks returning shift-2 users once even if they already have interests', () => {
    assert.equal(needsShift2InterestsReselection({
      onboardingCompleted: true,
      shift: { code: 'shift2', name: 'Смена 2' },
      interestsReselectedAt: null,
      interests: ['медиа', 'спорт', 'школа', 'медиа', 'школа'],
      interestMin: 3,
      allowedTags: allowed,
    }), true);
  });

  it('skips after they saved the reselect', () => {
    assert.equal(needsShift2InterestsReselection({
      onboardingCompleted: true,
      shift: { code: 'shift2', name: 'Смена 2' },
      interestsReselectedAt: new Date(),
      interests: ['медиа', 'спорт', 'школа'],
      interestMin: 3,
      allowedTags: allowed,
    }), false);
  });

  it('counts only catalog tags', () => {
    assert.equal(countValidInterests(['медиа', 'старый тег', 'спорт'], allowed), 2);
  });
});
