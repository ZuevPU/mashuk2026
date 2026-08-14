import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import {
  getMoscowPhase,
  getTouchpointAccess,
  lateAnswerPolicyForQuestion,
  moscowAnswerDeadline,
  resolveEffectiveCurrentDay,
  getPreferredStateCheckPhase,
  stateCheckTimePointOrder,
} from '../services/timePhase.js';
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
  it('allows yesterday as overdue, locks older days', () => {
    assert.equal(getTouchpointAccess(2, 3, null), 'overdue');
    assert.equal(getTouchpointAccess(1, 3, null), 'locked');
    // state_check hard_close: нет досдачи на D−1
    assert.equal(
      getTouchpointAccess(2, 3, null, new Date(), null, 'hard_close'),
      'locked',
    );
  });

  it('locks when closeTime passed on current day', () => {
    const past = new Date(Date.now() - 3600000);
    assert.equal(getTouchpointAccess(3, 3, past), 'locked');
  });

  it('marks soon when publishTime in future', () => {
    const future = new Date(Date.now() + 3600000);
    assert.equal(getTouchpointAccess(3, 3, null, new Date(), future), 'soon');
  });

  it('hard-closes state checks after closeTime', () => {
    const past = new Date(Date.now() - 3600000);
    assert.equal(
      getTouchpointAccess(3, 3, past, new Date(), null, 'hard_close'),
      'locked',
    );
  });

  it('locks at closeTime even for until_midnight catch-up policy', () => {
    // close 12:00 MSK (= 09:00 UTC) on 2026-08-12
    const close = new Date(Date.UTC(2026, 7, 12, 9, 0, 0));
    const afterClose = new Date(Date.UTC(2026, 7, 12, 10, 0, 0)); // 13:00 MSK
    const afterMidnight = new Date(Date.UTC(2026, 7, 12, 21, 0, 0)); // 00:00 MSK next day
    assert.equal(
      getTouchpointAccess(3, 3, close, afterClose, null, 'until_midnight'),
      'locked',
    );
    assert.equal(
      getTouchpointAccess(3, 3, close, afterMidnight, null, 'until_midnight'),
      'locked',
    );
    assert.ok(moscowAnswerDeadline(close).getTime() === afterMidnight.getTime());
  });

  it('locks after_blocks / practices after closeTime; keeps until_admin only without closeTime', () => {
    const close = new Date(Date.UTC(2026, 7, 12, 9, 0, 0));
    const nextDay = new Date(Date.UTC(2026, 7, 13, 12, 0, 0));
    assert.equal(
      getTouchpointAccess(3, 5, close, nextDay, null, 'until_admin'),
      'locked',
    );
    assert.equal(
      getTouchpointAccess(3, 3, null, nextDay, null, 'until_admin'),
      'open',
    );
  });

  it('classifies late policies by block/type', () => {
    assert.equal(
      lateAnswerPolicyForQuestion({ type: 'checkin', block: 'Проверка состояния' }),
      'hard_close',
    );
    assert.equal(
      lateAnswerPolicyForQuestion({ type: 'open', block: 'Точки осмысления', title: 'Осмысление урока' }),
      'until_midnight',
    );
    assert.equal(
      lateAnswerPolicyForQuestion({ questionKind: 'after_blocks', title: 'После блоков' }),
      'until_midnight',
    );
    assert.equal(
      lateAnswerPolicyForQuestion({ questionKind: 'practices_vote' }),
      'until_admin',
    );
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

  it('shows program now in morning phase too', async () => {
    const { resolveHomeActiveCard } = await import('../services/homeActiveCard.js');
    const morning = new Date(Date.UTC(2026, 7, 12, 5, 0, 0)); // 08:00 MSK
    const card = resolveHomeActiveCard({
      now: morning,
      eveningWrap: false,
      currentDay: 2,
      priorityAction: { type: 'question', title: 'Точка', subtitle: 'Проверка состояния', route: '/questions?q=1' },
      eveningCard: null,
      eveningQuestionnaire: { available: false, completed: false },
      schedule: [{ kind: 'now', title: 'Утренний круг', time: '08:00', place: 'Площадка' }],
      touchpointItems: [],
    });
    assert.equal(card?.kind, 'program_now');
    assert.equal(card?.title, 'Утренний круг');
  });

  it('prefers forum wrap over live program', async () => {
    const { resolveHomeActiveCard } = await import('../services/homeActiveCard.js');
    const noon = new Date(Date.UTC(2026, 7, 12, 9, 0, 0));
    const card = resolveHomeActiveCard({
      now: noon,
      eveningWrap: false,
      currentDay: 7,
      priorityAction: null,
      eveningCard: null,
      eveningQuestionnaire: { available: false, completed: false },
      forumWrapQuestionnaire: { available: true, completed: false },
      schedule: [{ kind: 'now', title: 'Мастер-класс', time: '12:00', place: 'Зал' }],
      touchpointItems: [],
    });
    assert.equal(card?.kind, 'forum_wrap');
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
