import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectLessonSlotThemes,
  filterEventsForLessonSlot,
  lessonThemeLeaves,
} from '../services/lessonSlotEvents.js';

describe('lessonThemeLeaves', () => {
  it('returns the event itself when there are no children', () => {
    const byParent = new Map();
    const leaves = lessonThemeLeaves(
      { id: 1, title: 'Standalone', parentEventId: null },
      byParent,
    );
    assert.deepEqual(leaves.map(l => l.id), [1]);
  });

  it('expands nested containers to leaf themes', () => {
    const byParent = new Map<number, Array<{ id: number; title: string; parentEventId: number | null; sortOrder?: number }>>([
      [1, [
        { id: 2, title: 'Тема А', parentEventId: 1, sortOrder: 0 },
        { id: 3, title: 'Тема Б', parentEventId: 1, sortOrder: 1 },
      ]],
    ]);
    const leaves = lessonThemeLeaves(
      { id: 1, title: 'Открытые уроки', parentEventId: null },
      byParent,
    );
    assert.deepEqual(leaves.map(l => l.title), ['Тема А', 'Тема Б']);
  });
});

describe('filterEventsForLessonSlot', () => {
  const startDate = new Date('2026-08-10T00:00:00+03:00');
  /** После начала уроков 15:00 — темы считаются проведёнными. */
  const afterLessons = new Date('2026-08-10T16:00:00+03:00');
  const beforeLessons = new Date('2026-08-10T14:00:00+03:00');

  const slot1 = {
    id: 10,
    title: 'Осмысление урока (слот 1)',
    dayNumber: 1,
  } as Parameters<typeof filterEventsForLessonSlot>[0];
  const slot2 = {
    id: 11,
    title: 'Осмысление урока (слот 2)',
    dayNumber: 1,
  } as Parameters<typeof filterEventsForLessonSlot>[0];

  it('returns themes of «Уроки о важном» for slot 1 even if lesson is before reflection window', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Уроки о важном',
        parentEventId: null,
        hasSubSessions: true,
        timeSlot: '15:00-16:30',
        dayNumber: 1,
        place: 'Конференц-зал',
        sortOrder: 0,
      },
      {
        id: 2,
        title: 'Как говорить со сложным классом',
        parentEventId: 1,
        timeSlot: null,
        dayNumber: 1,
        place: 'Ауд. 1',
        sortOrder: 0,
      },
      {
        id: 3,
        title: 'Игровые механики на уроке',
        parentEventId: 1,
        timeSlot: null,
        dayNumber: 1,
        place: 'Ауд. 2',
        sortOrder: 1,
      },
      {
        id: 4,
        title: 'Открытые уроки',
        parentEventId: null,
        timeSlot: '18:30-20:00',
        dayNumber: 1,
        sortOrder: 2,
      },
      {
        id: 5,
        title: 'Практика А',
        parentEventId: 4,
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 6,
        title: 'Утренний круг',
        parentEventId: null,
        timeSlot: '09:00-10:00',
        dayNumber: 1,
        sortOrder: 3,
      },
    ];

    const picked = filterEventsForLessonSlot(slot1, dayEvents, { startDate }, afterLessons);
    assert.deepEqual(picked.map(p => p.title), [
      'Как говорить со сложным классом',
      'Игровые механики на уроке',
    ]);
    assert.ok(!picked.some(p => p.title === 'Уроки о важном'));
    assert.ok(!picked.some(p => p.title === 'Практика А'));
    assert.ok(!picked.some(p => p.title === 'Утренний круг'));
  });

  it('hides lessons that have not started yet', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Уроки о важном',
        parentEventId: null,
        timeSlot: '15:00-16:30',
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 2,
        title: 'Тема важного',
        parentEventId: 1,
        dayNumber: 1,
        sortOrder: 0,
      },
    ];
    const collected = collectLessonSlotThemes(slot1, dayEvents, { startDate }, beforeLessons);
    assert.equal(collected.programThemeCount, 1);
    assert.deepEqual(collected.items, []);
  });

  it('returns open-lesson themes for slot 2 when they already started', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Уроки о важном',
        parentEventId: null,
        timeSlot: '15:00-16:30',
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 2,
        title: 'Тема важного',
        parentEventId: 1,
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 4,
        title: 'Открытые уроки',
        parentEventId: null,
        timeSlot: '15:30-17:00',
        dayNumber: 1,
        sortOrder: 1,
      },
      {
        id: 5,
        title: 'Практика А',
        parentEventId: 4,
        dayNumber: 1,
        sortOrder: 0,
      },
    ];
    const picked = filterEventsForLessonSlot(slot2, dayEvents, { startDate }, afterLessons);
    assert.deepEqual(picked.map(p => p.title), ['Практика А']);
  });

  it('finds «Уроки о важном» nested under a key program block', () => {
    const dayEvents = [
      {
        id: 10,
        title: 'Дневная программа',
        parentEventId: null,
        timeSlot: '14:00-18:00',
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 1,
        title: 'Уроки о важном',
        parentEventId: 10,
        hasSubSessions: true,
        timeSlot: '15:00-16:30',
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 2,
        title: 'Тема 1',
        parentEventId: 1,
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 3,
        title: 'Тема 2',
        parentEventId: 1,
        dayNumber: 1,
        sortOrder: 1,
      },
    ];
    const picked = filterEventsForLessonSlot(slot1, dayEvents, { startDate }, afterLessons);
    assert.deepEqual(picked.map(p => p.title), ['Тема 1', 'Тема 2']);
  });

  it('keeps a standalone important lesson without children', () => {
    const dayEvents = [
      {
        id: 7,
        title: 'Урок о важном · без подтем',
        parentEventId: null,
        timeSlot: '15:00-16:00',
        dayNumber: 1,
        sortOrder: 0,
      },
      {
        id: 8,
        title: 'Мастерская без подтем',
        parentEventId: null,
        timeSlot: '16:30-17:30',
        dayNumber: 1,
        sortOrder: 1,
      },
    ];
    const picked = filterEventsForLessonSlot(slot1, dayEvents, { startDate }, afterLessons);
    assert.deepEqual(picked.map(p => p.id), [7]);
  });
});
