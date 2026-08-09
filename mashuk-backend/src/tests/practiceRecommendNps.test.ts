import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPracticeRecommendNps,
  extractPracticeScores,
} from '../services/analytics/practiceRecommendNps.js';

describe('practiceRecommendNps', () => {
  it('reads scores from program_event items under any field key', () => {
    const hits = extractPracticeScores({
      practiceYes: true,
      program_block: {
        items: [
          {
            eventId: 11,
            eventTitle: 'Скалолазание',
            parentEventTitle: 'Культурно-развивающая программа',
            score: 10,
          },
          {
            eventId: 12,
            eventTitle: 'Чайная церемония',
            parentEventTitle: 'Культурно-развивающая программа',
            score: 8,
          },
        ],
      },
    });
    assert.equal(hits.length, 2);
    assert.equal(hits[0].score, 10);
    assert.match(hits[0].practice, /Скалолазание/);
    assert.equal(hits[1].score, 8);
  });

  it('builds NPS table with score buckets', () => {
    const result = buildPracticeRecommendNps([
      {
        program_block: {
          items: [{
            eventId: 1,
            eventTitle: 'Йога',
            parentEventTitle: 'Утро',
            score: 10,
          }],
        },
      },
      {
        program_block: {
          items: [{
            eventId: 1,
            eventTitle: 'Йога',
            parentEventTitle: 'Утро',
            score: 6,
          }],
        },
      },
    ]);
    assert.equal(result.available, true);
    assert.equal(result.byPractice.length, 1);
    const row = result.byPractice[0];
    assert.equal(row.responses, 2);
    assert.equal(row.scores['10'], 1);
    assert.equal(row.scores['6'], 1);
    // 1 promoter, 1 detractor → NPS 0
    assert.equal(row.nps, 0);
  });

  it('supports legacy recommendScore + practiceEvent', () => {
    const hits = extractPracticeScores({
      recommendYes: true,
      recommendScore: 9,
      practiceEvent: {
        eventId: 5,
        eventTitle: 'Практика А',
        parentEventTitle: 'Блок',
      },
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].score, 9);
    assert.match(hits[0].practice, /Практика А/);
  });
});
