import type { Response } from 'express';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { addReadmeSheet } from './exportCommon.js';
import { createWorkbook, sendWorkbook, sendCsv } from './workbook.js';

const HEADERS = [
  'id', 'full_name', 'vk_id', 'age', 'direction', 'group_name', 'workplace', 'position',
  'registered_at', 'path_points', 'experience_points', 'bonus_points', 'total_rating',
  'path_level', 'experience_level', 'ideas_count',
  'consent_pd', 'consent_analytics', 'consent_pd_version', 'consent_analytics_version', 'consent_date',
  'point_a_answers', 'point_b_answers', 'start_role', 'strong_role', 'growth_role', 'next_experiment',
  'interests', 'role_answers',
];

export async function writeParticipantsFullExport(res: Response, format: string): Promise<void> {
  const rows = await loadEnrichedParticipants();
  if (format === 'xlsx') {
    const wb = await createWorkbook();
    addReadmeSheet(wb, [
      'База участников (сквозная). consent_date = onboardingCompletedAt при согласии ПД.',
    ]);
    const ws = wb.addWorksheet('Участники');
    ws.addRow(HEADERS);
    for (const r of rows) {
      ws.addRow([
        r.id, r.fullName, r.vkId, r.age, r.direction, r.groupName, r.workplace, r.position,
        r.registeredAt, r.pathPoints, r.experiencePoints, r.bonusPoints, r.totalRating,
        r.pathLevel, r.experienceLevel, r.ideasCount,
        r.consentPd, r.consentAnalytics, r.consentPdVersion, r.consentAnalyticsVersion, r.consentDate,
        r.pointA, r.pointB, r.startRole, r.strongRole, r.growthRole, r.nextExperiment,
        r.interests, r.roleAnswers,
      ]);
    }
    await sendWorkbook(res, wb, 'participants_full.xlsx');
    return;
  }
  sendCsv(
    res,
    'participants_full.csv',
    HEADERS.join(','),
    rows.map(r => [
      r.id, r.fullName, r.vkId, r.age, r.direction, r.groupName, r.workplace, r.position,
      r.registeredAt, r.pathPoints, r.experiencePoints, r.bonusPoints, r.totalRating,
      r.pathLevel, r.experienceLevel, r.ideasCount,
      r.consentPd, r.consentAnalytics, r.consentPdVersion, r.consentAnalyticsVersion, r.consentDate,
      r.pointA, r.pointB, r.startRole, r.strongRole, r.growthRole, r.nextExperiment,
      r.interests, r.roleAnswers,
    ]),
  );
}
