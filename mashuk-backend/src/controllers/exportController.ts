import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { writeDayWorkbook } from '../services/exports/dayExport.js';
import { computeDayExportStats } from '../services/exports/dayStats.js';
import { writeParticipantsFullExport } from '../services/exports/participantsExport.js';
import { writeDailySummaryExport } from '../services/exports/dailySummaryExport.js';
import { writeRolesExperimentsExport } from '../services/exports/rolesExperimentsExport.js';
import { writeReflectionsExport, writeParticipantAnswersExport } from '../services/exports/reflectionsExport.js';
import {
  writePiggybankFullExport,
  writeTasksCatalogExport,
  writeTaskSubmissionsFullExport,
  writeRatingDayExport,
  writeRatingShiftExport,
  writeRatingNominationExport,
  writeMedalLeaderboardExport,
  writeMedalsExport,
  writeModerationLogExport,
  writePointsManualExport,
  writeExchangeFullExport,
  writeActivityExport,
  writePointABSummaryExport,
  writeDelayedMeasureTemplate,
} from '../services/exports/ancillaryExports.js';
import { writeParticipantsArchiveZip, writeFinalProfilesZip } from '../services/exports/participantArchiveExport.js';
import { writeParticipantActivityWideWorkbook } from '../services/exports/participantActivityWide.js';
import {
  ANSWER_ROW_HEADERS, buildAnswerRow, answerText,
} from '../services/exports/exportCommon.js';
import { normalizeExportTouchpointFilter } from '../services/exports/touchpointFilter.js';
import { sendCsv } from '../services/exports/workbook.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';

export async function exportParticipantActivityWideHandler(req: AdminRequest, res: Response): Promise<void> {
  const dayRaw = req.query.day;
  const day = dayRaw != null && dayRaw !== '' && String(dayRaw) !== 'all'
    ? Number(dayRaw)
    : undefined;
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  await writeParticipantActivityWideWorkbook(res, {
    day: day != null && Number.isFinite(day) && day > 0 ? day : undefined,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
    participantId: req.query.participantId ? Number(req.query.participantId) : undefined,
    shiftId,
  });
}

export async function exportDayWorkbookHandler(req: AdminRequest, res: Response): Promise<void> {
  const day = Number(req.query.day) || 1;
  const type = req.query.type as string | undefined;
  await writeDayWorkbook(res, day, type);
}

export async function exportDayStatsHandler(req: AdminRequest, res: Response): Promise<void> {
  const day = Number(req.query.day) || 1;
  const stats = await computeDayExportStats(day);
  res.json(stats);
}

export async function exportParticipantsFullHandler(req: AdminRequest, res: Response): Promise<void> {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const { parseParticipantListQuery } = await import('../services/participantsList.js');
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const { applyCohortNameFilters } = await import('../services/exports/exportCohort.js');
  let parsed = parseParticipantListQuery(req);
  parsed.page = 1;
  const rawLimit = req.query.limit != null && req.query.limit !== ''
    ? Number(req.query.limit)
    : 5000;
  parsed.limit = Math.max(1, Math.min(5000, Number.isFinite(rawLimit) ? rawLimit : 5000));
  if (parsed.shiftId == null || Number.isNaN(parsed.shiftId)) {
    parsed.shiftId = await resolveAdminShiftId(req);
  }
  parsed = await applyCohortNameFilters(parsed, {
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
  });
  await writeParticipantsFullExport(res, format === 'csv' ? 'csv' : 'xlsx', parsed);
}

export async function exportAnswersHandler(req: AdminRequest, res: Response): Promise<void> {
  const day = req.query.day ? Number(req.query.day) : null;
  const type = normalizeExportTouchpointFilter(req.query.type as string | undefined);
  const includeDepth = req.query.depth === '1' || req.query.depth === 'true';

  const { queryAnswerJoinRows } = await import('../services/exports/answerJoinQuery.js');
  const rows = await queryAnswerJoinRows({
    day: day && !Number.isNaN(day) ? day : undefined,
    touchpoint: type,
    publishedOnly: true,
  });

  const header = [...ANSWER_ROW_HEADERS, ...(includeDepth ? ['depth_orientir'] : [])].join(',');
  sendCsv(
    res,
    day ? `answers_day${day}.csv` : 'answers.csv',
    header,
    rows.map(r => {
      const text = answerText(r.a.answerData);
      const base = buildAnswerRow(r, { source: 'question' }).map(String);
      if (includeDepth) base.push(inferReflectionDepth(text) || '');
      return base;
    }),
  );
}

export const exportDailySummaryHandler = async (req: AdminRequest, res: Response) => {
  await writeDailySummaryExport(res, {
    day: req.query.day ? Number(req.query.day) : null,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
    ageMin: req.query.ageMin ? Number(req.query.ageMin) : undefined,
    ageMax: req.query.ageMax ? Number(req.query.ageMax) : undefined,
    activityQ: typeof req.query.activity === 'string' ? req.query.activity : undefined,
  });
};

export const exportRolesExperimentsHandler = async (_req: AdminRequest, res: Response) => {
  await writeRolesExperimentsExport(res);
};

export const exportReflectionsHandler = async (req: AdminRequest, res: Response) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  await writeReflectionsExport(res, format, {
    shiftId,
    day: req.query.day ? Number(req.query.day) : undefined,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
  });
};

export const exportParticipantAnswersHandler = async (req: AdminRequest, res: Response) => {
  const id = Number(req.params.id);
  const textOnly = req.query.textOnly === 'true' || req.query.textOnly === '1';
  const format = String(req.query.format || 'xlsx').toLowerCase();
  await writeParticipantAnswersExport(res, id, textOnly, format);
};

export const exportParticipantsArchiveHandler = async (req: AdminRequest, res: Response) => {
  const participantId = req.query.participantId ? Number(req.query.participantId) : undefined;
  const textOnly = req.query.textOnly === 'true' || req.query.textOnly === '1';
  await writeParticipantsArchiveZip(res, { participantId, textOnly });
};

export const exportPiggybankHandler = (req: AdminRequest, res: Response) => writePiggybankFullExport(req, res);
export const exportTasksCatalogHandler = (_req: AdminRequest, res: Response) => writeTasksCatalogExport(res);
export const exportTaskSubmissionsHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  await writeTaskSubmissionsFullExport(res, {
    format: String(req.query.format || 'xlsx'),
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportRatingDayHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  await writeRatingDayExport(res, Number(req.query.day) || 1, {
    format: String(req.query.format || 'xlsx'),
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportRatingShiftHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  await writeRatingShiftExport(res, {
    format: String(req.query.format || 'csv'),
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportRatingNominationHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const scopeRaw = String(req.query.scope || 'shift');
  const scope = scopeRaw === 'day' ? 'day' : 'shift';
  const day = req.query.day != null ? Number(req.query.day) : undefined;
  await writeRatingNominationExport(res, String(req.params.key || 'general'), {
    scope,
    day: scope === 'day' && Number.isFinite(day) ? day : undefined,
    format: String(req.query.format || 'csv'),
    shiftId: await resolveAdminShiftId(req),
  });
};

export const exportMedalLeaderboardHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const scopeRaw = String(req.query.scope || 'shift');
  const scope = scopeRaw === 'day' ? 'day' : 'shift';
  const day = req.query.day != null ? Number(req.query.day) : undefined;
  const medalModeRaw = String(req.query.medalMode || 'count');
  const medalId = req.query.medalId != null ? Number(req.query.medalId) : undefined;
  await writeMedalLeaderboardExport(res, {
    format: String(req.query.format || 'csv'),
    shiftId: await resolveAdminShiftId(req),
    scope,
    day: scope === 'day' && Number.isFinite(day) ? day : undefined,
    medalMode: medalModeRaw === 'holders' ? 'holders' : 'count',
    medalId: medalId && !Number.isNaN(medalId) ? medalId : undefined,
  });
};

export const exportLeaderboardSnapshotHandler = async (req: AdminRequest, res: Response) => {
  const mode = String(req.query.mode || 'points');
  const scopeRaw = String(req.query.scope || 'shift');
  const scope = (scopeRaw === 'day' || scopeRaw === 'shift' || scopeRaw === 'total') ? scopeRaw : 'shift';
  const day = req.query.day != null ? Number(req.query.day) : undefined;
  const format = String(req.query.format || 'csv');
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);

  if (mode === 'medals') {
    const medalModeRaw = String(req.query.medalMode || 'count');
    const medalId = req.query.medalId != null ? Number(req.query.medalId) : undefined;
    await writeMedalLeaderboardExport(res, {
      format,
      shiftId,
      scope: scope === 'day' ? 'day' : 'shift',
      day: scope === 'day' && Number.isFinite(day) ? day : undefined,
      medalMode: medalModeRaw === 'holders' ? 'holders' : 'count',
      medalId: medalId && !Number.isNaN(medalId) ? medalId : undefined,
    });
    return;
  }
  if (mode === 'nomination') {
    await writeRatingNominationExport(res, String(req.query.nomination || 'general'), {
      scope: scope === 'day' ? 'day' : 'shift',
      day: scope === 'day' && Number.isFinite(day) ? day : undefined,
      format,
      shiftId,
    });
    return;
  }
  if (scope === 'day') {
    await writeRatingDayExport(res, Number.isFinite(day) ? Number(day) : 1, { format, shiftId });
    return;
  }
  await writeRatingShiftExport(res, { format, shiftId });
};
export const exportMedalsHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  await writeMedalsExport(res, {
    format: String(req.query.format || 'xlsx'),
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportModerationLogHandler = (_req: AdminRequest, res: Response) => writeModerationLogExport(res);
export const exportPointsManualHandler = (_req: AdminRequest, res: Response) => writePointsManualExport(res);
export const exportExchangeHandler = (_req: AdminRequest, res: Response) => writeExchangeFullExport(res);
export const exportActivityHandler = (_req: AdminRequest, res: Response) => writeActivityExport(res);
export const exportPointABHandler = (_req: AdminRequest, res: Response) => writePointABSummaryExport(res);
export const exportDelayedMeasureHandler = (_req: AdminRequest, res: Response) => writeDelayedMeasureTemplate(res);
export const exportFinalProfilesZipHandler = (_req: AdminRequest, res: Response) => writeFinalProfilesZip(res);
export async function exportShiftSummaryPdfHandler(_req: AdminRequest, res: Response): Promise<void> {
  const { writeShiftSummaryPdf } = await import('../services/exports/shiftSummaryPdfBuilder.js');
  await writeShiftSummaryPdf(res);
}
