import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectEveningProgramPickTree } from '../services/eveningProgramPickTree.js';
import type { LessonPickEvent } from '../services/lessonSlotEvents.js';

describe('collectEveningProgramPickTree', () => {
  it('returns large block with all sub-blocks (not only conducted)', () => {
    const dayEvents: LessonPickEvent[] = [
      {
        id: 1,
        title: 'Презентации педагогических практик',
        parentEventId: null,
        blockType: 'session',
        sortOrder: 1,
        startTime: new Date('2026-08-09T13:30:00.000Z'),
        endTime: new Date('2026-08-09T15:00:00.000Z'),
      },
      { id: 11, title: 'ИИ в классе', parentEventId: 1, blockType: 'topic', sortOrder: 1 },
      { id: 12, title: 'Молчаливый учитель', parentEventId: 1, blockType: 'topic', sortOrder: 2 },
      { id: 13, title: 'Словесное творчество', parentEventId: 1, blockType: 'topic', sortOrder: 3 },
      {
        id: 2,
        title: 'Перерыв',
        parentEventId: null,
        blockType: 'break',
        sortOrder: 2,
      },
    ];
    const { events, programBlockCount } = collectEveningProgramPickTree(dayEvents, null);
    assert.equal(programBlockCount, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Презентации педагогических практик');
    assert.equal(events[0].children.length, 3);
    assert.deepEqual(events[0].children.map(c => c.title), [
      'ИИ в классе',
      'Молчаливый учитель',
      'Словесное творчество',
    ]);
  });

  it('keeps nested grandchildren under sub-blocks', () => {
    const dayEvents: LessonPickEvent[] = [
      { id: 1, title: 'Блок', parentEventId: null, sortOrder: 1 },
      { id: 2, title: 'Подблок', parentEventId: 1, sortOrder: 1 },
      { id: 3, title: 'Тема', parentEventId: 2, sortOrder: 1 },
    ];
    const { events } = collectEveningProgramPickTree(dayEvents, [1]);
    assert.equal(events[0].children[0].title, 'Подблок');
    assert.equal(events[0].children[0].children[0].title, 'Тема');
  });
});
