import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emotionIdToZone, EMOTION_ZONE_LABELS } from '../services/emotionZones.js';
import { lessonSlotIndexForQuestion } from '../services/lessonSlotEvents.js';

describe('emotionZones', () => {
  it('maps anxiety to risk zone', () => {
    assert.equal(emotionIdToZone('anxiety'), 'risk');
    assert.equal(EMOTION_ZONE_LABELS.risk, 'Риск');
  });

  it('maps joy to lift zone', () => {
    assert.equal(emotionIdToZone('joy'), 'lift');
  });
});

describe('lessonSlotIndexForQuestion', () => {
  it('detects slot 1 and 2 from title', () => {
    assert.equal(lessonSlotIndexForQuestion({ title: 'Осмысление урока (слот 1)' }), 4);
    assert.equal(lessonSlotIndexForQuestion({ title: 'Осмысление урока (слот 2)' }), 5);
  });
});
