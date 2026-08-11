import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_ROW_HEADERS, buildAnswerRow, formatTsMsk, fullName } from '../services/exports/exportCommon.js';
import { resolveEveningFilledAt } from '../services/exports/eveningExportData.js';
import {
  normalizeExportTouchpointFilter,
  questionMatchesExportFilter,
  touchpointTypeForQuestion,
} from '../services/exports/touchpointFilter.js';
import { getExportMetaPayload, resolveColumnLabels } from '../services/exports/exportMeta.js';
import {
  deriveDayActivityFlags,
  getWideColumnsForParams,
  PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS,
} from '../services/exports/participantActivityWide.js';
import { HEAVY_EXPORT_SOURCES, STUCK_PENDING_MS, STUCK_PENDING_MS_HEAVY } from '../services/exports/customExportService.js';
import { computeMeasureDate, computeShiftEndDate } from '../services/exports/delayedMeasureService.js';

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
    assert.ok(p.sources.some(s => s.id === 'participant_activity_wide'));
  });

  it('resolveColumnLabels maps keys', () => {
    const cols = resolveColumnLabels('answers', ['full_name', 'answer']);
    assert.equal(cols[0].label, 'ФИО');
  });

  it('resolveColumnLabels for wide source', () => {
    const cols = resolveColumnLabels('participant_activity_wide', ['checkin_done', 'full_name']);
    assert.equal(cols[0].label, 'Check-in сдан (0/1)');
    assert.equal(cols[1].label, 'ФИО');
  });
});

describe('participantActivityWide', () => {
  it('day columns include identity and activity flags', () => {
    const keys = PARTICIPANT_ACTIVITY_WIDE_DAY_COLUMNS.map(c => c.key);
    for (const k of ['id', 'full_name', 'checkin_done', 'evening_done', 'tasks_submitted_count', 'day_points']) {
      assert.ok(keys.includes(k), `missing ${k}`);
    }
  });

  it('getWideColumnsForParams switches day vs shift', () => {
    const dayCols = getWideColumnsForParams({ day: 2 });
    const shiftCols = getWideColumnsForParams({});
    assert.ok(dayCols.some(c => c.key === 'forum_day'));
    assert.ok(shiftCols.some(c => c.key === 'checkin_d1'));
    assert.ok(!dayCols.some(c => c.key === 'checkin_d1'));
  });

  it('deriveDayActivityFlags maps counts to 0/1', () => {
    const flags = deriveDayActivityFlags({
      checkin: 2,
      direction: 0,
      lesson_important: 1,
      lesson_open: 0,
      hasEvening: true,
    });
    assert.equal(flags.checkin_done, 1);
    assert.equal(flags.checkin_count, 2);
    assert.equal(flags.direction_done, 0);
    assert.equal(flags.lesson_important_done, 1);
    assert.equal(flags.evening_done, 1);
  });
});

describe('export history TTL helpers', () => {
  it('STUCK_PENDING_MS is 15 minutes', () => {
    assert.equal(STUCK_PENDING_MS, 15 * 60 * 1000);
  });

  it('heavy job timeout is 90 minutes', () => {
    assert.equal(STUCK_PENDING_MS_HEAVY, 90 * 60 * 1000);
    assert.ok(HEAVY_EXPORT_SOURCES.has('participants_archive'));
    assert.ok(HEAVY_EXPORT_SOURCES.has('final_profiles_zip'));
    assert.ok(HEAVY_EXPORT_SOURCES.has('shift_summary_pdf'));
  });
});

describe('delayedMeasureService', () => {
  it('computeShiftEndDate uses start + totalDays-1', () => {
    const end = computeShiftEndDate(new Date('2026-07-01T00:00:00Z'), 8);
    assert.ok(end);
    assert.equal(end!.toISOString().slice(0, 10), '2026-07-08');
  });

  it('computeMeasureDate adds 7 weeks after shift end', () => {
    const m = computeMeasureDate(new Date('2026-07-01T00:00:00Z'), 8, 7);
    assert.equal(m.toISOString().slice(0, 10), '2026-08-26');
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

describe('evening export time', () => {
  it('formatTsMsk shows Moscow wall clock', () => {
    // 12:00 UTC = 15:00 MSK
    assert.equal(formatTsMsk('2026-08-10T12:00:00.000Z'), '10.08.2026 15:00:00 МСК');
  });

  it('resolveEveningFilledAt prefers stamped submit time over updatedAt', () => {
    const stamped = resolveEveningFilledAt(
      { _submittedAt: '2026-08-10T14:40:00.000Z', energy: 4 },
      [new Date('2026-08-10T10:00:00.000Z')],
    );
    assert.equal(stamped?.toISOString(), '2026-08-10T14:40:00.000Z');
  });
});
