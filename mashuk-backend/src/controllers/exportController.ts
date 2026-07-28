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
  writeMedalsExport,
  writeModerationLogExport,
  writePointsManualExport,
  writeExchangeFullExport,
  writeActivityExport,
  writePointABSummaryExport,
  writeDelayedMeasureTemplate,
} from '../services/exports/ancillaryExports.js';
import { writeParticipantsArchiveZip, writeFinalProfilesZip } from '../services/exports/participantArchiveExport.js';
import {
  ANSWER_ROW_HEADERS, buildAnswerRow, filterAnswersByTouchpoint, answerText,
} from '../services/exports/exportCommon.js';
import { normalizeExportTouchpointFilter } from '../services/exports/touchpointFilter.js';
import { sendCsv } from '../services/exports/workbook.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, participants, questions } from '../db/schema.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
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
  await writeParticipantsFullExport(res, format === 'csv' ? 'csv' : 'xlsx');
}

export async function exportAnswersHandler(req: AdminRequest, res: Response): Promise<void> {
  const day = req.query.day ? Number(req.query.day) : null;
  const type = normalizeExportTouchpointFilter(req.query.type as string | undefined);
  const includeDepth = req.query.depth === '1' || req.query.depth === 'true';

  let rows = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id));
  if (day) rows = rows.filter(r => r.q?.dayNumber === day);
  rows = filterAnswersByTouchpoint(rows, type);

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
  await writeReflectionsExport(res, format);
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
export const exportTaskSubmissionsHandler = (_req: AdminRequest, res: Response) => writeTaskSubmissionsFullExport(res);
export const exportRatingDayHandler = (req: AdminRequest, res: Response) =>
  writeRatingDayExport(res, Number(req.query.day) || 1);
export const exportRatingShiftHandler = (_req: AdminRequest, res: Response) => writeRatingShiftExport(res);
export const exportRatingNominationHandler = (req: AdminRequest, res: Response) =>
  writeRatingNominationExport(res, String(req.params.key || 'general'));
export const exportMedalsHandler = (_req: AdminRequest, res: Response) => writeMedalsExport(res);
export const exportModerationLogHandler = (_req: AdminRequest, res: Response) => writeModerationLogExport(res);
export const exportPointsManualHandler = (_req: AdminRequest, res: Response) => writePointsManualExport(res);
export const exportExchangeHandler = (_req: AdminRequest, res: Response) => writeExchangeFullExport(res);
export const exportActivityHandler = (_req: AdminRequest, res: Response) => writeActivityExport(res);
export const exportPointABHandler = (_req: AdminRequest, res: Response) => writePointABSummaryExport(res);
export const exportDelayedMeasureHandler = (_req: AdminRequest, res: Response) => writeDelayedMeasureTemplate(res);
export const exportFinalProfilesZipHandler = (_req: AdminRequest, res: Response) => writeFinalProfilesZip(res);
