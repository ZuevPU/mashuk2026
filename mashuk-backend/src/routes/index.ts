import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { vkAuthMiddleware } from '../middlewares/vkAuth.js';
import { requireParticipant } from '../middlewares/requireParticipant.js';
import { adminAuthMiddleware, requireAdminRole } from '../middlewares/adminAuth.js';
import { getMe, register, completeOnboarding, listOnboardingMeta } from '../controllers/authController.js';
import { listDirections } from '../controllers/directionsController.js';
import { getHome, quickPiggybank } from '../controllers/homeController.js';
import { updateExperimentStatus, submitEveningQuestionnaire, patchEveningDraft } from '../controllers/dayStateController.js';
import {
  getProgram, getProgramSettings, getRecommendations, markAttendance, getKnowledgeBase, getKnowledgeBaseDays, saveMaterialToPiggybank,
} from '../controllers/programController.js';
import { listTasks, submitTask, scanTask, resolveTaskQr, teamConfirmSubmission, searchTeammates } from '../controllers/tasksController.js';
import {
  listForumQuestions, getQuestion, submitAnswer,
  listExchange, createExchangeQuestion, answerExchange, reactExchangeAnswer, reactExchangeQuestion,
} from '../controllers/questionsController.js';
import { listActiveExchangeCategories } from '../controllers/exchangeCategoryController.js';
import {
  getProfile, listPiggybank, createPiggybank, updateProfileSettings, deleteMyProfile, getPublicLeaderboard,
  exportPiggybankText, listMyMedals, listMedalsCatalog, synthesizeMyOutcomes, downloadMyProfilePdf,
  getMyShiftResults, regenerateMyQr,
} from '../controllers/profileController.js';
import { uploadPhoto } from '../controllers/uploadController.js';
import { dismissPushBanner, openPushBanner, pushWebhookTrigger } from '../controllers/pushBannerController.js';
import { getActiveConsents } from '../controllers/consentsController.js';
import { listMyOrgThreads, getMyOrgThread, createOrgThread, replyOrgThread } from '../controllers/orgController.js';
import { volunteerConfirm } from '../controllers/volunteerController.js';
import { getMyDelayedSurvey, respondDelayedSurvey } from '../controllers/delayedSurveyController.js';
import { vkBotCallback } from '../controllers/vkBotController.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  message: { error: 'Too many auth requests, please try again later.' },
});

router.get('/directions', listDirections);
router.get('/consents/active', getActiveConsents);

router.get('/auth/me', authLimiter, vkAuthMiddleware, getMe);
router.post('/auth/register', authLimiter, vkAuthMiddleware, register);
router.post('/auth/onboarding', authLimiter, vkAuthMiddleware, completeOnboarding);
router.get('/auth/onboarding-meta', authLimiter, vkAuthMiddleware, listOnboardingMeta);

router.get('/home', vkAuthMiddleware, requireParticipant, getHome);
router.get('/delayed-survey/pending', vkAuthMiddleware, requireParticipant, getMyDelayedSurvey);
router.post('/delayed-survey/:id/respond', vkAuthMiddleware, requireParticipant, respondDelayedSurvey);
router.post('/piggybank/quick', vkAuthMiddleware, requireParticipant, quickPiggybank);
router.post('/day-state/experiment', vkAuthMiddleware, requireParticipant, updateExperimentStatus);
router.post('/day-state/evening', vkAuthMiddleware, requireParticipant, submitEveningQuestionnaire);
router.patch('/day-state/evening/draft', vkAuthMiddleware, requireParticipant, patchEveningDraft);

router.get('/program/settings', vkAuthMiddleware, requireParticipant, getProgramSettings);
router.get('/program', vkAuthMiddleware, requireParticipant, getProgram);
router.get('/program/recommendations', vkAuthMiddleware, requireParticipant, getRecommendations);
router.get('/program/knowledge-base', vkAuthMiddleware, requireParticipant, getKnowledgeBase);
router.get('/program/knowledge-base/days', vkAuthMiddleware, requireParticipant, getKnowledgeBaseDays);
router.post('/program/materials/:id/piggybank', vkAuthMiddleware, requireParticipant, saveMaterialToPiggybank);
router.post('/program/events/:eventId/attendance', vkAuthMiddleware, requireParticipant, markAttendance);

router.get('/tasks', vkAuthMiddleware, requireParticipant, listTasks);
router.post('/tasks/qr/resolve', vkAuthMiddleware, requireParticipant, resolveTaskQr);
router.post('/tasks/scan', vkAuthMiddleware, requireParticipant, scanTask);
router.post('/tasks/:id/submit', vkAuthMiddleware, requireParticipant, submitTask);
router.post('/tasks/submissions/:submissionId/team-confirm', vkAuthMiddleware, requireParticipant, teamConfirmSubmission);
router.get('/participants/teammates-search', vkAuthMiddleware, requireParticipant, searchTeammates);

router.get('/questions', vkAuthMiddleware, requireParticipant, listForumQuestions);
router.get('/questions/:id', vkAuthMiddleware, requireParticipant, getQuestion);
router.post('/questions/:id/answer', vkAuthMiddleware, requireParticipant, submitAnswer);

router.get('/exchange/categories', vkAuthMiddleware, requireParticipant, listActiveExchangeCategories);
router.get('/exchange', vkAuthMiddleware, requireParticipant, listExchange);
router.post('/exchange', vkAuthMiddleware, requireParticipant, createExchangeQuestion);
router.post('/exchange/:id/answer', vkAuthMiddleware, requireParticipant, answerExchange);
router.post('/exchange/:id/react', vkAuthMiddleware, requireParticipant, reactExchangeQuestion);
router.post('/exchange/answers/:answerId/react', vkAuthMiddleware, requireParticipant, reactExchangeAnswer);

router.get('/org/threads', vkAuthMiddleware, requireParticipant, listMyOrgThreads);
router.get('/org/threads/:id', vkAuthMiddleware, requireParticipant, getMyOrgThread);
router.post('/org/threads', vkAuthMiddleware, requireParticipant, createOrgThread);
router.post('/org/threads/:id/reply', vkAuthMiddleware, requireParticipant, replyOrgThread);

router.get('/profile', vkAuthMiddleware, requireParticipant, getProfile);
router.get('/profile/pdf', vkAuthMiddleware, requireParticipant, downloadMyProfilePdf);
router.get('/profile/shift-results', vkAuthMiddleware, requireParticipant, getMyShiftResults);
router.patch('/profile/settings', vkAuthMiddleware, requireParticipant, updateProfileSettings);
router.post('/profile/regenerate-qr', vkAuthMiddleware, requireParticipant, regenerateMyQr);
router.post('/profile/delete', vkAuthMiddleware, requireParticipant, deleteMyProfile);
router.post('/profile/outcomes/synthesize', vkAuthMiddleware, requireParticipant, synthesizeMyOutcomes);
router.get('/profile/medals', vkAuthMiddleware, requireParticipant, listMyMedals);
router.get('/profile/medals/catalog', vkAuthMiddleware, requireParticipant, listMedalsCatalog);
router.get('/leaderboard', vkAuthMiddleware, requireParticipant, getPublicLeaderboard);
router.get('/piggybank', vkAuthMiddleware, requireParticipant, listPiggybank);
router.post('/piggybank', vkAuthMiddleware, requireParticipant, createPiggybank);
router.get('/piggybank/export', vkAuthMiddleware, requireParticipant, exportPiggybankText);

router.post('/upload', vkAuthMiddleware, requireParticipant, uploadPhoto);
router.post('/push-banners/:id/open', vkAuthMiddleware, requireParticipant, openPushBanner);
router.post('/push-banners/:id/dismiss', vkAuthMiddleware, requireParticipant, dismissPushBanner);
router.post('/push/webhook/:token', pushWebhookTrigger);
router.post('/bot/vk', vkBotCallback);

// Volunteer confirm: admin token OR vk staff
router.post('/volunteer/confirm', (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return adminAuthMiddleware(req as never, res, () => {
      requireAdminRole('moderate')(req as never, res, () => volunteerConfirm(req as never, res));
    });
  }
  return vkAuthMiddleware(req as never, res, () => volunteerConfirm(req as never, res));
});

export default router;
