import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectAfterBlocksTree } from '../services/afterBlocksEvents.js';

describe('collectAfterBlocksTree', () => {
  const startDate = new Date('2026-08-01T00:00:00+03:00');
  const settings = { startDate };

  it('builds event → subtopics from linked parallel roots', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Уроки о важном',
        parentEventId: null,
        sortOrder: 0,
        timeSlot: '11:00-12:00',
        dayNumber: 1,
      },
      {
        id: 2,
        title: 'Тема А',
        parentEventId: 1,
        sortOrder: 0,
        timeSlot: '11:00-11:30',
        dayNumber: 1,
      },
      {
        id: 3,
        title: 'Тема Б',
        parentEventId: 1,
        sortOrder: 1,
        timeSlot: '11:30-12:00',
        dayNumber: 1,
      },
      {
        id: 10,
        title: 'Практики',
        parentEventId: null,
        sortOrder: 1,
        timeSlot: '11:00-12:00',
        dayNumber: 1,
      },
      {
        id: 11,
        title: 'Практика 1',
        parentEventId: 10,
        sortOrder: 0,
        timeSlot: '11:00-12:00',
        dayNumber: 1,
      },
    ];

    const afterBoth = new Date('2026-08-01T13:00:00+03:00');
    const tree = collectAfterBlocksTree(dayEvents, [1, 10], settings, afterBoth);

    assert.equal(tree.programBlockCount, 2);
    assert.equal(tree.events.length, 2);
    assert.equal(tree.events[0].title, 'Уроки о важном');
    assert.deepEqual(tree.events[0].children.map(c => c.title), ['Тема А', 'Тема Б']);
    assert.equal(tree.events[1].title, 'Практики');
    assert.deepEqual(tree.events[1].children.map(c => c.title), ['Практика 1']);
    assert.deepEqual(tree.allowedLeafIds.slice().sort((a, b) => a - b), [2, 3, 11]);
  });

  it('hides blocks until at least one subtopic has started', () => {
    const dayEvents = [
      {
        id: 1,
        title: 'Уроки',
        parentEventId: null,
        timeSlot: '15:00-16:00',
        dayNumber: 1,
      },
      {
        id: 2,
        title: 'Тема',
        parentEventId: 1,
        timeSlot: '15:00-16:00',
        dayNumber: 1,
      },
    ];
    const before = new Date('2026-08-01T14:00:00+03:00');
    const tree = collectAfterBlocksTree(dayEvents, [1], settings, before);
    assert.equal(tree.programBlockCount, 1);
    assert.equal(tree.events.length, 0);
  });

  it('uses top-level day events when nothing linked', () => {
    const dayEvents = [
      {
        id: 5,
        title: 'Блок без детей',
        parentEventId: null,
        timeSlot: '11:00-12:00',
        dayNumber: 1,
      },
    ];
    const tree = collectAfterBlocksTree(
      dayEvents,
      [],
      settings,
      new Date('2026-08-01T13:00:00+03:00'),
    );
    assert.equal(tree.events.length, 1);
    assert.equal(tree.events[0].children.length, 0);
    assert.deepEqual(tree.allowedLeafIds, [5]);
  });
});
