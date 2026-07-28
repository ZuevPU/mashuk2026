import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_ROW_HEADERS, buildAnswerRow, fullName } from '../services/exports/exportCommon.js';
import {
  normalizeExportTouchpointFilter,
  questionMatchesExportFilter,
  touchpointTypeForQuestion,
} from '../services/exports/touchpointFilter.js';
import { getExportMetaPayload, resolveColumnLabels } from '../services/exports/exportMeta.js';

describe('export touchpointFilter', () => {
  it('normalizeExportTouchpointFilter maps legacy lessons', () => {
    assert.equal(normalizeExportTouchpointFilter('lessons'), 'lesson_important');
    assert.equal(normalizeExportTouchpointFilter('lesson_open'), 'lesson_open');
    assert.equal(normalizeExportTouchpointFilter(undefined), 'all');
  });

  it('questionMatchesExportFilter respects filter', () => {
    const q = {
      id: 1,
      block: 'урок',
      title: 'После урока',
      text: 't',
      dayNumber: 1,
      status: 'published',
    } as Parameters<typeof touchpointTypeForQuestion>[0];
    assert.equal(questionMatchesExportFilter(q, 'all'), true);
    assert.equal(questionMatchesExportFilter(q, 'lesson_important'), true);
    assert.equal(questionMatchesExportFilter(q, 'checkin'), false);
  });
});

describe('exportMeta', () => {
  it('getExportMetaPayload lists sources and cross fields', () => {
    const p = getExportMetaPayload();
    assert.ok(p.sources.length >= 5);
    assert.ok(p.crossFields.length >= 8);
  });

  it('resolveColumnLabels maps keys', () => {
    const cols = resolveColumnLabels('answers', ['full_name', 'answer']);
    assert.equal(cols[0].label, 'ФИО');
  });
});

describe('exportCommon', () => {
  it('ANSWER_ROW_HEADERS covers TZ cross-cutting fields', () => {
    assert.ok(ANSWER_ROW_HEADERS.length >= 11);
    assert.ok(ANSWER_ROW_HEADERS.includes('full_name'));
    assert.ok(ANSWER_ROW_HEADERS.includes('source'));
  });

  it('buildAnswerRow returns aligned columns', () => {
    const row = buildAnswerRow({
      a: {
        id: 1,
        participantId: 2,
        questionId: 3,
        answerData: 'hello',
        pointsAwarded: 5,
        createdAt: new Date('2026-01-01'),
      } as never,
      p: { id: 2, firstName: 'A', lastName: 'B', direction: 'd', groupName: 'g' } as never,
      q: { id: 3, dayNumber: 1, text: 'Q?', title: 'T', block: '', status: 'published' } as never,
    }, { source: 'question' });
    assert.equal(row.length, ANSWER_ROW_HEADERS.length);
    assert.equal(fullName({ firstName: 'A', lastName: 'B' }), 'A B');
    assert.equal(row[0], 2);
    assert.equal(row[row.length - 1], 'question');
  });
});
