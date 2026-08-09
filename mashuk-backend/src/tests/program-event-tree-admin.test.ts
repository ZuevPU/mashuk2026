import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Mirrors mashuk-admin programEventTree.flattenProgramEvents for regression. */
function flattenProgramEvents(nodes: any[]): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    const { children, ...rest } = n;
    out.push(rest);
    if (Array.isArray(children)) children.forEach(walk);
  };
  for (const n of nodes || []) walk(n);
  return out;
}

describe('admin program event nest flatten', () => {
  it('flattens /events nested tree so subtopics keep parentEventId', () => {
    const nested = [{
      id: 1,
      title: 'Презентации педагогических практик',
      dayNumber: 1,
      parentEventId: null,
      children: [
        { id: 11, title: 'ИИ в классе', dayNumber: 1, parentEventId: 1, children: [] },
        { id: 12, title: 'Молчаливый учитель', dayNumber: 1, parentEventId: 1, children: [] },
      ],
    }];
    const flat = flattenProgramEvents(nested);
    assert.equal(flat.length, 3);
    assert.equal(flat.filter(e => e.parentEventId === 1).length, 2);
    assert.deepEqual(
      flat.filter(e => e.parentEventId === 1).map(e => e.title),
      ['ИИ в классе', 'Молчаливый учитель'],
    );
  });
});
