import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db/index.js';
import { participantDayState, participants } from '../../db/schema.js';
import { EVENING_SCALE_KEYS } from '../touchpointTemplates.js';
import { matchesAgeCategory, matchesActivity } from '../analytics/cohortFilters.js';
import { addReadmeSheet, fullName, formatTs } from './exportCommon.js';
import { createWorkbook, sendWorkbook } from './workbook.js';

const EVENING_CONDITIONAL_KEYS = [
  'tripYes', 'tripScore', 'practiceYes', 'practiceName', 'recommendYes', 'recommendScore',
] as const;

type Filters = {
  day?: number | null;
  direction?: string;
  group?: string;
  ageMin?: number;
  ageMax?: number;
  ageCategory?: string;
  activityQ?: string;
};

export async function writeDailySummaryExport(res: Response, filters: Filters): Promise<void> {
  const rows = await db.select({ s: participantDayState, p: participants })
    .from(participantDayState)
    .leftJoin(participants, eq(participantDayState.participantId, participants.id));

  let filtered = rows.filter(r => r.s.eveningRatings != null);
  if (filters.day) filtered = filtered.filter(r => r.s.dayNumber === filters.day);
  if (filters.direction) filtered = filtered.filter(r => r.p?.direction === filters.direction);
  if (filters.group) filtered = filtered.filter(r => r.p?.groupName === filters.group);
  if (filters.ageCategory) {
    filtered = filtered.filter(r => matchesAgeCategory(r.p?.age, filters.ageCategory!));
  } else {
    if (filters.ageMin != null) filtered = filtered.filter(r => (r.p?.age ?? 0) >= filters.ageMin!);
    if (filters.ageMax != null) filtered = filtered.filter(r => (r.p?.age ?? 999) <= filters.ageMax!);
  }
  if (filters.activityQ) {
    filtered = filtered.filter(r => matchesActivity(r.p?.position, filters.activityQ!));
  }

  const wb = await createWorkbook();
  addReadmeSheet(wb, [
    'Итоги дня: одна строка = участник × день (сданная итоговая анкета).',
    'Включает 9 шкал, условные поля (выезд/практика/NPS) и открытые ответы.',
  ]);
  const ws = wb.addWorksheet('Итоги дня');
  ws.addRow([
    'participant_id', 'full_name', 'direction', 'group_name', 'day', 'submitted_at',
    'tomorrow_role', 'experiment_result', ...EVENING_SCALE_KEYS,
    ...EVENING_CONDITIONAL_KEYS,
    'mainThesis', 'understandingChange', 'likedMost', 'improveTomorrow', 'freeNote',
  ]);
  for (const r of filtered) {
    const ratings = r.s.eveningRatings as Record<string, unknown>;
    ws.addRow([
      r.p?.id, fullName(r.p), r.p?.direction, r.p?.groupName, r.s.dayNumber,
      formatTs(r.s.updatedAt), r.s.tomorrowRoleKey, ratings.experimentResult ?? '',
      ...EVENING_SCALE_KEYS.map(k => ratings[k] ?? ''),
      ...EVENING_CONDITIONAL_KEYS.map(k => ratings[k] ?? ''),
      ratings.mainThesis, ratings.understandingChange, ratings.likedMost,
      ratings.improveTomorrow, ratings.freeNote,
    ]);
  }
  await sendWorkbook(res, wb, `daily_summary_day${filters.day ?? 'all'}.xlsx`);
}
