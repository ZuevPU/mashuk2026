import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware, requireAdminRole } from '../middlewares/adminAuth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import * as admin from '../controllers/adminController.js';
import * as ops from '../controllers/adminOpsController.js';
import * as p0 from '../controllers/adminP0P2Controller.js';
import { adminLogin } from '../controllers/adminAuthController.js';
import { adminListOrgThreads, adminReplyOrgThread } from '../controllers/orgController.js';
import { ADMIN_RIGHTS_MATRIX } from '../utils/adminToken.js';
import * as profilePdf from '../controllers/adminProfilePdfController.js';

const router = Router();

router.post('/login', asyncHandler(adminLogin));
router.use(adminAuthMiddleware);

const wrap = (fn: Parameters<typeof asyncHandler>[0]): RequestHandler => asyncHandler(fn);

router.get('/participants', wrap(admin.listParticipants));
router.get('/participants/:id/card', wrap(p0.getParticipantCard));
router.post('/participants', requireAdminRole('settings'), wrap(admin.createParticipant));
router.patch('/participants/:id/direction', requireAdminRole('settings'), wrap(admin.updateParticipantDirection));
router.patch('/participants/:id/role', requireAdminRole('settings'), wrap(admin.updateParticipantRole));
router.post('/participants/:id/restore', requireAdminRole('settings'), wrap(admin.restoreParticipantAccount));
router.delete('/participants/:id/registration', requireAdminRole('delete'), wrap(admin.resetRegistration));

router.get('/roles', wrap(admin.crudRoles.list));
router.patch('/roles/:id', requireAdminRole('settings'), wrap(admin.crudRoles.update));
router.get('/day-experiments', wrap(admin.crudDayExperiments.list));
router.post('/day-experiments', requireAdminRole('settings'), wrap(admin.crudDayExperiments.upsert));
router.delete('/day-experiments/:id', requireAdminRole('delete'), wrap(admin.crudDayExperiments.delete));

router.get('/directions', wrap(admin.crudDirections.list));
router.post('/directions', requireAdminRole('settings'), wrap(admin.crudDirections.create));
router.patch('/directions/:id', requireAdminRole('settings'), wrap(admin.crudDirections.update));

router.get('/thematic-tags', wrap(admin.crudThematicTags.list));
router.post('/thematic-tags', requireAdminRole('settings'), wrap(admin.crudThematicTags.create));
router.patch('/thematic-tags/:id', requireAdminRole('settings'), wrap(admin.crudThematicTags.update));
router.delete('/thematic-tags/:id', requireAdminRole('delete'), wrap(admin.crudThematicTags.delete));
router.post('/thematic-tags/merge', requireAdminRole('settings'), wrap(admin.crudThematicTags.merge));

router.get('/program-places', wrap(admin.crudProgramPlaces.list));
router.post('/program-places', requireAdminRole('settings'), wrap(admin.crudProgramPlaces.create));
router.patch('/program-places/:id', requireAdminRole('settings'), wrap(admin.crudProgramPlaces.update));
router.delete('/program-places/:id', requireAdminRole('delete'), wrap(admin.crudProgramPlaces.delete));

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
router.delete('/events/:id', requireAdminRole('delete'), wrap(admin.crudEvents.delete));
router.post('/schedule/publish', requireAdminRole('settings'), wrap(p0.publishScheduleDay));
router.get('/schedule/versions', wrap(p0.listScheduleVersions));

router.get('/tasks', wrap(admin.crudTasks.list));
router.post('/tasks', requireAdminRole('settings'), wrap(admin.crudTasks.create));
router.patch('/tasks/:id', requireAdminRole('settings'), wrap(admin.crudTasks.update));
router.delete('/tasks/:id', requireAdminRole('delete'), wrap(admin.crudTasks.delete));
router.get('/task-submissions', wrap(admin.listAllSubmissions));
router.get('/task-submissions/pending', wrap(admin.listPendingSubmissions));
router.patch('/task-submissions/:id', requireAdminRole('moderate'), wrap(admin.moderateTask));

router.get('/questions', wrap(admin.crudQuestions.list));
router.post('/questions', requireAdminRole('settings'), wrap(admin.crudQuestions.create));
router.patch('/questions/:id', requireAdminRole('settings'), wrap(admin.crudQuestions.update));
router.delete('/questions/:id', requireAdminRole('delete'), wrap(admin.crudQuestions.delete));
router.get('/questions/:id/options', wrap(admin.crudQuestions.listOptions));
router.post('/questions/:id/options', requireAdminRole('settings'), wrap(admin.crudQuestions.addOption));
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

router.get('/materials', wrap(admin.crudMaterials.list));
router.post('/materials', requireAdminRole('settings'), wrap(admin.crudMaterials.create));
router.patch('/materials/:id', requireAdminRole('settings'), wrap(admin.crudMaterials.update));
router.delete('/materials/:id', requireAdminRole('delete'), wrap(admin.crudMaterials.delete));

router.get('/levels-config', wrap(admin.crudLevels.list));
router.post('/levels-config', requireAdminRole('settings'), wrap(admin.crudLevels.upsert));

router.get('/exports/participants', requireAdminRole('export'), wrap(admin.exportParticipants));
router.get('/exports/answers', requireAdminRole('export'), wrap(admin.exportAnswers));
router.get('/exports/piggybank', requireAdminRole('export'), wrap(admin.exportPiggybank));
router.get('/exports/task-submissions', requireAdminRole('export'), wrap(admin.exportTaskSubmissions));
router.get('/exports/exchange', requireAdminRole('export'), wrap(admin.exportExchange));
router.get('/exports/attendance', requireAdminRole('export'), wrap(admin.exportAttendance));
router.get('/exports/points-log', requireAdminRole('export'), wrap(admin.exportPointsLog));
router.get('/exports/day', requireAdminRole('export'), wrap(p0.exportDayWorkbook));
router.get('/analytics/summary', wrap(admin.getAnalyticsSummary));
router.get('/analytics/charts', wrap(admin.getAnalyticsCharts));
router.get('/analytics/dashboards', wrap(p0.getExpandedDashboards));
router.get('/analytics/departure-portrait', wrap(p0.getDeparturePortrait));
router.post('/analytics/recalculate', requireAdminRole('settings'), wrap(admin.triggerAnalyticsRecalc));
router.post('/push/send', requireAdminRole('settings'), wrap(admin.sendManualPush));
router.get('/push/log', wrap(admin.listPushLog));
router.get('/push/templates', wrap(p0.crudPushTemplates.list));
router.post('/push/templates', requireAdminRole('settings'), wrap(p0.crudPushTemplates.create));
router.patch('/push/templates/:id', requireAdminRole('settings'), wrap(p0.crudPushTemplates.update));
router.delete('/push/templates/:id', requireAdminRole('delete'), wrap(p0.crudPushTemplates.delete));
router.get('/push/queue', wrap(p0.listPushQueue));
router.post('/push/queue', requireAdminRole('settings'), wrap(p0.enqueuePush));
router.get('/points-log', wrap(admin.listPointsLog));

router.get('/actions-log', requireAdminRole('users'), wrap(ops.listAdminActions));
router.get('/admin-users', requireAdminRole('users'), wrap(ops.listAdminUsers));
router.get('/rights-matrix', wrap(async (_req, res) => {
  res.json({ matrix: ADMIN_RIGHTS_MATRIX });
}));
router.post('/admin-users', requireAdminRole('users'), wrap(ops.createAdminUser));
router.patch('/admin-users/:id', requireAdminRole('users'), wrap(ops.updateAdminUser));

router.get('/medals', wrap(ops.crudMedals.list));
router.post('/medals', requireAdminRole('settings'), wrap(ops.crudMedals.create));
router.patch('/medals/:id', requireAdminRole('settings'), wrap(ops.crudMedals.update));
router.delete('/medals/:id', requireAdminRole('delete'), wrap(ops.crudMedals.delete));
router.post('/medals/award', requireAdminRole('moderate'), wrap(ops.awardMedal));
router.post('/medals/evaluate', requireAdminRole('settings'), wrap(p0.runMedalEvaluation));

router.post('/qr/generate', requireAdminRole('settings'), wrap(ops.generateEntityQr));
router.post('/qr/download', requireAdminRole('settings'), wrap(p0.generateAndDownloadQr));
router.get('/qr/pack', requireAdminRole('settings'), wrap(p0.getQrPack));
router.post('/participants/:id/points/:logId/revoke', requireAdminRole('settings'), wrap(p0.revokeParticipantPoints));
router.get('/leaderboard', wrap(ops.getLeaderboard));
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
