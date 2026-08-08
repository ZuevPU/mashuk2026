import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterEventsForLessonSlot, lessonThemeLeaves } from '../services/lessonSlotEvents.js';

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
  const question = {
    id: 10,
    title: 'Осмысление урока (слот 1)',
    dayNumber: 1,
  } as Parameters<typeof filterEventsForLessonSlot>[0];

  it('returns child themes instead of the parent program slot', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Открытые уроки',
        parentEventId: null,
        hasSubSessions: true,
        timeSlot: '16:00-18:00',
        dayNumber: 1,
        place: 'Корпус А',
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
        title: 'Другой блок',
        parentEventId: null,
        timeSlot: '10:00-11:00',
        dayNumber: 1,
        sortOrder: 1,
      },
    ];

    const picked = filterEventsForLessonSlot(question, dayEvents, { startDate });
    assert.deepEqual(picked.map(p => p.title), [
      'Как говорить со сложным классом',
      'Игровые механики на уроке',
    ]);
    assert.ok(!picked.some(p => p.title === 'Открытые уроки'));
  });

  it('keeps a standalone lesson session that overlaps the slot', () => {
    const dayEvents = [
      {
        id: 7,
        title: 'Урок о важном · без подтем',
        parentEventId: null,
        timeSlot: '16:30-17:30',
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
    const picked = filterEventsForLessonSlot(question, dayEvents, { startDate });
    assert.deepEqual(picked.map(p => p.id), [7]);
  });
});
