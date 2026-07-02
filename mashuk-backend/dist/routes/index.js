import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { vkAuthMiddleware } from '../middlewares/vkAuth.js';
import { requireParticipant } from '../middlewares/requireParticipant.js';
import { getMe, register } from '../controllers/authController.js';
import { listDirections } from '../controllers/directionsController.js';
import { getHome, quickPiggybank } from '../controllers/homeController.js';
import { getProgram, getProgramSettings, getRecommendations, markAttendance, getKnowledgeBase, } from '../controllers/programController.js';
import { listTasks, submitTask } from '../controllers/tasksController.js';
import { listForumQuestions, getQuestion, submitAnswer, listExchange, createExchangeQuestion, answerExchange, reactExchangeAnswer, } from '../controllers/questionsController.js';
import { getProfile, listPiggybank, createPiggybank } from '../controllers/profileController.js';
import { uploadPhoto } from '../controllers/uploadController.js';
const router = Router();
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: { error: 'Too many auth requests, please try again later.' },
});
router.get('/directions', listDirections);
router.get('/auth/me', authLimiter, vkAuthMiddleware, getMe);
router.post('/auth/register', authLimiter, vkAuthMiddleware, register);
router.get('/home', vkAuthMiddleware, requireParticipant, getHome);
router.post('/piggybank/quick', vkAuthMiddleware, requireParticipant, quickPiggybank);
router.get('/program/settings', vkAuthMiddleware, requireParticipant, getProgramSettings);
router.get('/program', vkAuthMiddleware, requireParticipant, getProgram);
router.get('/program/recommendations', vkAuthMiddleware, requireParticipant, getRecommendations);
router.get('/program/knowledge-base', vkAuthMiddleware, requireParticipant, getKnowledgeBase);
router.post('/program/events/:eventId/attendance', vkAuthMiddleware, requireParticipant, markAttendance);
router.get('/tasks', vkAuthMiddleware, requireParticipant, listTasks);
router.post('/tasks/:id/submit', vkAuthMiddleware, requireParticipant, submitTask);
router.get('/questions', vkAuthMiddleware, requireParticipant, listForumQuestions);
router.get('/questions/:id', vkAuthMiddleware, requireParticipant, getQuestion);
router.post('/questions/:id/answer', vkAuthMiddleware, requireParticipant, submitAnswer);
router.get('/exchange', vkAuthMiddleware, requireParticipant, listExchange);
router.post('/exchange', vkAuthMiddleware, requireParticipant, createExchangeQuestion);
router.post('/exchange/:id/answer', vkAuthMiddleware, requireParticipant, answerExchange);
router.post('/exchange/answers/:answerId/react', vkAuthMiddleware, requireParticipant, reactExchangeAnswer);
router.get('/profile', vkAuthMiddleware, requireParticipant, getProfile);
router.get('/piggybank', vkAuthMiddleware, requireParticipant, listPiggybank);
router.post('/piggybank', vkAuthMiddleware, requireParticipant, createPiggybank);
router.post('/upload', vkAuthMiddleware, requireParticipant, uploadPhoto);
export default router;
