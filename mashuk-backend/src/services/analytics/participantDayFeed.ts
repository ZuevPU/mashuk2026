import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { piggybank } from '../../db/schema.js';
import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { entryTags } from '../piggybankDict.js';
import { collectEveningExportRows } from '../exports/eveningExportData.js';
import { resolveAdminShiftId } from '../shiftService.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { collectKindAnswerRows } from './questionKindDashboard.js';

function phaseOf(timePoint: string | null | undefined): 'morning' | 'day' | 'evening' | 'other' {
  const tp = (timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return 'other';
}

export type ParticipantDayFeedItem =
  | {
    kind: 'state_check';
    phase: 'morning' | 'day' | 'evening' | 'other';
    emotion: string | null;
    emotionZone: string | null;
    energy: number | null;
    answer: string;
    timePoint: string | null;
    questionTitle: string;
  }
  | {
    kind: 'reflection';
    answer: string;
    questionTitle: string;
    eventTitle: string | null;
    parentEventTitle: string | null;
  }
  | {
    kind: 'after_blocks';
    answer: string;
    questionTitle: string;
    eventTitle: string | null;
    parentEventTitle: string | null;
  }
  | {
    kind: 'evening';
    ratings: Record<string, unknown>;
    status: string;
    source: string;
  }
  | {
    kind: 'piggybank';
    text: string;
    tags: string[];
    source: string | null;
  };

/**
 * Посуточная лента «день из жизни» для линзы «Участник».
 * Собирает уже существующие коллекторы и бакетизирует по дням 1–8.
 */
export async function buildParticipantDayFeed(
  participantId: number,
  filters: AnalyticsFilters,
  req?: AdminRequest,
) {
  const shiftId = filters.shiftId ?? (req ? await resolveAdminShiftId(req) : null);
  const baseFilters: AnalyticsFilters = {
    ...filters,
    direction: null,
    group: null,
    day: null,
    mode: 'shift',
    shiftId: shiftId ?? filters.shiftId,
  };

  const [statePack, afterPack, eveningPack, piggyRows] = await Promise.all([
    collectKindAnswerRows('state_check', baseFilters),
    collectKindAnswerRows('after_blocks', baseFilters),
    collectEveningExportRows({
      participantId,
      shiftId: shiftId ?? undefined,
      includeDrafts: true,
    }),
    db.select().from(piggybank).where(and(
      eq(piggybank.participantId, participantId),
      isNull(piggybank.deletedAt),
    )),
  ]);

  const stateRows = statePack.rows.filter(r => r.participantId === participantId);
  const afterRows = afterPack.rows.filter(r => r.participantId === participantId);
  const eveningRows = eveningPack.rows;

  const days = Array.from({ length: 8 }, (_, i) => i + 1);
  const dayFilter = filters.day != null && filters.day >= 1 && filters.day <= 8
    ? [filters.day]
    : days;

  const feed = dayFilter.map(day => {
    const items: ParticipantDayFeedItem[] = [];

    for (const r of stateRows.filter(x => x.day === day)) {
      items.push({
        kind: 'state_check',
        phase: phaseOf(r.timePoint),
        emotion: r.emotion,
        emotionZone: r.emotionZone,
        energy: r.energy,
        answer: r.answer,
        timePoint: r.timePoint,
        questionTitle: r.questionTitle,
      });
    }

    for (const r of afterRows.filter(x => x.day === day)) {
      items.push({
        kind: 'after_blocks',
        answer: r.answer,
        questionTitle: r.questionTitle,
        eventTitle: r.eventTitle,
        parentEventTitle: r.parentEventTitle,
      });
    }

    for (const r of eveningRows.filter(x => x.dayNumber === day)) {
      items.push({
        kind: 'evening',
        ratings: r.ratings,
        status: r.status,
        source: r.source,
      });
    }

    for (const e of piggyRows.filter(x => (x.forumDay ?? 0) === day)) {
      items.push({
        kind: 'piggybank',
        text: e.text,
        tags: entryTags(e),
        source: e.source,
      });
    }

    const phaseOrder = { morning: 0, day: 1, evening: 2, other: 3 } as const;
    items.sort((a, b) => {
      if (a.kind === 'state_check' && b.kind === 'state_check') {
        return phaseOrder[a.phase] - phaseOrder[b.phase];
      }
      const order = { state_check: 0, after_blocks: 1, reflection: 2, evening: 3, piggybank: 4 } as const;
      return order[a.kind] - order[b.kind];
    });

    return { day, items, count: items.length };
  });

  return {
    participantId,
    filters: baseFilters,
    days: feed,
  };
}
