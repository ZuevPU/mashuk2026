import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware, requireAdminRole, requireAdminPermission } from '../middlewares/adminAuth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import * as admin from '../controllers/adminController.js';
import * as ops from '../controllers/adminOpsController.js';
import * as p0 from '../controllers/adminP0P2Controller.js';
import { adminLogin } from '../controllers/adminAuthController.js';
import { adminListOrgThreads, adminReplyOrgThread } from '../controllers/orgController.js';
import * as rights from '../controllers/adminRightsController.js';
import * as profilePdf from '../controllers/adminProfilePdfController.js';
import * as pushAdmin from '../controllers/pushAdminController.js';
import * as piggyAdmin from '../controllers/adminPiggybankController.js';
import { adminUploadImage } from '../controllers/pushBannerController.js';
import { uploadAdminFile } from '../controllers/uploadController.js';
import * as analyticsCtrl from '../controllers/analyticsController.js';
import * as exportsCtrl from '../controllers/exportController.js';
import * as exportCustomCtrl from '../controllers/exportCustomController.js';
import * as shiftsCtrl from '../controllers/adminShiftController.js';

const router = Router();
const P = requireAdminPermission;

router.post('/login', asyncHandler(adminLogin));
router.use(adminAuthMiddleware);

const wrap = (fn: Parameters<typeof asyncHandler>[0]): RequestHandler => asyncHandler(fn);

router.get('/participants', P('participants', 'read'), wrap(admin.listParticipants));
router.get('/participants/groups', P('participants', 'read'), wrap(admin.listParticipantGroups));
router.get('/participants/:id/card', P('participants', 'read'), wrap(p0.getParticipantCard));
router.get('/participants/:id/activity', P('participants', 'read'), wrap(p0.getParticipantActivity));
router.get('/participants/:id/admin-actions', P('participants', 'read'), wrap(p0.getParticipantAdminActions));
router.post('/participants/:id/tasks/:taskId/complete', P('participants', 'confirm'), wrap(p0.adminCompleteParticipantTaskHandler));
router.post('/participants/:id/task-submissions/:submissionId/revoke', P('moderation', 'confirm'), wrap(p0.adminRevokeTaskSubmissionHandler));
router.post('/participants/:id/block', requireAdminRole('moderate'), wrap(admin.blockParticipant));
router.post('/participants/:id/unblock', requireAdminRole('moderate'), wrap(admin.unblockParticipant));
router.post('/participants/:id/push', requireAdminRole('settings'), wrap(admin.pushParticipant));
router.post('/participants/bulk-push', requireAdminRole('settings'), wrap(admin.bulkPushParticipants));
router.post('/participants/:id/points/adjust', requireAdminRole('moderate'), wrap(admin.adjustParticipantPoints));
router.post('/participants', requireAdminRole('settings'), wrap(admin.createParticipant));
router.patch('/participants/:id/direction', requireAdminRole('settings'), wrap(admin.updateParticipantDirection));
router.patch('/participants/:id/role', requireAdminRole('settings'), wrap(admin.updateParticipantRole));
router.post('/participants/:id/restore', requireAdminRole('settings'), wrap(admin.restoreParticipantAccount));
router.post('/participants/:id/remove-from-program', requireAdminRole('moderate'), wrap(admin.removeParticipantFromProgram));
router.delete('/participants/:id/registration', requireAdminRole('delete'), wrap(admin.resetRegistration));

router.get('/roles', wrap(admin.crudRoles.list));
router.patch('/roles/:id', requireAdminRole('settings'), wrap(admin.crudRoles.update));
router.get('/day-experiments/csv-template', wrap(admin.crudDayExperiments.csvTemplate));
router.post('/day-experiments/import', requireAdminRole('settings'), wrap(admin.crudDayExperiments.importCsv));
router.get('/day-experiments', wrap(admin.crudDayExperiments.list));
router.post('/day-experiments', requireAdminRole('settings'), wrap(admin.crudDayExperiments.upsert));
router.delete('/day-experiments/:id', requireAdminRole('delete'), wrap(admin.crudDayExperiments.delete));

router.get('/directions', wrap(admin.crudDirections.list));
router.post('/directions', requireAdminRole('settings'), wrap(admin.crudDirections.create));
router.patch('/directions/:id', requireAdminRole('settings'), wrap(admin.crudDirections.update));

router.get('/thematic-tags', P('recommendation-tags', 'read'), wrap(admin.crudThematicTags.list));
router.post('/thematic-tags', P('recommendation-tags', 'create'), wrap(admin.crudThematicTags.create));
router.patch('/thematic-tags/reorder', P('recommendation-tags', 'update'), wrap(admin.crudThematicTags.reorder));
router.post('/thematic-tags/merge/preview', P('recommendation-tags', 'update'), wrap(admin.crudThematicTags.mergePreview));
router.patch('/thematic-tags/:id', P('recommendation-tags', 'update'), wrap(admin.crudThematicTags.update));
router.delete('/thematic-tags/:id', P('recommendation-tags', 'delete'), wrap(admin.crudThematicTags.delete));
router.post('/thematic-tags/merge', P('recommendation-tags', 'update'), wrap(admin.crudThematicTags.merge));

router.get('/program-places', wrap(admin.crudProgramPlaces.list));
router.post('/program-places', requireAdminRole('settings'), wrap(admin.crudProgramPlaces.create));
router.patch('/program-places/:id', requireAdminRole('settings'), wrap(admin.crudProgramPlaces.update));
router.delete('/program-places/:id', requireAdminRole('delete'), wrap(admin.crudProgramPlaces.delete));

router.get('/program-block-types', wrap(admin.crudProgramBlockTypes.list));
router.post('/program-block-types', requireAdminRole('settings'), wrap(admin.crudProgramBlockTypes.create));
router.patch('/program-block-types/:id', requireAdminRole('settings'), wrap(admin.crudProgramBlockTypes.update));
router.delete('/program-block-types/:id', requireAdminRole('delete'), wrap(admin.crudProgramBlockTypes.delete));

router.get('/program-speakers', wrap(admin.crudProgramSpeakers.list));
router.post('/program-speakers', requireAdminRole('settings'), wrap(admin.crudProgramSpeakers.create));
router.patch('/program-speakers/:id', requireAdminRole('settings'), wrap(admin.crudProgramSpeakers.update));
router.delete('/program-speakers/:id', requireAdminRole('delete'), wrap(admin.crudProgramSpeakers.delete));

router.get('/schedule/days', wrap(p0.crudScheduleDays.list));
router.post('/schedule/days', requireAdminRole('settings'), wrap(p0.crudScheduleDays.create));
router.patch('/schedule/days/:id', requireAdminRole('settings'), wrap(p0.crudScheduleDays.update));
router.post('/schedule/draft', requireAdminRole('settings'), wrap(p0.draftScheduleDay));

router.get('/shifts', P('forum', 'read'), wrap(shiftsCtrl.listAdminShifts));
router.get('/shifts/:id', P('forum', 'read'), wrap(shiftsCtrl.getAdminShift));
router.post('/shifts', requireAdminRole('settings'), wrap(shiftsCtrl.createAdminShift));
router.patch('/shifts/:id', requireAdminRole('settings'), wrap(shiftsCtrl.updateAdminShift));
router.post('/shifts/:id/activate', requireAdminRole('settings'), wrap(shiftsCtrl.activateAdminShift));
router.post('/shifts/:id/archive', requireAdminRole('settings'), wrap(shiftsCtrl.archiveAdminShift));
router.get('/shifts/:id/copy-preview', P('forum', 'read'), wrap(shiftsCtrl.previewCopyAdminShift));
router.post('/shifts/:id/copy', requireAdminRole('settings'), wrap(shiftsCtrl.copyAdminShift));
router.post('/shifts/:id/clear-sandbox', requireAdminRole('delete'), wrap(shiftsCtrl.clearSandboxAdminShift));

router.get('/forum-settings', wrap(admin.getForumSettings));
router.patch('/forum-settings', requireAdminRole('settings'), wrap(admin.updateForumSettings));
router.get('/evening-questionnaire', wrap(admin.getAdminEveningQuestionnaire));
router.patch('/evening-questionnaire', requireAdminRole('settings'), wrap(admin.patchAdminEveningQuestionnaire));
router.post('/evening-questionnaire/copy', requireAdminRole('settings'), wrap(admin.copyAdminEveningQuestionnaire));
router.post('/evening-questionnaire/reset', requireAdminRole('settings'), wrap(admin.resetAdminEveningQuestionnaire));
router.get('/kb-unlocks', wrap(admin.listKbDayUnlocks));
router.post('/kb-unlocks', requireAdminRole('settings'), wrap(admin.createKbDayUnlock));
router.delete('/kb-unlocks/:participantId/:dayNumber', requireAdminRole('settings'), wrap(admin.deleteKbDayUnlock));
router.get('/day-focus', wrap(admin.listDayFocus));
router.post('/day-focus', requireAdminRole('settings'), wrap(admin.upsertDayFocus));

router.get('/events', wrap(admin.crudEvents.list));
router.post('/events', requireAdminRole('settings'), wrap(admin.crudEvents.create));
router.patch('/events/:id', requireAdminRole('settings'), wrap(admin.crudEvents.update));
router.post('/events/:id/duplicate', requireAdminRole('settings'), wrap(admin.crudEvents.duplicate));
router.delete('/events/:id', requireAdminRole('delete'), wrap(admin.crudEvents.delete));
router.post('/schedule/publish', requireAdminRole('settings'), wrap(p0.publishScheduleDay));
router.get('/schedule/versions', wrap(p0.listScheduleVersions));

router.get('/auth/me', wrap(rights.getMyPermissions));
router.get('/tasks', P('tasks', 'read'), wrap(admin.crudTasks.list));
router.post('/tasks', P('tasks', 'create'), wrap(admin.crudTasks.create));
router.patch('/tasks/:id', P('tasks', 'update'), wrap(admin.crudTasks.update));
router.post('/tasks/:id/duplicate', P('tasks', 'update'), wrap(admin.crudTasks.duplicate));
router.delete('/tasks/:id', P('tasks', 'delete'), wrap(admin.crudTasks.delete));

router.get('/task-categories', P('tasks', 'read'), wrap(admin.crudTaskCategories.list));
router.post('/task-categories', P('tasks', 'create'), wrap(admin.crudTaskCategories.create));
router.patch('/task-categories/:id', P('tasks', 'update'), wrap(admin.crudTaskCategories.update));
router.delete('/task-categories/:id', P('tasks', 'delete'), wrap(admin.crudTaskCategories.delete));
router.get('/moderation/summary', P('moderation', 'read'), wrap(admin.getModerationSummary));
router.get('/task-submissions', P('moderation', 'read'), wrap(admin.listAllSubmissions));
router.get('/task-submissions/pending', P('moderation', 'read'), wrap(admin.listPendingSubmissions));
router.post('/task-submissions/bulk-moderate', P('moderation', 'confirm'), wrap(admin.bulkModerateTasks));
router.patch('/task-submissions/:id', P('moderation', 'confirm'), wrap(admin.moderateTask));

router.get('/questions', wrap(admin.crudQuestions.list));
router.get('/questions/:id', wrap(admin.crudQuestions.getOne));
router.post('/questions', requireAdminRole('settings'), wrap(admin.crudQuestions.create));
router.patch('/questions/:id', requireAdminRole('settings'), wrap(admin.crudQuestions.update));
router.delete('/questions/:id', requireAdminRole('delete'), wrap(admin.crudQuestions.delete));
router.post('/questions/:id/duplicate', requireAdminRole('settings'), wrap(admin.crudQuestions.duplicate));
router.post('/questions/:id/copy-to-day', requireAdminRole('settings'), wrap(admin.crudQuestions.copyToDay));
router.post('/questions/copy-selected', requireAdminRole('settings'), wrap(admin.copyQuestionsSelected));
router.get('/questions/:id/versions', wrap(admin.crudQuestions.listVersions));
router.get('/questions/:id/answers', wrap(admin.crudQuestions.listAnswers));
router.get('/questions/:id/options', wrap(admin.crudQuestions.listOptions));
router.post('/questions/:id/options', requireAdminRole('settings'), wrap(admin.crudQuestions.addOption));
router.patch('/questions/:id/options/reorder', requireAdminRole('settings'), wrap(admin.crudQuestions.reorderOptions));
router.delete('/questions/:id/options/:optionId', requireAdminRole('delete'), wrap(admin.crudQuestions.deleteOption));
router.get('/questions/:id/answer-count', wrap(ops.getQuestionAnswerCount));
router.post('/questions/copy-day', requireAdminRole('settings'), wrap(admin.copyQuestionsDay));
router.post('/questions/seed-touchpoints', requireAdminRole('settings'), wrap(admin.seedTouchpointsTemplate));

router.get('/exchange', wrap(admin.listAllExchange));
router.get('/exchange/pending', wrap(admin.listPendingExchange));
router.get('/exchange-answers', wrap(admin.listExchangeAnswers));
router.patch('/exchange/:id', requireAdminRole('moderate'), wrap(admin.moderateExchange));

router.get('/org/threads', wrap(adminListOrgThreads));
router.post('/org/threads/:id/reply', requireAdminRole('moderate'), wrap(adminReplyOrgThread));

router.get('/consents', wrap(p0.crudConsents.list));
router.post('/consents', requireAdminRole('settings'), wrap(p0.crudConsents.create));
router.patch('/consents/:id', requireAdminRole('settings'), wrap(p0.crudConsents.update));
router.delete('/consents/:id', requireAdminRole('delete'), wrap(p0.crudConsents.delete));

router.get('/groups', wrap(p0.crudGroups.list));
router.post('/groups', requireAdminRole('settings'), wrap(p0.crudGroups.create));
router.patch('/groups/:id', requireAdminRole('settings'), wrap(p0.crudGroups.update));
router.delete('/groups/:id', requireAdminRole('delete'), wrap(p0.crudGroups.delete));

router.get('/event-attendance', wrap(admin.listEventAttendance));

router.post('/upload-file', requireAdminRole('settings'), wrap(uploadAdminFile));
router.get('/materials', wrap(admin.crudMaterials.list));
router.post('/materials', requireAdminRole('settings'), wrap(admin.crudMaterials.create));
router.patch('/materials/:id', requireAdminRole('settings'), wrap(admin.crudMaterials.update));
router.delete('/materials/:id', requireAdminRole('delete'), wrap(admin.crudMaterials.delete));
router.get('/material-types', wrap(admin.crudMaterialTypes.list));
router.post('/material-types', requireAdminRole('settings'), wrap(admin.crudMaterialTypes.create));
router.patch('/material-types/:id', requireAdminRole('settings'), wrap(admin.crudMaterialTypes.update));
router.delete('/material-types/:id', requireAdminRole('delete'), wrap(admin.crudMaterialTypes.delete));

router.get('/levels-config', P('levels', 'read'), wrap(admin.crudLevels.list));
router.get('/levels-config/action-catalog', P('levels', 'read'), wrap(admin.getLevelsActionCatalog));
router.post('/levels-config', P('levels', 'update'), wrap(admin.crudLevels.upsert));
router.post('/levels-config/batch', P('levels', 'update'), wrap(admin.crudLevels.batchUpsert));
router.post('/rating/recalculate-all', P('levels', 'update'), wrap(admin.triggerRatingRecalcAll));
router.get('/rating/recalc-history', wrap(admin.listRatingRecalcHistory));
router.get('/rating/bonus-rules', wrap(admin.listRatingBonusRules));
router.post('/rating/bonus-rules', P('levels', 'update'), wrap(admin.createRatingBonusRule));
router.patch('/rating/bonus-rules/:id', P('levels', 'update'), wrap(admin.patchRatingBonusRule));

router.get('/exports/participants', requireAdminRole('export'), wrap(exportsCtrl.exportParticipantsFullHandler));
router.get('/exports/answers', requireAdminRole('export'), wrap(exportsCtrl.exportAnswersHandler));
router.get('/exports/piggybank', requireAdminRole('export'), wrap(exportsCtrl.exportPiggybankHandler));
router.get('/exports/task-submissions', P('exports', 'export'), wrap(exportsCtrl.exportTaskSubmissionsHandler));
router.get('/exports/tasks-catalog', P('exports', 'export'), wrap(exportsCtrl.exportTasksCatalogHandler));
router.get('/exports/exchange', requireAdminRole('export'), wrap(exportsCtrl.exportExchangeHandler));
router.get('/exports/attendance', requireAdminRole('export'), wrap(admin.exportAttendance));
router.get('/exports/points-log', P('exports', 'export'), wrap(admin.exportPointsLog));
router.get('/exports/day', requireAdminRole('export'), wrap(exportsCtrl.exportDayWorkbookHandler));
router.get('/exports/day/stats', requireAdminRole('export'), wrap(exportsCtrl.exportDayStatsHandler));
router.get('/exports/daily-summary', requireAdminRole('export'), wrap(exportsCtrl.exportDailySummaryHandler));
router.get('/exports/roles-experiments', requireAdminRole('export'), wrap(exportsCtrl.exportRolesExperimentsHandler));
router.get('/exports/reflections', requireAdminRole('export'), wrap(exportsCtrl.exportReflectionsHandler));
router.get('/exports/participant/:id/answers', requireAdminRole('export'), wrap(exportsCtrl.exportParticipantAnswersHandler));
router.get('/exports/participants-archive', requireAdminRole('export'), wrap(exportsCtrl.exportParticipantsArchiveHandler));
router.get('/exports/rating/day', P('exports', 'export'), wrap(exportsCtrl.exportRatingDayHandler));
router.get('/exports/rating/shift', P('exports', 'export'), wrap(exportsCtrl.exportRatingShiftHandler));
router.get('/exports/rating/nominations/:key', P('exports', 'export'), wrap(exportsCtrl.exportRatingNominationHandler));
router.get('/exports/medals', P('exports', 'export'), wrap(exportsCtrl.exportMedalsHandler));
router.get('/exports/moderation-log', P('exports', 'export'), wrap(exportsCtrl.exportModerationLogHandler));
router.get('/exports/points-manual', P('exports', 'export'), wrap(exportsCtrl.exportPointsManualHandler));
router.get('/exports/activity', requireAdminRole('export'), wrap(exportsCtrl.exportActivityHandler));
router.get('/exports/point-a-b-summary', requireAdminRole('export'), wrap(exportsCtrl.exportPointABHandler));
router.get('/exports/delayed-measure-template', requireAdminRole('export'), wrap(exportsCtrl.exportDelayedMeasureHandler));
router.get('/exports/final-profiles.zip', requireAdminRole('export'), wrap(exportsCtrl.exportFinalProfilesZipHandler));
router.get('/exports/meta', requireAdminRole('export'), wrap(exportCustomCtrl.getExportMetaHandler));
router.post('/exports/custom', requireAdminRole('export'), wrap(exportCustomCtrl.postCustomExportHandler));
router.post('/exports/history/preset', requireAdminRole('export'), wrap(exportCustomCtrl.postPresetExportHistoryHandler));
router.get('/exports/history', requireAdminRole('export'), wrap(exportCustomCtrl.getExportHistoryHandler));
router.get('/exports/history/:id/download', requireAdminRole('export'), wrap(exportCustomCtrl.downloadExportHistoryHandler));
router.get('/analytics/summary', wrap(admin.getAnalyticsSummary));
router.get('/analytics/charts', wrap(admin.getAnalyticsCharts));
router.get('/analytics/meta', P('analytics', 'read'), wrap(analyticsCtrl.getAnalyticsMetaHandler));
router.get('/analytics/dashboards/pulse', P('analytics', 'read'), wrap(analyticsCtrl.getPulseDashboardHandler));
router.get('/analytics/dashboards/portrait', P('analytics', 'read'), wrap(analyticsCtrl.getPortraitDashboardHandler));
router.get('/analytics/dashboards/program', P('analytics', 'read'), wrap(analyticsCtrl.getProgramDashboardHandler));
router.get('/analytics/dashboards/activity', P('analytics', 'read'), wrap(analyticsCtrl.getActivityDashboardHandler));
router.get('/analytics/dashboards/piggybank', P('analytics', 'read'), wrap(analyticsCtrl.getPiggybankDashboardHandler));
router.get('/analytics/dashboards/semantic', P('analytics', 'read'), wrap(analyticsCtrl.getSemanticDashboardHandler));
router.get('/analytics/dashboards/clubs', P('analytics', 'read'), wrap(analyticsCtrl.getClubsDashboardHandler));
router.get('/analytics/dashboards', P('analytics', 'read'), wrap(analyticsCtrl.getLegacyDashboardsHandler));
router.get('/analytics/departure-portrait', P('analytics', 'read'), wrap(analyticsCtrl.getDeparturePortraitHandler));
router.get('/analytics/forum-clubs', P('analytics', 'read'), wrap(analyticsCtrl.listForumClubsHandler));
router.patch('/analytics/forum-clubs/:id', requireAdminRole('settings'), wrap(analyticsCtrl.patchForumClubHandler));
router.post('/analytics/recalculate', requireAdminRole('settings'), wrap(admin.triggerAnalyticsRecalc));
router.post('/analytics/refresh', requireAdminRole('settings'), wrap(analyticsCtrl.postAnalyticsRefreshHandler));
router.post('/push/send', requireAdminRole('settings'), wrap(admin.sendManualPush));
router.get('/push/log', wrap(admin.listPushLog));
router.get('/push/notifications', wrap(pushAdmin.listPushNotifications));
router.get('/push/notifications/:id', wrap(pushAdmin.getPushNotification));
router.post('/push/notifications', requireAdminRole('settings'), wrap(pushAdmin.createPushNotification));
router.patch('/push/notifications/:id', requireAdminRole('settings'), wrap(pushAdmin.updatePushNotification));
router.delete('/push/notifications/:id', requireAdminRole('delete'), wrap(pushAdmin.deletePushNotification));
router.post('/push/notifications/:id/duplicate', requireAdminRole('settings'), wrap(pushAdmin.duplicatePushNotification));
router.post('/push/notifications/:id/preview', wrap(pushAdmin.previewPushNotification));
router.post('/push/notifications/:id/test', requireAdminRole('settings'), wrap(pushAdmin.testPushNotification));
router.post('/push/notifications/:id/send', requireAdminRole('settings'), wrap(pushAdmin.sendPushNotificationAction));
router.post('/push/notifications/:id/refresh-stats', wrap(pushAdmin.refreshPushNotificationStats));
router.get('/push/templates/:templateId/apply', wrap(pushAdmin.applyPushTemplate));
router.post('/upload-image', requireAdminRole('settings'), wrap(adminUploadImage));
router.get('/push/templates', wrap(p0.crudPushTemplates.list));
router.post('/push/templates', requireAdminRole('settings'), wrap(p0.crudPushTemplates.create));
router.patch('/push/templates/:id', requireAdminRole('settings'), wrap(p0.crudPushTemplates.update));
router.delete('/push/templates/:id', requireAdminRole('delete'), wrap(p0.crudPushTemplates.delete));
router.get('/push/queue', wrap(p0.listPushQueue));
router.post('/push/queue', requireAdminRole('settings'), wrap(p0.enqueuePush));
router.get('/points-log', wrap(admin.listPointsLog));

router.get('/actions-log', P('journal', 'read'), wrap(ops.listAdminActions));
router.get('/actions-log/export', P('journal', 'export'), wrap(ops.exportAdminActionsXlsx));
router.patch('/actions-log/:id/review', P('journal', 'update'), wrap(ops.reviewAdminAction));
router.post('/actions-log/:id/rollback', P('journal', 'update'), wrap(ops.rollbackAdminAction));

router.get('/admin-users', P('admins', 'read'), wrap(ops.listAdminUsers));
router.get('/admin-users/:id', P('admins', 'read'), wrap(ops.getAdminUser));
router.get('/admin-users/:id/actions', P('admins', 'read'), wrap(ops.listAdminUserActions));
router.get('/rights-matrix', P('admins', 'read'), wrap(rights.getRightsMatrix));
router.get('/me/permissions', wrap(rights.getMyPermissions));
router.patch('/rights-matrix', P('admins', 'update'), wrap(rights.patchRightsMatrixHandler));
router.post('/rights-matrix/reset-defaults', P('admins', 'update'), wrap(rights.resetRightsMatrixHandler));
router.post('/admin-users', P('admins', 'create'), wrap(ops.createAdminUser));
router.patch('/admin-users/:id', P('admins', 'update'), wrap(ops.updateAdminUser));
router.post('/admin-users/:id/reset-password', P('admins', 'update'), wrap(ops.resetAdminUserPassword));
router.delete('/admin-users/:id', P('admins', 'delete'), wrap(ops.deleteAdminUser));

router.get('/piggybank-entries', P('piggybank', 'read'), wrap(piggyAdmin.listPiggybankEntries));
router.get('/piggybank-entries/export', P('piggybank', 'export'), wrap(piggyAdmin.exportPiggybankEntries));
router.patch('/piggybank-entries/:id', P('piggybank', 'update'), wrap(piggyAdmin.patchPiggybankEntry));
router.delete('/piggybank-entries/:id', P('piggybank', 'delete'), wrap(piggyAdmin.deletePiggybankEntry));

router.get('/medals/rule-metrics', P('medals', 'read'), wrap(ops.listMedalRuleMetrics));
router.get('/medals', P('medals', 'read'), wrap(ops.crudMedals.list));
router.post('/medals', P('medals', 'create'), wrap(ops.crudMedals.create));
router.patch('/medals/:id', P('medals', 'update'), wrap(ops.crudMedals.update));
router.delete('/medals/:id', P('medals', 'delete'), wrap(ops.crudMedals.delete));
router.post('/medals/award', P('medals', 'update'), wrap(ops.awardMedal));
router.post('/medals/evaluate', P('medals', 'update'), wrap(p0.runMedalEvaluation));

router.post('/qr/generate', P('tasks', 'update'), wrap(ops.generateEntityQr));
router.post('/qr/download', P('tasks', 'update'), wrap(p0.generateAndDownloadQr));
router.get('/qr/pack', P('tasks', 'read'), wrap(p0.getQrPack));
router.post('/participants/:id/points/:logId/revoke', requireAdminRole('settings'), wrap(p0.revokeParticipantPoints));
router.post('/participants/:id/points/revoke-bulk', requireAdminRole('settings'), wrap(p0.revokeSuspiciousParticipantPoints));
router.get('/leaderboard', P('levels', 'read'), wrap(ops.getLeaderboard));
router.get('/pdf-whitelist', wrap(ops.listPdfWhitelist));
router.post('/pdf-whitelist', requireAdminRole('settings'), wrap(ops.setPdfWhitelist));
router.get('/participants/:id/pdf-text', requireAdminRole('export'), wrap(ops.buildParticipantPdfText));
router.get('/participants/:id/pdf', requireAdminRole('export'), wrap(p0.buildParticipantPdf));
router.get('/participants/:id/pdf-preview', requireAdminRole('export'), wrap(profilePdf.previewAdminParticipantPdf));
router.get('/participants/:id/pdf-draft', requireAdminRole('export'), wrap(profilePdf.getAdminParticipantPdfDraft));
router.patch('/participants/:id/pdf-draft', requireAdminRole('export'), wrap(profilePdf.patchAdminParticipantPdfDraft));
router.post('/participants/:id/pdf-publish', requireAdminRole('export'), wrap(profilePdf.publishAdminParticipantPdf));
router.get('/pdf-template', wrap(profilePdf.getAdminPdfTemplate));
router.patch('/pdf-template', requireAdminRole('settings'), wrap(profilePdf.patchAdminPdfTemplate));
router.post('/integrations/delayed-survey', requireAdminRole('settings'), wrap(ops.scheduleDelayedSurvey));
router.post('/integrations/import-diagnosis', requireAdminRole('settings'), wrap(ops.importDirectionDiagnosis));
router.post('/integrations/club-match', requireAdminRole('settings'), wrap(p0.runClubMatching));
router.get('/integrations/club-matches', wrap(p0.listClubMatches));

export default router;
