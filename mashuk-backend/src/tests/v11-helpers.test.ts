import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { getMoscowPhase, getTouchpointAccess, resolveEffectiveCurrentDay } from '../services/timePhase.js';
import { normalizePiggybankTag, normalizePiggybankSource } from '../services/piggybankDict.js';

describe('reflectionDepth v1', () => {
  it('marks short text as fixation', () => {
    assert.equal(inferReflectionDepth('было ок'), 'Фиксация события');
  });

  it('marks practice transfer', () => {
    assert.equal(
      inferReflectionDepth('Я попробую это в классе на уроке с учениками завтра'),
      'Перенос в практику',
    );
  });

  it('marks personal insight', () => {
    assert.equal(
      inferReflectionDepth('Я понял для себя что мне важно держать смысл и не торопиться с выводами каждый день'),
      'Личный вывод',
    );
  });
});

describe('moscow phase', () => {
  it('classifies morning before 09:30 MSK', () => {
    // 06:00 UTC = 09:00 MSK
    const d = new Date(Date.UTC(2026, 7, 12, 6, 0, 0));
    assert.equal(getMoscowPhase(d), 'morning');
  });

  it('classifies day after 09:30 MSK', () => {
    // 06:30 UTC = 09:30 MSK
    const d = new Date(Date.UTC(2026, 7, 12, 6, 30, 0));
    assert.equal(getMoscowPhase(d), 'day');
  });
});

describe('touchpoint access', () => {
  it('locks past forum days', () => {
    assert.equal(getTouchpointAccess(2, 3, null), 'locked');
  });

  it('marks overdue when closeTime passed on current day', () => {
    const past = new Date(Date.now() - 3600000);
    assert.equal(getTouchpointAccess(3, 3, past), 'overdue');
  });

  it('marks soon when publishTime in future', () => {
    const future = new Date(Date.now() + 3600000);
    assert.equal(getTouchpointAccess(3, 3, null, new Date(), future), 'soon');
  });
});

describe('effective current day', () => {
  it('uses calendar day when ahead of admin', () => {
    const start = new Date('2026-08-12T00:00:00+03:00');
    // day 3 calendar: 2026-08-14
    const now = new Date('2026-08-14T12:00:00+03:00');
    assert.equal(resolveEffectiveCurrentDay({ currentDay: 1, totalDays: 8, startDate: start }, now), 3);
  });
});

describe('piggybank dict', () => {
  it('aliases old tags and sources', () => {
    assert.equal(normalizePiggybankTag('забрать в работу'), 'в работу');
    assert.equal(normalizePiggybankSource('собственные размышления'), 'Своя мысль');
  });
});
