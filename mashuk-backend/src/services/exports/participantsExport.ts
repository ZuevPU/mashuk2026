import type { Response } from 'express';
import type { ParticipantListQuery } from '../participantsList.js';
import { loadEnrichedParticipants } from './participantEnrichment.js';
import { addReadmeSheet } from './exportCommon.js';
import { PARTICIPANTS_FULL_HEADERS_RU, participantExportMaxRows } from './exportLabels.js';
import { createWorkbook, sendWorkbook, sendCsv } from './workbook.js';

export async function writeParticipantsFullExport(
  res: Response,
  format: string,
  query: ParticipantListQuery = {},
): Promise<void> {
  const rows = await loadEnrichedParticipants(query);
  const cap = participantExportMaxRows();
  const truncated = cap != null && rows.length >= cap;
  if (format === 'xlsx') {
    const wb = await createWorkbook();
    addReadmeSheet(wb, [
      'База участников (сквозная). Роли — русские названия. Согласие: да/нет.',
      truncated
        ? `ВНИМАНИЕ: выгрузка обрезана до ${cap} участников (PARTICIPANT_EXPORT_MAX_ROWS).`
        : `Строк в файле: ${rows.length}${cap == null ? ' (без лимита)' : ''}.`,
    ]);
    const ws = wb.addWorksheet('Участники');
    ws.addRow([...PARTICIPANTS_FULL_HEADERS_RU]);
    for (const r of rows) {
      ws.addRow([
        r.id, r.fullName, r.vkId, r.age, r.direction, r.groupName, r.workplace, r.position,
        r.registeredAt, r.lastActiveAt, r.isBlocked,
        r.pathPoints, r.experiencePoints, r.bonusPoints, r.totalRating,
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
    PARTICIPANTS_FULL_HEADERS_RU.join(','),
    rows.map(r => [
      r.id, r.fullName, r.vkId, r.age, r.direction, r.groupName, r.workplace, r.position,
      r.registeredAt, r.lastActiveAt, r.isBlocked,
      r.pathPoints, r.experiencePoints, r.bonusPoints, r.totalRating,
      r.pathLevel, r.experienceLevel, r.ideasCount,
      r.consentPd, r.consentAnalytics, r.consentPdVersion, r.consentAnalyticsVersion, r.consentDate,
      r.pointA, r.pointB, r.startRole, r.strongRole, r.growthRole, r.nextExperiment,
      r.interests, r.roleAnswers,
    ]),
  );
}
