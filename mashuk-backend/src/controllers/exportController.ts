import type { Response } from 'express';
import type { AdminRequest } from '../middlewares/adminAuth.js';
import { writeDayWorkbook } from '../services/exports/dayExport.js';
import { computeDayExportStats } from '../services/exports/dayStats.js';
import { writeParticipantsFullExport } from '../services/exports/participantsExport.js';
import { writeDailySummaryExport } from '../services/exports/dailySummaryExport.js';
import { writeEveningSummaryExport } from '../services/exports/eveningSummaryExport.js';
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
  writeOrgDirectorExport,
  writeActivityExport,
  writePointABSummaryExport,
  writeDelayedMeasureTemplate,
} from '../services/exports/ancillaryExports.js';
import { writeParticipantsArchiveZip, writeFinalProfilesZip } from '../services/exports/participantArchiveExport.js';
import { writeParticipantActivityWideWorkbook } from '../services/exports/participantActivityWide.js';
import { writeParticipantProfileExport } from '../services/exports/participantProfileExport.js';
import {
  ANSWER_ROW_HEADERS_RU, buildAnswerRow, answerText,
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
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  await writeDayWorkbook(res, day, type, { shiftId });
}

export async function exportDayStatsHandler(req: AdminRequest, res: Response): Promise<void> {
  const day = Number(req.query.day) || 1;
  const stats = await computeDayExportStats(day);
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'xlsx') {
    const { sendSimpleXlsx } = await import('../services/exports/workbook.js');
    const bt = stats.byTouchpointType || {};
    await sendSimpleXlsx(
      res,
      `day_stats_d${day}.xlsx`,
      'Статистика дня',
      [
        'Метрика', 'Значение',
      ],
      [
        ['День', stats.day],
        ['Точек осмысления (слоты)', stats.touchpointQuestions],
        ['Опубликовано вопросов', stats.publishedQuestions],
        ['Строк ответов', stats.answerRows],
        ['Участников с ответами', stats.participantsWithAnswers],
        ['checkin: вопросов', bt.checkin?.questions ?? 0],
        ['checkin: с ответами', bt.checkin?.answers ?? 0],
        ['direction: вопросов', bt.direction?.questions ?? 0],
        ['direction: с ответами', bt.direction?.answers ?? 0],
        ['evening: вопросов', bt.evening?.questions ?? 0],
        ['evening: с ответами', bt.evening?.answers ?? 0],
        ['Зоны эмоций', JSON.stringify(stats.emotionZones || {})],
      ],
    );
    return;
  }
  res.json(stats);
}

export async function exportParticipantProfileHandler(req: AdminRequest, res: Response): Promise<void> {
  await writeParticipantProfileExport(req, res);
}

export async function exportParticipantsFullHandler(req: AdminRequest, res: Response): Promise<void> {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const { parseParticipantListQuery } = await import('../services/participantsList.js');
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const { applyCohortNameFilters } = await import('../services/exports/exportCohort.js');
  let parsed = parseParticipantListQuery(req);
  parsed.page = 1;
  // No hard 5000 cap — export all matching participants unless client/env sets a limit.
  if (req.query.limit != null && req.query.limit !== '') {
    const rawLimit = Number(req.query.limit);
    if (Number.isFinite(rawLimit) && rawLimit > 0) parsed.limit = Math.floor(rawLimit);
    else delete parsed.limit;
  } else {
    delete parsed.limit;
  }
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

  const header = [...ANSWER_ROW_HEADERS_RU, ...(includeDepth ? ['Глубина'] : [])].join(',');
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

/** XLSX: все ответы за день + лист на каждый вопрос (участник · направление · ответ). */
export async function exportQuestionsDayAnswersHandler(req: AdminRequest, res: Response): Promise<void> {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const { writeQuestionsDayAnswersExport } = await import('../services/exports/questionsDayAnswersExport.js');
  const dayRaw = Number(req.query.day);
  if (!Number.isFinite(dayRaw) || dayRaw < 1) {
    res.status(400).json({ error: 'Укажите день: ?day=1…8' });
    return;
  }
  const questionKind = typeof req.query.questionKind === 'string' && req.query.questionKind.trim()
    && req.query.questionKind !== 'all'
    && req.query.questionKind !== 'exchange'
    && req.query.questionKind !== 'org_director'
    ? req.query.questionKind.trim()
    : null;
  await writeQuestionsDayAnswersExport(res, {
    day: Math.floor(dayRaw),
    shiftId: await resolveAdminShiftId(req),
    direction: typeof req.query.direction === 'string' ? req.query.direction : null,
    group: typeof req.query.group === 'string' ? req.query.group : null,
    questionKind,
  });
}

export const exportDailySummaryHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  await writeDailySummaryExport(res, {
    day: req.query.day ? Number(req.query.day) : null,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
    ageMin: req.query.ageMin ? Number(req.query.ageMin) : undefined,
    ageMax: req.query.ageMax ? Number(req.query.ageMax) : undefined,
    ageCategory: typeof req.query.ageCategory === 'string' ? req.query.ageCategory : undefined,
    activityQ: typeof req.query.activity === 'string' ? req.query.activity : undefined,
    shiftId,
  });
};

/** Отдельная аналитическая таблица по вопросам «Итоги дня». */
export const exportEveningSummaryHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  const dayRaw = req.query.day;
  const day = dayRaw != null && dayRaw !== '' && String(dayRaw) !== 'all'
    ? Number(dayRaw)
    : null;
  await writeEveningSummaryExport(res, {
    day: day != null && Number.isFinite(day) && day > 0 ? day : null,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    group: typeof req.query.group === 'string' ? req.query.group : undefined,
    ageCategory: typeof req.query.ageCategory === 'string' ? req.query.ageCategory : undefined,
    activityQ: typeof req.query.activity === 'string' ? req.query.activity : undefined,
    shiftId,
  });
};

export const exportAfterBlocksHandler = async (req: AdminRequest, res: Response) => {
  const { writeAfterBlocksExport } = await import('../services/exports/kindAnswersExport.js');
  await writeAfterBlocksExport(req, res);
};

export const exportStateChecksHandler = async (req: AdminRequest, res: Response) => {
  const { writeStateChecksExport } = await import('../services/exports/kindAnswersExport.js');
  await writeStateChecksExport(req, res);
};

export const exportDirectionPackHandler = async (req: AdminRequest, res: Response) => {
  const { writeDirectionPackExport } = await import('../services/exports/directionPackExport.js');
  await writeDirectionPackExport(req, res);
};

export const exportForumPackHandler = async (req: AdminRequest, res: Response) => {
  const { writeForumPackExport } = await import('../services/exports/forumPackExport.js');
  await writeForumPackExport(req, res);
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
  const { parseLeaderboardQuery } = await import('../services/leaderboardQuery.js');
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const {
    writeRatingDayExport,
    writeRatingShiftExport,
    writeRatingTotalExport,
    writeRatingNominationExport,
    writeMedalLeaderboardExport,
  } = await import('../services/exports/ancillaryExports.js');

  const query = parseLeaderboardQuery({ ...req.query, limit: 0, showAll: 'true' } as Record<string, unknown>);
  const format = String(req.query.format || 'csv');
  const shiftId = await resolveAdminShiftId(req);
  const exportFilters = {
    format,
    shiftId,
    direction: query.direction || undefined,
    groupId: query.groupId,
  };

  if (query.mode === 'medals' || (query.mode === 'points' && query.medalMode === 'count')) {
    await writeMedalLeaderboardExport(res, {
      ...exportFilters,
      scope: query.scope === 'day' ? 'day' : query.scope === 'total' ? 'shift' : 'shift',
      day: query.scope === 'day' ? query.day : undefined,
      medalMode: query.medalMode ?? 'count',
      medalId: query.medalId,
    });
    return;
  }
  if (query.mode === 'nomination') {
    await writeRatingNominationExport(res, query.nomination || 'general', {
      scope: query.scope === 'day' ? 'day' : 'shift',
      day: query.scope === 'day' ? query.day : undefined,
      ...exportFilters,
    });
    return;
  }
  if (query.scope === 'total') {
    await writeRatingTotalExport(res, { ...exportFilters, track: query.track });
    return;
  }
  if (query.scope === 'day') {
    await writeRatingDayExport(res, query.day ?? 1, exportFilters);
    return;
  }
  await writeRatingShiftExport(res, exportFilters);
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
export const exportExchangeHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const format = String(req.query.format || 'xlsx').toLowerCase();
  await writeExchangeFullExport(res, {
    format: format === 'csv' ? 'csv' : 'xlsx',
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportOrgDirectorHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const status = typeof req.query.status === 'string' && req.query.status.trim()
    ? req.query.status.trim()
    : null;
  await writeOrgDirectorExport(res, {
    shiftId: await resolveAdminShiftId(req),
    status,
  });
};
export const exportActivityHandler = async (req: AdminRequest, res: Response) => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const format = String(req.query.format || 'xlsx').toLowerCase();
  await writeActivityExport(res, {
    format: format === 'csv' ? 'csv' : 'xlsx',
    shiftId: await resolveAdminShiftId(req),
  });
};
export const exportPointABHandler = (_req: AdminRequest, res: Response) => writePointABSummaryExport(res);
export const exportDelayedMeasureHandler = (_req: AdminRequest, res: Response) => writeDelayedMeasureTemplate(res);
export const exportFinalProfilesZipHandler = (_req: AdminRequest, res: Response) => writeFinalProfilesZip(res);
export async function exportShiftSummaryPdfHandler(_req: AdminRequest, res: Response): Promise<void> {
  const { writeShiftSummaryPdf } = await import('../services/exports/shiftSummaryPdfBuilder.js');
  await writeShiftSummaryPdf(res);
}

export async function exportHubGroupsHandler(req: AdminRequest, res: Response): Promise<void> {
  const { resolveAnalyticsFilters } = await import('../services/analytics/analyticsQuery.js');
  const { writeHubGroupsExport } = await import('../services/exports/hubGroupsExport.js');
  const filters = await resolveAnalyticsFilters(req);
  await writeHubGroupsExport(res, filters, req);
}
