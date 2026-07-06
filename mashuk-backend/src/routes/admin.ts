import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware } from '../middlewares/adminAuth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import * as admin from '../controllers/adminController.js';
import { adminLogin } from '../controllers/adminAuthController.js';

const router = Router();

router.post('/login', asyncHandler(adminLogin));
router.use(adminAuthMiddleware);

const wrap = (fn: Parameters<typeof asyncHandler>[0]): RequestHandler => asyncHandler(fn);

router.get('/participants', wrap(admin.listParticipants));
router.post('/participants', wrap(admin.createParticipant));
router.patch('/participants/:id/direction', wrap(admin.updateParticipantDirection));
router.delete('/participants/:id/registration', wrap(admin.resetRegistration));

router.get('/directions', wrap(admin.crudDirections.list));
router.post('/directions', wrap(admin.crudDirections.create));
router.patch('/directions/:id', wrap(admin.crudDirections.update));

router.get('/thematic-tags', wrap(admin.crudThematicTags.list));
router.post('/thematic-tags', wrap(admin.crudThematicTags.create));
router.patch('/thematic-tags/:id', wrap(admin.crudThematicTags.update));
router.delete('/thematic-tags/:id', wrap(admin.crudThematicTags.delete));

router.get('/forum-settings', wrap(admin.getForumSettings));
router.patch('/forum-settings', wrap(admin.updateForumSettings));
router.get('/day-focus', wrap(admin.listDayFocus));
router.post('/day-focus', wrap(admin.upsertDayFocus));

router.get('/events', wrap(admin.crudEvents.list));
router.post('/events', wrap(admin.crudEvents.create));
router.patch('/events/:id', wrap(admin.crudEvents.update));
router.delete('/events/:id', wrap(admin.crudEvents.delete));

router.get('/tasks', wrap(admin.crudTasks.list));
router.post('/tasks', wrap(admin.crudTasks.create));
router.patch('/tasks/:id', wrap(admin.crudTasks.update));
router.delete('/tasks/:id', wrap(admin.crudTasks.delete));
router.get('/task-submissions', wrap(admin.listAllSubmissions));
router.get('/task-submissions/pending', wrap(admin.listPendingSubmissions));
router.patch('/task-submissions/:id', wrap(admin.moderateTask));

router.get('/questions', wrap(admin.crudQuestions.list));
router.post('/questions', wrap(admin.crudQuestions.create));
router.patch('/questions/:id', wrap(admin.crudQuestions.update));
router.delete('/questions/:id', wrap(admin.crudQuestions.delete));
router.get('/questions/:id/options', wrap(admin.crudQuestions.listOptions));
router.post('/questions/:id/options', wrap(admin.crudQuestions.addOption));
router.delete('/questions/:id/options/:optionId', wrap(admin.crudQuestions.deleteOption));

router.get('/exchange', wrap(admin.listAllExchange));
router.get('/exchange/pending', wrap(admin.listPendingExchange));
router.get('/exchange-answers', wrap(admin.listExchangeAnswers));
router.patch('/exchange/:id', wrap(admin.moderateExchange));

router.get('/event-attendance', wrap(admin.listEventAttendance));

router.get('/materials', wrap(admin.crudMaterials.list));
router.post('/materials', wrap(admin.crudMaterials.create));
router.patch('/materials/:id', wrap(admin.crudMaterials.update));
router.delete('/materials/:id', wrap(admin.crudMaterials.delete));

router.get('/levels-config', wrap(admin.crudLevels.list));
router.post('/levels-config', wrap(admin.crudLevels.upsert));

router.get('/exports/participants', wrap(admin.exportParticipants));
router.get('/exports/answers', wrap(admin.exportAnswers));
router.get('/exports/piggybank', wrap(admin.exportPiggybank));
router.get('/exports/task-submissions', wrap(admin.exportTaskSubmissions));
router.get('/exports/exchange', wrap(admin.exportExchange));
router.get('/exports/attendance', wrap(admin.exportAttendance));
router.get('/exports/points-log', wrap(admin.exportPointsLog));
router.get('/analytics/summary', wrap(admin.getAnalyticsSummary));
router.get('/analytics/charts', wrap(admin.getAnalyticsCharts));
router.post('/analytics/recalculate', wrap(admin.triggerAnalyticsRecalc));
router.post('/push/send', wrap(admin.sendManualPush));
router.get('/push/log', wrap(admin.listPushLog));
router.get('/points-log', wrap(admin.listPointsLog));

export default router;
