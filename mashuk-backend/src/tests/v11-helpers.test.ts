import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { getMoscowPhase, getTouchpointAccess, resolveEffectiveCurrentDay, getPreferredStateCheckPhase, stateCheckTimePointOrder } from '../services/timePhase.js';
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

describe('state check priority', () => {
  it('prefers morning before 13:00 MSK', () => {
    const d = new Date(Date.UTC(2026, 7, 12, 9, 0, 0)); // 12:00 MSK
    assert.equal(getPreferredStateCheckPhase(d), 'утро');
    assert.deepEqual(stateCheckTimePointOrder(d), ['утро', 'день', 'вечер']);
  });

  it('prefers day from 13:00 MSK', () => {
    const d = new Date(Date.UTC(2026, 7, 12, 10, 30, 0)); // 13:30 MSK
    assert.equal(getPreferredStateCheckPhase(d), 'день');
  });

  it('prefers evening from 18:00 MSK', () => {
    const d = new Date(Date.UTC(2026, 7, 12, 15, 0, 0)); // 18:00 MSK
    assert.equal(getPreferredStateCheckPhase(d), 'вечер');
  });

  it('uses night phase from 22:00 MSK', () => {
    const d = new Date(Date.UTC(2026, 7, 12, 19, 0, 0)); // 22:00 MSK
    assert.equal(getPreferredStateCheckPhase(d), 'ночь');
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

describe('home active card', () => {
  it('prefers program now in day phase', async () => {
    const { resolveHomeActiveCard } = await import('../services/homeActiveCard.js');
    const noon = new Date(Date.UTC(2026, 7, 12, 9, 0, 0)); // 12:00 MSK day phase
    const card = resolveHomeActiveCard({
      now: noon,
      eveningWrap: false,
      currentDay: 2,
      priorityAction: null,
      eveningCard: null,
      eveningQuestionnaire: { available: false, completed: false },
      schedule: [{ kind: 'now', title: 'Мастер-класс', time: '12:00', place: 'Зал' }],
      touchpointItems: [],
    });
    assert.equal(card?.kind, 'program_now');
  });

  it('lists parallel now blocks on home card', async () => {
    const { resolveHomeActiveCard } = await import('../services/homeActiveCard.js');
    const afternoon = new Date(Date.UTC(2026, 7, 12, 13, 45, 0)); // 16:45 MSK
    const card = resolveHomeActiveCard({
      now: afternoon,
      eveningWrap: false,
      currentDay: 2,
      priorityAction: null,
      eveningCard: null,
      eveningQuestionnaire: { available: false, completed: false },
      schedule: [
        { kind: 'now', title: 'Культурная программа', time: '14:00', place: 'Зал' },
        { kind: 'now', title: 'Консультации', time: '16:30', place: 'Кабинет' },
      ],
      touchpointItems: [],
    });
    assert.equal(card?.kind, 'program_now');
    assert.match(card?.tag || '', /параллельно/i);
    assert.match(card?.title || '', /Культурная программа/);
    assert.match(card?.title || '', /Консультации/);
  });
});

describe('piggybank dict', () => {
  it('aliases old tags and sources', () => {
    assert.equal(normalizePiggybankTag('забрать в работу'), 'в работу');
    assert.equal(normalizePiggybankSource('собственные размышления'), 'Своя мысль');
  });
});

describe('KB material isNew', () => {
  it('marks created within 24h as new', async () => {
    const { materialIsNew } = await import('../controllers/programController.js');
    const { materials } = await import('../db/schema.js');
    type MaterialRow = typeof materials.$inferSelect;
    const now = new Date('2026-08-12T12:00:00+03:00');
    const recent = { isNew: false, createdAt: new Date('2026-08-12T10:00:00+03:00') } as MaterialRow;
    const old = { isNew: false, createdAt: new Date('2026-08-10T10:00:00+03:00') } as MaterialRow;
    assert.equal(materialIsNew(recent, now), true);
    assert.equal(materialIsNew(old, now), false);
    assert.equal(materialIsNew({ ...recent, isNew: true, createdAt: null } as typeof recent, now), true);
  });
});
