import { Response } from 'express';
import { eq, and, or, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  questions, questionOptions, answers, exchangeQuestions, exchangeAnswers, participants, events,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { countWords, getForumSettings, getTouchpointAccess, resolveEffectiveCurrentDay, toTouchpointUiStatus, isSameMoscowCalendarDay } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { emotionIdToZone, EMOTION_ZONE_LABELS } from '../services/emotionZones.js';
import { filterEventsForLessonSlot, lessonSlotIndexForQuestion } from '../services/lessonSlotEvents.js';
import { formatQuestionTimeWindow, getReflectionTypeLabel } from '../services/reflectionTypeLabel.js';
import { resolveAnswerConfirmation } from '../services/answerConfirmation.js';
import { questionVisibleToParticipant, resolveQuestionDayForAccess } from '../services/questionEligibility.js';
import { evaluateMedalsForParticipantDetailed } from '../services/medalEvaluator.js';
import { sendPushNotification } from '../services/pushService.js';

function isPointBQuestion(question: { block?: string | null; reflectionKind?: string | null }): boolean {
  return question.block === 'Точка Б' || question.reflectionKind === 'point_b';
}

function pointsActionForQuestion(question: {
  block?: string | null;
  reflectionKind?: string | null;
  type?: string | null;
  timePoint?: string | null;
}): string {
  if (isPointBQuestion(question)) return 'point_b_complete';
  if (question.type === 'checkin' || question.reflectionKind === 'state_check') {
    const tp = (question.timePoint || '').toLowerCase();
    if (tp.includes('утро')) return 'state_check_morning';
    if (tp.includes('день')) return 'state_check_day';
    if (tp.includes('вечер')) return 'state_check_evening';
  }
  return 'question_answer';
}

async function answerSubmitExtras(participantId: number, settings: Awaited<ReturnType<typeof getForumSettings>>) {
  const newMedals = await evaluateMedalsForParticipantDetailed(participantId);
  const confirm = resolveAnswerConfirmation((settings as { answerConfirmation?: unknown }).answerConfirmation);
  return { newMedals, confirm };
}

function isLessonReflectionQuestion(q: { title?: string | null; block?: string | null }): boolean {
  const t = (q.title || '').toLowerCase();
  return t.includes('осмысление урока') || t.includes('слот 1') || t.includes('слот 2');
}

export const listForumQuestions = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const settings = await getForumSettings();
    const currentDay = resolveEffectiveCurrentDay(settings, now);
    const list = await db.select().from(questions)
      .where(and(
        eq(questions.status, 'published'),
      ));

    const me = req.participant!;
    const visible = list.filter(q =>
      questionVisibleToParticipant(q, me, currentDay));

    const userAnswers = await db.select().from(answers)
      .where(eq(answers.participantId, me.id));
    const answeredIds = new Set(userAnswers.map(a => a.questionId));
    const answerByQuestion = new Map(userAnswers.map(a => [a.questionId, a]));

    const result = visible
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
      .map(q => {
      const dayForAccess = resolveQuestionDayForAccess(q, currentDay);
      const access = getTouchpointAccess(dayForAccess, currentDay, q.closeTime, now, q.publishTime);
      const userAnswer = answerByQuestion.get(q.id);
      const answered = answeredIds.has(q.id);
      const status = toTouchpointUiStatus(access, answered);
      const answeredAt = userAnswer?.createdAt ?? null;
      const pathPointsPreview = q.points && q.points > 0 ? q.points : 5;
      return {
        ...q,
        subtitle: q.subtitle ?? null,
        sortOrder: q.sortOrder ?? 0,
        status,
        access,
        answered,
        answeredAt,
        answeredToday: answered && answeredAt ? isSameMoscowCalendarDay(answeredAt, now) : false,
        reflectionLabel: getReflectionTypeLabel(q),
        timeWindowLabel: formatQuestionTimeWindow(q.publishTime, q.closeTime),
        pathPointsPreview,
      };
    });

    const confirm = resolveAnswerConfirmation((settings as { answerConfirmation?: unknown }).answerConfirmation);
    res.json({ questions: result, currentDay, answerConfirm: confirm });
  } catch (error) {
    console.error('listForumQuestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [question] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!question) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (question.status !== 'published') {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    if (question.isHidden) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const settings = await getForumSettings();
    const currentDay = resolveEffectiveCurrentDay(settings, new Date());
    if (!questionVisibleToParticipant(question, req.participant!, currentDay)) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const options = await db.select().from(questionOptions).where(eq(questionOptions.questionId, id))
      .orderBy(asc(questionOptions.sortOrder));
    let dayEvents: { id: number; title: string; place: string | null; startTime: Date | null }[] = [];
    if (isLessonReflectionQuestion(question) && question.dayNumber) {
      const dayEv = await db.select().from(events).where(eq(events.dayNumber, question.dayNumber));
      const published = dayEv.filter(e => e.isPublished !== false && e.dayPublished !== false);
      dayEvents = filterEventsForLessonSlot(question, published, settings).map(e => ({
        id: e.id,
        title: e.title,
        place: e.place ?? null,
        startTime: e.startTime ?? null,
      }));
    }
    res.json({
      question: {
        ...question,
        requiresLessonPick: isLessonReflectionQuestion(question),
      },
      options,
      dayEvents,
    });
  } catch (error) {
    console.error('getQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitAnswer = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const questionId = Number(req.params.id);
    const { answerData } = req.body;

    const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
    if (!question) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (question.status !== 'published') {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const now = new Date();
    const settings = await getForumSettings();
    const currentDay = resolveEffectiveCurrentDay(settings, now);
    if (question.isHidden || !questionVisibleToParticipant(question, req.participant!, currentDay)) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const dayForAccess = resolveQuestionDayForAccess(question, currentDay);
    const access = getTouchpointAccess(dayForAccess, currentDay, question.closeTime, now, question.publishTime);
    if (access === 'locked' || access === 'soon') {
      res.status(400).json({
        error: access === 'locked'
          ? 'Точка заморожена — день закончился'
          : 'Question not yet available',
        access,
      });
      return;
    }
    // overdue — ещё можно заполнить в текущем дне форума
    if (question.publishTime && question.publishTime > now) {
      res.status(400).json({ error: 'Question not yet published', access: 'soon' });
      return;
    }

    const [existingAnswer] = await db.select().from(answers)
      .where(and(
        eq(answers.participantId, req.participant!.id),
        eq(answers.questionId, questionId),
      )).limit(1);
    if (existingAnswer && !question.allowRetry) {
      res.status(400).json({ error: 'Already answered' });
      return;
    }

    const text = typeof answerData === 'string' ? answerData : JSON.stringify(answerData);
    const wordCount = countWords(text);
    const depthLabel = inferReflectionDepth(
      typeof answerData === 'string' ? answerData : (answerData?.text || text),
    );

    let normalizedAnswer = answerData;
    if (question.type === 'checkin' && answerData && typeof answerData === 'object') {
      const emo = String((answerData as { emotion?: string }).emotion || '');
      const zone = emotionIdToZone(emo);
      normalizedAnswer = {
        ...answerData,
        emotionZone: zone,
        emotionZoneLabel: zone ? EMOTION_ZONE_LABELS[zone] : null,
      };
    }
    if (isLessonReflectionQuestion(question) && answerData && typeof answerData === 'object') {
      const slotIndex = lessonSlotIndexForQuestion(question);
      normalizedAnswer = { ...answerData, slotIndex };
    }

    let answer;
    if (existingAnswer && question.allowRetry) {
      [answer] = await db.update(answers)
        .set({
          answerData: normalizedAnswer,
          wordCount,
          questionTextSnapshot: question.text,
          pointsAwarded: question.points ?? 0,
          createdAt: new Date(),
        })
        .where(eq(answers.id, existingAnswer.id))
        .returning();
    } else {
      [answer] = await db.insert(answers).values({
        participantId: req.participant!.id,
        questionId,
        answerData: normalizedAnswer,
        wordCount,
        questionTextSnapshot: question.text,
        pointsAwarded: question.points ?? 0,
      }).returning();
    }

    if (question.block === 'Целеполагание' && Array.isArray(answerData?.interests)) {
      await db.update(participants)
        .set({ interests: answerData.interests })
        .where(eq(participants.id, req.participant!.id));
    }

    if (question.block === 'Точка Б') {
      const patch: Record<string, unknown> = {};
      if (Array.isArray(answerData?.answers)) {
        patch.pointBAnswers = answerData.answers;
      } else if (typeof answerData === 'string') {
        patch.pointBAnswers = [answerData];
      } else if (answerData && typeof answerData === 'object' && Array.isArray(answerData.answers)) {
        patch.pointBAnswers = answerData.answers;
      } else if (answerData && typeof answerData === 'object') {
        patch.pointBAnswers = answerData;
      }
      if (answerData?.strongRole) patch.strongRole = String(answerData.strongRole);
      if (answerData?.growthRole) patch.growthRole = String(answerData.growthRole);
      if (answerData?.nextExperiment || answerData?.growthWhy) {
        const parts = [
          answerData?.growthWhy ? `Почему роль роста: ${answerData.growthWhy}` : '',
          answerData?.nextExperiment ? String(answerData.nextExperiment) : '',
        ].filter(Boolean);
        patch.nextExperiment = parts.join('\n');
      }
      if (Object.keys(patch).length > 0) {
        await db.update(participants)
          .set(patch as Partial<typeof participants.$inferInsert>)
          .where(eq(participants.id, req.participant!.id));
      }
    }

    const actionType = pointsActionForQuestion(question);
    const forumDay = question.dayNumber ?? undefined;
    const pointsResult = actionType === 'point_b_complete'
      ? await awardPoints(req.participant!.id, 'point_b_complete', undefined, forumDay)
      : await awardPoints(
        req.participant!.id,
        actionType,
        question.points && question.points > 0 ? question.points : undefined,
        forumDay,
      );

    const { newMedals, confirm } = await answerSubmitExtras(req.participant!.id, settings);

    res.json({
      answer,
      reflectionDepth: depthLabel,
      xpAwarded: pointsResult?.awarded ?? 0,
      track: pointsResult?.track ?? 'path',
      newMedals,
      confirm,
    });
  } catch (error) {
    console.error('submitAnswer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listExchange = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const me = req.participant!;
    const list = await db.select({
      q: exchangeQuestions,
      author: participants,
    }).from(exchangeQuestions)
      .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .where(or(
        eq(exchangeQuestions.moderationStatus, 'approved'),
        eq(exchangeQuestions.participantId, me.id),
      ));

    const visible = list.filter(row => {
      if (row.q.participantId === me.id) return true;
      const aud = (row.q.audience || 'all').toLowerCase();
      if (aud === 'direction' || aud === 'my_direction' || aud === 'своему направлению') {
        return !!me.direction && row.author?.direction === me.direction;
      }
      return true;
    });

    const allAnswers = await db.select({
      a: exchangeAnswers,
      author: participants,
    }).from(exchangeAnswers)
      .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id));

    const answersByQuestion = new Map<number, typeof allAnswers>();
    for (const row of allAnswers) {
      const qid = row.a.questionId;
      if (!answersByQuestion.has(qid)) answersByQuestion.set(qid, []);
      answersByQuestion.get(qid)!.push(row);
    }

    res.json({
      questions: visible.map(row => ({
        ...row.q,
        authorName: `${row.author?.firstName ?? ''} ${row.author?.lastName ?? ''}`.trim(),
        direction: row.author?.direction,
        isMine: row.q.participantId === me.id,
        answers: (answersByQuestion.get(row.q.id) || []).map(ar => ({
          id: ar.a.id,
          text: ar.a.text,
          parentAnswerId: ar.a.parentAnswerId,
          authorName: `${ar.author?.firstName ?? ''} ${ar.author?.lastName ?? ''}`.trim(),
          reactions: ar.a.reactions,
          createdAt: ar.a.createdAt,
        })),
      })),
    });
  } catch (error) {
    console.error('listExchange:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createExchangeQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { text, audience } = req.body;
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const aud = audience === 'direction' || audience === 'my_direction' ? 'direction' : 'all';
    const [q] = await db.insert(exchangeQuestions).values({
      participantId: req.participant!.id,
      text,
      audience: aud,
      moderationStatus: 'pending',
    }).returning();

    res.json({ question: q });
  } catch (error) {
    console.error('createExchangeQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const answerExchange = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const questionId = Number(req.params.id);
    const { text, parentAnswerId } = req.body;

    const [question] = await db.select().from(exchangeQuestions)
      .where(eq(exchangeQuestions.id, questionId)).limit(1);
    if (!question || question.moderationStatus !== 'approved') {
      res.status(403).json({ error: 'Question not available' });
      return;
    }

    if (parentAnswerId) {
      const [parent] = await db.select().from(exchangeAnswers)
        .where(eq(exchangeAnswers.id, Number(parentAnswerId))).limit(1);
      if (!parent || parent.questionId !== questionId) {
        res.status(400).json({ error: 'Invalid parentAnswerId' });
        return;
      }
      // Level-2 only: replies to replies are not allowed
      if (parent.parentAnswerId != null) {
        res.status(400).json({ error: 'Можно ответить только на ответ первого уровня' });
        return;
      }
    }

    const [answer] = await db.insert(exchangeAnswers).values({
      questionId,
      participantId: req.participant!.id,
      text,
      parentAnswerId: parentAnswerId ? Number(parentAnswerId) : null,
      reactions: { likes: 0, discuss: 0 },
    }).returning();

    const settings = await getForumSettings();
    const pointsResult = await awardPoints(
      req.participant!.id,
      'exchange_answer',
      undefined,
      resolveEffectiveCurrentDay(settings),
    );
    const { newMedals, confirm } = await answerSubmitExtras(req.participant!.id, settings);

    if (question.participantId !== req.participant!.id) {
      await sendPushNotification(
        [question.participantId],
        'На ваш вопрос в «Обмене опытом» ответили участники',
        'transactional_exchange_answer_received',
      );
    }

    res.json({
      answer,
      xpAwarded: pointsResult?.awarded ?? 0,
      track: pointsResult?.track ?? 'path',
      newMedals,
      confirm,
    });
  } catch (error) {
    console.error('answerExchange:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reactExchangeAnswer = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const answerId = Number(req.params.answerId);
    const { type } = req.body as { type: 'like' | 'discuss' };
    if (!['like', 'discuss'].includes(type)) {
      res.status(400).json({ error: 'Invalid reaction type' });
      return;
    }

    const [existing] = await db.select().from(exchangeAnswers).where(eq(exchangeAnswers.id, answerId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Answer not found' });
      return;
    }

    const reactions = (existing.reactions as { likes?: number; discuss?: number }) || { likes: 0, discuss: 0 };
    if (type === 'like') reactions.likes = (reactions.likes || 0) + 1;
    else reactions.discuss = (reactions.discuss || 0) + 1;

    const [updated] = await db.update(exchangeAnswers)
      .set({ reactions })
      .where(eq(exchangeAnswers.id, answerId))
      .returning();

    res.json({ answer: updated });
  } catch (error) {
    console.error('reactExchangeAnswer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
