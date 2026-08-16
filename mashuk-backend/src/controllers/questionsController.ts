import { Response } from 'express';
import { eq, and, or, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  questions, questionOptions, answers, exchangeQuestions, exchangeAnswers, exchangeCategories,
  participants, events, eventAttendance, scheduleDays,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { toggleExchangeReaction } from '../services/exchangeReactions.js';
import {
  countWords,
  getForumSettings,
  resolveEffectiveCurrentDay,
  resolveParticipantForumDay,
  toTouchpointUiStatus,
  isSameMoscowCalendarDay,
  getMoscowParts,
  getForumOperationalDateKey,
  lateAnswerPolicyForQuestion,
} from '../services/helpers.js';
import {
  isEveningOpenForDay,
  resolveEveningConfigForDay,
} from '../services/eveningQuestionnaireConfig.js';
import { getScheduleDayPublished } from '../services/eveningScheduleGate.js';
import { isEveningTouchpointSlot, questionMatchesTouchpointSlot } from '../services/touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import { awardPoints, pointsActionForQuestion } from '../services/pointsService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { emotionIdToZone, EMOTION_ZONE_LABELS } from '../services/emotionZones.js';
import {
  collectLessonSlotThemes,
  lessonSlotIndexForQuestion,
} from '../services/lessonSlotEvents.js';
import { collectAfterBlocksTree } from '../services/afterBlocksEvents.js';
import {
  afterBlocksPromptAnswerOk,
  composeAfterBlocksReflectionText,
  normalizeAfterBlocksConfig,
} from '../services/afterBlocksConfig.js';
import { formatQuestionTimeWindow, getReflectionTypeLabel } from '../services/reflectionTypeLabel.js';
import { resolveAnswerConfirmation } from '../services/answerConfirmation.js';
import {
  getQuestionAccess,
  questionAudienceAllowsParticipant,
  questionVisibleToParticipant,
  resolveQuestionDayForAccess,
} from '../services/questionEligibility.js';
import { questionMatchesDay } from '../services/questionAdminHelpers.js';
import { evaluateMedalsForParticipantDetailed } from '../services/medalEvaluator.js';
import { sendPushNotification } from '../services/pushService.js';
import { participantAnswerSummary } from '../services/participantAnswerFormat.js';
import {
  buildSuppressedVisibilityKeys,
  isSuppressedByHiddenTwin,
} from '../services/questionVisibilityKeys.js';
import {
  participantCanAnswerExchangeQuestion,
  participantCanViewExchangeQuestion,
} from '../services/exchangeVisibility.js';

async function answerSubmitExtras(participantId: number, settings: Awaited<ReturnType<typeof getForumSettings>>) {
  const newMedals = await evaluateMedalsForParticipantDetailed(participantId);
  const confirm = resolveAnswerConfirmation((settings as { answerConfirmation?: unknown }).answerConfirmation);
  return { newMedals, confirm };
}

function isLessonReflectionQuestion(q: { title?: string | null; block?: string | null }): boolean {
  const t = (q.title || '').toLowerCase();
  return t.includes('осмысление урока') || t.includes('слот 1') || t.includes('слот 2');
}

/** Stub marker for multi-step evening survey (real form lives on Home / eveningCard). */
function isEveningSummaryStubQuestion(q: {
  title?: string | null;
  block?: string | null;
  type?: string | null;
  timePoint?: string | null;
  questionKind?: string | null;
}): boolean {
  const block = (q.block || '').toLowerCase();
  if (block.includes('итоги дня') || /итоговая анкета/i.test(q.title || '')) return true;
  const eveningSlot = TOUCHPOINT_SLOTS.find(s => isEveningTouchpointSlot(s));
  if (!eveningSlot) return false;
  return questionMatchesTouchpointSlot({
    title: q.title || '',
    type: q.type || '',
    block: q.block || '',
    timePoint: q.timePoint || null,
    questionKind: q.questionKind || null,
  }, eveningSlot);
}

async function participantForumDayForShift(
  settings: Awaited<ReturnType<typeof getForumSettings>>,
  shiftId: number,
  now = new Date(),
): Promise<number> {
  const publishedDayRows = await db.select({ dayNumber: scheduleDays.dayNumber })
    .from(scheduleDays)
    .where(and(
      eq(scheduleDays.shiftId, shiftId),
      eq(scheduleDays.isPublished, true),
    ));
  return resolveParticipantForumDay(
    settings,
    publishedDayRows.map(r => r.dayNumber),
    now,
  );
}

export const listForumQuestions = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const me = req.participant!;
    const shiftId = me.shiftId;
    const settings = await getForumSettings(shiftId);
    const { getShiftById, isShiftLive } = await import('../services/shiftService.js');
    if (!isShiftLive(await getShiftById(shiftId))) {
      res.json({ questions: [], currentDay: 1, answerConfirm: null, shiftLive: false });
      return;
    }
    const currentDay = await participantForumDayForShift(settings, shiftId, now);
    const [userAnswers, userAttendance] = await Promise.all([
      db.select().from(answers).where(eq(answers.participantId, me.id)),
      db.select({ eventId: eventAttendance.eventId }).from(eventAttendance).where(eq(eventAttendance.participantId, me.id)),
    ]);
    const answeredIds = new Set(userAnswers.map(a => a.questionId));
    const answeredIdList = [...answeredIds];
    const list = await db.select().from(questions)
      .where(and(
        eq(questions.shiftId, shiftId),
        answeredIdList.length
          ? or(eq(questions.status, 'published'), inArray(questions.id, answeredIdList))
          : eq(questions.status, 'published'),
      ));
    const answerByQuestion = new Map(userAnswers.map(a => [a.questionId, a]));
    const attendedEventIds = new Set(userAttendance.map(a => a.eventId));

    // Answered (any day) for «Мои ответы»; unanswered only for today's forum day.
    // Скрытые админом (`isHidden`) и их близнецы не отдаём для новых ответов.
    const suppressedKeys = buildSuppressedVisibilityKeys(list);
    const visible = list.filter(q => {
      if (answeredIds.has(q.id)) {
        return questionAudienceAllowsParticipant(q, me);
      }
      if (isSuppressedByHiddenTwin(q, suppressedKeys)) {
        return false;
      }
      // Не тянем весь хвост прошлых дней, но оставляем вчерашний день (D−1)
      // для досдачи — иначе при переходе D3→D4 точки D3 пропадают с нулями.
      const yesterday = currentDay > 1 ? currentDay - 1 : null;
      const onToday = questionMatchesDay(q, currentDay);
      const onYesterday = yesterday != null && questionMatchesDay(q, yesterday);
      if (!onToday && !onYesterday
        && q.block !== 'Точка Б'
        && q.dayNumber !== 8) {
        return false;
      }
      return questionVisibleToParticipant(q, me, currentDay, { attendedEventIds });
    });

    const eveningCfg = resolveEveningConfigForDay(settings as never, currentDay);
    const scheduleDayPublished = await getScheduleDayPublished(
      currentDay,
      typeof (settings as { shiftId?: number }).shiftId === 'number'
        ? (settings as { shiftId: number }).shiftId
        : undefined,
    );
    const eveningOpenNow = isEveningOpenForDay(eveningCfg, currentDay, now, {
      settings: settings as never,
      scheduleDayPublished,
    });

    const result = visible
      .map(q => {
      let access = getQuestionAccess(q, currentDay, now);
      const opKey = getForumOperationalDateKey(now);
      if (q.publishTime) {
        const pubKey = getMoscowParts(q.publishTime).dateKey;
        if (pubKey > opKey) access = 'soon';
      }
      // Evening stub follows admin opensAt / force flags, not only question.publishTime
      // (publishTime is often missing → stub looked "active" all morning).
      if (!answeredIds.has(q.id) && isEveningSummaryStubQuestion(q) && !eveningOpenNow) {
        access = 'soon';
      }
      const userAnswer = answerByQuestion.get(q.id);
      const answered = answeredIds.has(q.id);
      const status = toTouchpointUiStatus(access, answered);
      const answeredAt = userAnswer?.createdAt ?? null;
      // Respect admin field as-is (0 = no points). Only fall back when points is null.
      const pathPointsPreview = typeof q.points === 'number' ? q.points : 5;
      const preview = answered && userAnswer
        ? participantAnswerSummary(userAnswer.answerData, q.type)
        : '';
      const latePolicy = lateAnswerPolicyForQuestion(q);
      return {
        ...q,
        publishStatus: q.status,
        subtitle: q.subtitle ?? null,
        sortOrder: q.sortOrder ?? 0,
        status,
        access,
        latePolicy,
        answered,
        answeredAt,
        answeredToday: answered && answeredAt ? isSameMoscowCalendarDay(answeredAt, now) : false,
        answerPreview: preview ? preview.slice(0, 320) : null,
        reflectionLabel: getReflectionTypeLabel(q),
        timeWindowLabel: formatQuestionTimeWindow(q.publishTime, q.closeTime),
        pathPointsPreview,
      };
    })
      .filter(q => {
        // Unpublished stays only for «Мои ответы»; never in the open feed.
        if (q.publishStatus !== 'published') return q.answered;
        // Unanswered evening stub is never listed — real UI is Home/Questions eveningCard at opensAt.
        if (isEveningSummaryStubQuestion(q)) return false;
        if (q.access === 'soon') return false;
        // Locked = окно/день закрыты — не показываем ни «Заморожено», ни просрочку после closeTime.
        if (q.access === 'locked') return false;
        if (q.access === 'overdue' && q.closeTime && new Date(q.closeTime).getTime() < now.getTime()) {
          return false;
        }
        const sw = q.showWhen as { questionId?: number; optionValues?: string[] } | null;
        if (sw?.questionId && Array.isArray(sw.optionValues) && sw.optionValues.length) {
          const parentAns = answerByQuestion.get(sw.questionId);
          if (!parentAns) return false;
          const data = parentAns.answerData as Record<string, unknown> | null;
          const choice = typeof data?.choice === 'string' ? data.choice : null;
          const choices = Array.isArray(data?.choices) ? data.choices.map(String) : [];
          const hit = sw.optionValues.some(v =>
            (choice != null && choice === v)
            || choices.includes(v)
            || (v === '__other__' && choice === '__other__'),
          );
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0) || a.id - b.id);

    const confirm = resolveAnswerConfirmation((settings as { answerConfirmation?: unknown }).answerConfirmation);
    res.json({ questions: result, currentDay, answerConfirm: confirm, shiftLive: true });
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
    const [existingAnswer, userAttendance] = await Promise.all([
      db.select().from(answers)
        .where(and(
          eq(answers.participantId, req.participant!.id),
          eq(answers.questionId, id),
        )).limit(1)
        .then(rows => rows[0] ?? null),
      db.select({ eventId: eventAttendance.eventId }).from(eventAttendance).where(eq(eventAttendance.participantId, req.participant!.id)),
    ]);
    const hasOwnAnswer = !!existingAnswer;
    if (question.status !== 'published' && !hasOwnAnswer) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    if (!hasOwnAnswer) {
      if (question.isHidden === true) {
        res.status(403).json({ error: 'Question hidden by organizers' });
        return;
      }
      const siblings = await db.select({
        id: questions.id,
        title: questions.title,
        type: questions.type,
        block: questions.block,
        timePoint: questions.timePoint,
        questionKind: questions.questionKind,
        reflectionKind: questions.reflectionKind,
        dayNumber: questions.dayNumber,
        dayNumbers: questions.dayNumbers,
        isHidden: questions.isHidden,
      }).from(questions).where(and(
        eq(questions.status, 'published'),
        question.shiftId != null ? eq(questions.shiftId, question.shiftId) : eq(questions.id, question.id),
      ));
      if (isSuppressedByHiddenTwin(question, buildSuppressedVisibilityKeys(siblings))) {
        res.status(403).json({ error: 'Question hidden by organizers' });
        return;
      }
    }
    const settings = await getForumSettings(req.participant!.shiftId);
    const shiftId = question.shiftId ?? req.participant!.shiftId;
    if (question.shiftId && question.shiftId !== req.participant!.shiftId) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const { getShiftById, isShiftLive } = await import('../services/shiftService.js');
    if (!isShiftLive(await getShiftById(req.participant!.shiftId)) && !hasOwnAnswer) {
      res.status(403).json({ error: 'Смена ещё не активирована' });
      return;
    }
    const currentDay = await participantForumDayForShift(settings, shiftId, new Date());
    const attendedEventIds = new Set(userAttendance.map(a => a.eventId));

    // Свой ответ можно открыть даже если день вопроса уже прошёл
    if (hasOwnAnswer) {
      if (!questionAudienceAllowsParticipant(question, req.participant!)) {
        res.status(403).json({ error: 'Question not available' });
        return;
      }
    } else if (!questionVisibleToParticipant(question, req.participant!, currentDay, { attendedEventIds })) {
      res.status(403).json({ error: 'Question not available' });
      return;
    } else if (question.publishTime && question.publishTime > new Date()) {
      res.status(400).json({ error: 'Question not yet published', access: 'soon' });
      return;
    }
    const options = await db.select().from(questionOptions).where(eq(questionOptions.questionId, id))
      .orderBy(asc(questionOptions.sortOrder));
    let dayEvents: {
      id: number;
      title: string;
      place: string | null;
      startTime: Date | null;
      endTime: Date | null;
    }[] = [];
    let afterBlocksEvents: {
      id: number;
      title: string;
      place: string | null;
      startTime: Date | null;
      endTime: Date | null;
      children: {
        id: number;
        title: string;
        place: string | null;
        startTime: Date | null;
        endTime: Date | null;
      }[];
    }[] = [];
    let lessonPickMeta: {
      programThemeCount: number;
      emptyReason: 'none' | 'none_in_program' | 'none_conducted_yet';
    } | null = null;

    const isLessonRef = isLessonReflectionQuestion(question);
    const hasLinkedEvents = Array.isArray(question.linkedEventIds) && question.linkedEventIds.length > 0;
    const isAfterBlocks = question.questionKind === 'after_blocks' || question.reflectionKind === 'after_blocks';

    if ((isLessonRef || hasLinkedEvents || isAfterBlocks) && question.dayNumber) {
      const shiftId = question.shiftId ?? req.participant!.shiftId;
      const dayEv = await db.select().from(events).where(and(
        eq(events.dayNumber, question.dayNumber),
        eq(events.shiftId, shiftId),
      ));
      const published = dayEv.filter(e => e.isPublished !== false && e.dayPublished !== false);

      if (isAfterBlocks) {
        const tree = collectAfterBlocksTree(
          published,
          question.linkedEventIds,
          settings,
          new Date(),
        );
        afterBlocksEvents = tree.events;
        // Flat leaves for older clients
        dayEvents = tree.events.flatMap(ev => (
          ev.children.length > 0
            ? ev.children.map(c => ({
              id: c.id,
              title: c.title,
              place: c.place,
              startTime: c.startTime,
              endTime: c.endTime,
            }))
            : [{
              id: ev.id,
              title: ev.title,
              place: ev.place,
              startTime: ev.startTime,
              endTime: ev.endTime,
            }]
        ));
        lessonPickMeta = {
          programThemeCount: tree.programBlockCount,
          emptyReason: afterBlocksEvents.length > 0
            ? 'none'
            : (tree.programBlockCount > 0 ? 'none_conducted_yet' : 'none_in_program'),
        };
      } else {
        const collected = collectLessonSlotThemes(question, published, settings, new Date());
        let items = collected.items;
        if (hasLinkedEvents) {
          const allLinkedThemes = new Set<number>();
          const byParent = new Map<number, number[]>();
          dayEv.forEach(e => {
            if (e.parentEventId) {
              const list = byParent.get(e.parentEventId) || [];
              list.push(e.id);
              byParent.set(e.parentEventId, list);
            }
          });
          const collectIds = (id: number) => {
            allLinkedThemes.add(id);
            (byParent.get(id) || []).forEach(collectIds);
          };
          question.linkedEventIds!.forEach(collectIds);
          items = items.filter(e => allLinkedThemes.has(e.id));
        }
        dayEvents = items.map(e => ({
          id: e.id,
          title: e.title,
          place: e.place ?? null,
          startTime: e.startTime ?? null,
          endTime: e.endTime ?? null,
        }));
        lessonPickMeta = {
          programThemeCount: hasLinkedEvents ? question.linkedEventIds!.length : collected.programThemeCount,
          emptyReason: dayEvents.length > 0
            ? 'none'
            : (collected.programThemeCount > 0 ? 'none_conducted_yet' : 'none_in_program'),
        };
      }
    }
    const isPracticesVote = question.questionKind === 'practices_vote'
      || question.answerType === 'practices_vote'
      || question.type === 'practices_vote';
    let practicesVote: ReturnType<typeof import('../services/practicesVoteConfig.js').practicesConfigForParticipant> | null = null;
    if (isPracticesVote) {
      const { normalizePracticesConfig, practicesConfigForParticipant } = await import('../services/practicesVoteConfig.js');
      practicesVote = practicesConfigForParticipant(normalizePracticesConfig(question.practicesConfig));
    }

    res.json({
      question: {
        ...question,
        requiresLessonPick: isLessonRef || hasLinkedEvents || isAfterBlocks,
        // Practices vote is one-shot — never expose retry to the client.
        allowRetry: isPracticesVote ? false : (question.allowRetry ?? false),
        practicesConfig: practicesVote,
        ...(isAfterBlocks ? {
          afterBlocksConfig: normalizeAfterBlocksConfig(question.afterBlocksConfig, question.text),
        } : {}),
      },
      options,
      dayEvents,
      afterBlocksEvents,
      lessonPickMeta,
      myAnswer: existingAnswer ? {
        answerData: existingAnswer.answerData,
        createdAt: existingAnswer.createdAt,
        preview: participantAnswerSummary(existingAnswer.answerData, question.type),
      } : null,
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
    const settings = await getForumSettings(req.participant!.shiftId);
    const shiftId = question.shiftId ?? req.participant!.shiftId;
    if (question.shiftId && question.shiftId !== req.participant!.shiftId) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    const { getShiftById, isShiftLive } = await import('../services/shiftService.js');
    if (!isShiftLive(await getShiftById(req.participant!.shiftId))) {
      res.status(403).json({ error: 'Смена ещё не активирована' });
      return;
    }
    const currentDay = await participantForumDayForShift(settings, shiftId, now);
    const access = getQuestionAccess(question, currentDay, now);
    const latePolicy = lateAnswerPolicyForQuestion(question);
    if (access === 'locked' || access === 'soon') {
      res.status(400).json({
        error: access === 'locked'
          ? (latePolicy === 'hard_close'
            ? 'Время ответа на проверку состояния закончилось'
            : latePolicy === 'until_midnight'
              ? 'Время ответа закончилось (можно было до 00:00)'
              : latePolicy === 'until_admin'
                ? 'Вопрос больше недоступен'
                : 'Точка заморожена — день закончился')
          : 'Question not yet available',
        access,
      });
      return;
    }
    if (question.isHidden === true) {
      res.status(403).json({ error: 'Question hidden by organizers' });
      return;
    }
    // Близнец скрытого вопроса (тот же слот/день) тоже нельзя отвечать
    {
      const siblings = await db.select({
        id: questions.id,
        title: questions.title,
        type: questions.type,
        block: questions.block,
        timePoint: questions.timePoint,
        questionKind: questions.questionKind,
        reflectionKind: questions.reflectionKind,
        dayNumber: questions.dayNumber,
        dayNumbers: questions.dayNumbers,
        isHidden: questions.isHidden,
      }).from(questions).where(and(
        eq(questions.status, 'published'),
        question.shiftId != null ? eq(questions.shiftId, question.shiftId) : eq(questions.id, question.id),
      ));
      const suppressed = buildSuppressedVisibilityKeys(siblings);
      if (isSuppressedByHiddenTwin(question, suppressed)) {
        res.status(403).json({ error: 'Question hidden by organizers' });
        return;
      }
    }
    if (!questionVisibleToParticipant(question, req.participant!, currentDay)) {
      res.status(403).json({ error: 'Question not available' });
      return;
    }
    // overdue — ещё можно (осмысление до 00:00; прочие — до смены дня форума)
    if (question.publishTime && question.publishTime > now) {
      res.status(400).json({ error: 'Question not yet published', access: 'soon' });
      return;
    }

    const [existingAnswer] = await db.select().from(answers)
      .where(and(
        eq(answers.participantId, req.participant!.id),
        eq(answers.questionId, questionId),
      )).limit(1);
    const isPracticesVoteEarly = question.questionKind === 'practices_vote'
      || question.answerType === 'practices_vote'
      || question.type === 'practices_vote';
    // One vote per participant — no edits after save (ignore allowRetry for practices).
    if (existingAnswer && isPracticesVoteEarly) {
      res.status(400).json({ error: 'Вы уже проголосовали' });
      return;
    }
    const canRetry = !!question.allowRetry && !isPracticesVoteEarly;
    if (existingAnswer && !canRetry) {
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
      const reasonRaw = (answerData as { reason?: unknown }).reason;
      const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
      if (reason.length < 15) {
        res.status(400).json({
          error: 'Напишите короткий комментарий, с чем связано состояние (хотя бы пару слов)',
        });
        return;
      }
      normalizedAnswer = {
        ...answerData,
        reason: reason.slice(0, 500),
        emotionZone: zone,
        emotionZoneLabel: zone ? EMOTION_ZONE_LABELS[zone] : null,
      };
    }

    const isPracticesVote = question.questionKind === 'practices_vote'
      || question.answerType === 'practices_vote'
      || question.type === 'practices_vote';
    if (isPracticesVote) {
      const { normalizePracticesConfig, validatePracticesVote } = await import('../services/practicesVoteConfig.js');
      const config = normalizePracticesConfig(question.practicesConfig);
      if (config.resultsPublished) {
        res.status(400).json({ error: 'Голосование закрыто — результаты уже опубликованы' });
        return;
      }
      const validated = validatePracticesVote(answerData, config);
      if (!validated.ok) {
        res.status(400).json({ error: validated.error });
        return;
      }
      normalizedAnswer = { likedPracticeIds: validated.likedPracticeIds };
    }

    const isLessonRef = isLessonReflectionQuestion(question);
    const hasLinkedEvents = Array.isArray(question.linkedEventIds) && question.linkedEventIds.length > 0;
    const isAfterBlocks = question.questionKind === 'after_blocks' || question.reflectionKind === 'after_blocks';

    if ((isLessonRef || hasLinkedEvents || isAfterBlocks) && answerData && typeof answerData === 'object') {
      const slotIndex = lessonSlotIndexForQuestion(question);
      const payload = answerData as {
        eventId?: unknown;
        eventTitle?: unknown;
        parentEventId?: unknown;
        parentEventTitle?: unknown;
        text?: unknown;
        reflections?: unknown;
      };

      const reflectionsRaw = Array.isArray(payload.reflections) ? payload.reflections : null;
      const afterBlocksCfg = isAfterBlocks
        ? normalizeAfterBlocksConfig(question.afterBlocksConfig, question.text)
        : null;
      const reflectionTextsFromMulti = reflectionsRaw
        ? reflectionsRaw.map((raw) => {
          if (!raw || typeof raw !== 'object') return '';
          const row = raw as { text?: unknown; answers?: unknown };
          if (afterBlocksCfg && row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)) {
            return composeAfterBlocksReflectionText(
              afterBlocksCfg.prompts,
              row.answers as Record<string, unknown>,
            );
          }
          const t = row.text;
          return typeof t === 'string' ? t.trim() : '';
        })
        : [];
      const reflectionText = typeof payload.text === 'string'
        ? payload.text.trim()
        : (reflectionTextsFromMulti[0] || '');

      if (isAfterBlocks && afterBlocksCfg && reflectionsRaw && reflectionsRaw.length > 0) {
        const invalid = reflectionsRaw.some((raw) => {
          if (!raw || typeof raw !== 'object') return true;
          const answersMap = (raw as { answers?: unknown }).answers;
          const map = answersMap && typeof answersMap === 'object' && !Array.isArray(answersMap)
            ? answersMap as Record<string, unknown>
            : { [afterBlocksCfg.prompts[0].id]: (raw as { text?: unknown }).text };
          return afterBlocksCfg.prompts.some(p => !afterBlocksPromptAnswerOk(p, map[p.id]));
        });
        if (invalid) {
          res.status(400).json({
            error: 'Ответьте на каждый вопрос по выбранной подтеме',
          });
          return;
        }
      } else if (isAfterBlocks && reflectionsRaw && reflectionsRaw.length > 0) {
        if (reflectionTextsFromMulti.some(t => t.length < 20)) {
          res.status(400).json({
            error: 'Напишите осмысленный ответ по каждой выбранной подтеме (хотя бы пару предложений)',
          });
          return;
        }
      } else if (reflectionText.length < 20) {
        res.status(400).json({
          error: isAfterBlocks
            ? 'Напишите осмысленный ответ (хотя бы пару предложений)'
            : 'Напишите осмысленный ответ по выбранному уроку (хотя бы пару предложений)',
        });
        return;
      }

      if (question.dayNumber) {
        const shiftId = question.shiftId ?? req.participant!.shiftId;
        const dayEv = await db.select().from(events).where(and(
          eq(events.dayNumber, question.dayNumber),
          eq(events.shiftId, shiftId),
        ));
        const published = dayEv.filter(e => e.isPublished !== false && e.dayPublished !== false);

        if (isAfterBlocks) {
          const tree = collectAfterBlocksTree(published, question.linkedEventIds, settings, now);
          if (tree.programBlockCount > 0 && tree.events.length === 0) {
            res.status(400).json({
              error: 'События программы, к которым привязан вопрос, ещё не начались',
            });
            return;
          }
          if (tree.allowedLeafIds.length > 0) {
            const parentEventIdRaw = payload.parentEventId;
            const parentEventId = parentEventIdRaw == null || parentEventIdRaw === ''
              ? null
              : Number(parentEventIdRaw);

            type LeafPick = {
              id: number;
              title: string;
              place?: string | null;
              startTime?: Date | string | null;
              endTime?: Date | string | null;
            };

            const resolveLeaf = (parentNode: typeof tree.events[number], eventId: number): LeafPick | undefined => (
              parentNode.children.length > 0
                ? parentNode.children.find(c => c.id === eventId)
                : (parentNode.id === eventId
                  ? {
                    id: parentNode.id,
                    title: parentNode.title,
                    place: parentNode.place,
                    startTime: parentNode.startTime,
                    endTime: parentNode.endTime,
                  }
                  : undefined)
            );

            const requestedItems: { eventId: number; text: string }[] = reflectionsRaw && reflectionsRaw.length > 0
              ? reflectionsRaw.map((raw, idx) => {
                const o = raw && typeof raw === 'object' ? raw as { eventId?: unknown; text?: unknown } : {};
                return {
                  eventId: Number(o.eventId),
                  text: reflectionTextsFromMulti[idx] || '',
                };
              })
              : [{ eventId: Number(payload.eventId), text: reflectionText }];

            if (requestedItems.some(item => !Number.isFinite(item.eventId))) {
              res.status(400).json({
                error: 'Выберите подтему из списка для этого события',
              });
              return;
            }

            const uniqueIds = new Set(requestedItems.map(i => i.eventId));
            if (uniqueIds.size !== requestedItems.length) {
              res.status(400).json({
                error: 'Выберите разные подтемы без повторов',
              });
              return;
            }

            const firstEventId = requestedItems[0].eventId;
            const parentNode = parentEventId != null
              ? tree.events.find(e => e.id === parentEventId)
              : tree.events.find(e => (
                e.id === firstEventId
                || e.children.some(c => c.id === firstEventId)
              ));

            if (!parentNode) {
              res.status(400).json({
                error: 'Выберите событие программы, где вы были',
              });
              return;
            }

            const resolved: { leaf: LeafPick; text: string }[] = [];
            for (const item of requestedItems) {
              const leaf = resolveLeaf(parentNode, item.eventId);
              if (!leaf || !tree.allowedLeafIds.includes(leaf.id)) {
                res.status(400).json({
                  error: 'Выберите подтему из списка для этого события',
                });
                return;
              }
              resolved.push({ leaf, text: item.text });
            }

            const first = resolved[0];
            normalizedAnswer = {
              parentEventId: parentNode.id,
              parentEventTitle: parentNode.title,
              eventId: first.leaf.id,
              eventTitle: first.leaf.title,
              text: first.text,
              reflections: resolved.map(r => ({
                eventId: r.leaf.id,
                eventTitle: r.leaf.title,
                text: r.text,
              })),
              slotIndex,
            };
          } else {
            normalizedAnswer = {
              parentEventId: null,
              parentEventTitle: null,
              eventId: null,
              eventTitle: null,
              text: reflectionText,
              reflections: reflectionText
                ? [{ eventId: null, eventTitle: null, text: reflectionText }]
                : [],
              slotIndex,
            };
          }
        } else {
          const collected = collectLessonSlotThemes(question, published, settings, now);
          let allowed = collected.items;
          if (hasLinkedEvents) {
            const allLinkedThemes = new Set<number>();
            const byParent = new Map<number, number[]>();
            dayEv.forEach(e => {
              if (e.parentEventId) {
                const list = byParent.get(e.parentEventId) || [];
                list.push(e.id);
                byParent.set(e.parentEventId, list);
              }
            });
            const collectIds = (id: number) => {
              allLinkedThemes.add(id);
              (byParent.get(id) || []).forEach(collectIds);
            };
            question.linkedEventIds!.forEach(collectIds);
            allowed = allowed.filter(e => allLinkedThemes.has(e.id));
          }

          if (collected.programThemeCount > 0 && allowed.length === 0 && !isLessonRef) {
            res.status(400).json({
              error: 'Уроки, к которым привязан этот вопрос, ещё не начались',
            });
            return;
          }

          if (allowed.length > 0) {
            const eventId = Number(payload.eventId);
            const picked = allowed.find(e => e.id === eventId);
            if (!picked) {
              res.status(400).json({
                error: 'Выберите урок из предложенного списка проведённых тем',
              });
              return;
            }
            normalizedAnswer = {
              ...answerData,
              eventId: picked.id,
              eventTitle: picked.title,
              text: reflectionText,
              slotIndex,
            };
          } else {
            normalizedAnswer = { ...answerData, text: reflectionText, slotIndex };
          }
        }
      } else {
        normalizedAnswer = { ...answerData, text: reflectionText, slotIndex };
      }
    }

    let answer;
    if (existingAnswer && question.allowRetry) {
      [answer] = await db.update(answers)
        .set({
          answerData: normalizedAnswer,
          wordCount,
          questionTextSnapshot: question.text,
          pointsAwarded: 0,
          createdAt: new Date(),
        })
        .where(eq(answers.id, existingAnswer.id))
        .returning();
    } else {
      // Omit pointsLogId on insert — column may be missing until migration repair runs.
      [answer] = await db.insert(answers).values({
        participantId: req.participant!.id,
        questionId,
        answerData: normalizedAnswer,
        wordCount,
        questionTextSnapshot: question.text,
        pointsAwarded: 0,
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
    // Attribute XP / day-complete bonus to the live forum day being answered,
    // not the template's first dayNumber (multi-day copies often keep dayNumber=1).
    const forumDay = resolveQuestionDayForAccess(question, currentDay);
    // Pass numeric points including 0 so catalog default is not used when admin set 0.
    const pointsOverride = typeof question.points === 'number' ? question.points : undefined;
    const pointsResult = actionType === 'point_b_complete'
      ? await awardPoints(req.participant!.id, 'point_b_complete', undefined, forumDay)
      : await awardPoints(
        req.participant!.id,
        actionType,
        pointsOverride,
        forumDay,
      );

    const xpAwarded = pointsResult?.awarded ?? 0;
    if (!pointsResult && (typeof question.points === 'number' ? question.points : 5) > 0) {
      console.warn(
        `submitAnswer: no points awarded for question=${questionId} participant=${req.participant!.id} action=${actionType}`,
      );
    }
    if (answer) {
      try {
        [answer] = await db.update(answers)
          .set({
            pointsAwarded: xpAwarded,
            ...(pointsResult?.logId ? { pointsLogId: pointsResult.logId } : {}),
          })
          .where(eq(answers.id, answer.id))
          .returning();
      } catch (err) {
        // Schema lag (answers.points_log_id): still persist awarded total so admin/card show XP.
        console.warn('submitAnswer: pointsLogId update failed, falling back:', err);
        [answer] = await db.update(answers)
          .set({ pointsAwarded: xpAwarded })
          .where(eq(answers.id, answer.id))
          .returning();
      }
    }

    const { newMedals, confirm } = await answerSubmitExtras(req.participant!.id, settings);

    res.json({
      answer,
      reflectionDepth: depthLabel,
      xpAwarded,
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
    const { getExchangeLimitsForParticipant } = await import('../services/exchangeLimits.js');

    const categoryCsv = String(req.query.category || '').trim();
    const directionCsv = String(req.query.direction || '').trim();
    const audienceFilter = String(req.query.audience || '').trim().toLowerCase();
    const sort = String(req.query.sort || 'new').trim().toLowerCase();
    const feed = String(req.query.feed || 'main').trim().toLowerCase(); // main | smalltalk | mine
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const cursorRaw = String(req.query.cursor || '').trim();
    let cursorCreatedAt: Date | null = null;
    let cursorId: number | null = null;
    if (cursorRaw.includes(':')) {
      const [ts, idPart] = cursorRaw.split(':');
      const d = new Date(ts);
      const id = Number(idPart);
      if (!Number.isNaN(d.getTime()) && Number.isFinite(id)) {
        cursorCreatedAt = d;
        cursorId = id;
      }
    }

    const categoryIds = categoryCsv
      ? categoryCsv.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
      : [];
    const directions = directionCsv
      ? directionCsv.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const list = await db.select({
      q: exchangeQuestions,
      author: participants,
      category: exchangeCategories,
    }).from(exchangeQuestions)
      .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .leftJoin(exchangeCategories, eq(exchangeQuestions.categoryId, exchangeCategories.id))
      .where(and(
        or(
          eq(exchangeQuestions.moderationStatus, 'approved'),
          eq(exchangeQuestions.participantId, me.id),
        ),
        or(
          eq(exchangeQuestions.participantId, me.id),
          eq(participants.shiftId, me.shiftId),
        ),
      ));

    let visible = list.filter(row =>
      participantCanViewExchangeQuestion(row.q, me, row.author));

    if (feed === 'smalltalk') {
      visible = visible.filter(row => row.category?.slug === 'smalltalk');
    } else if (feed === 'mine') {
      visible = visible.filter(row => row.q.participantId === me.id);
    } else {
      // main feed: never show smalltalk (even own — they appear in mine / smalltalk)
      visible = visible.filter(row => row.category?.slug !== 'smalltalk');
    }

    if (categoryIds.length) {
      visible = visible.filter(row => row.q.categoryId != null && categoryIds.includes(row.q.categoryId));
    }
    if (directions.length) {
      const set = new Set(directions.map(d => d.toLowerCase()));
      visible = visible.filter(row => set.has(String(row.author?.direction || '').toLowerCase()));
    }
    if (audienceFilter === 'all' || audienceFilter === 'direction') {
      visible = visible.filter(row => {
        const aud = (row.q.audience || 'all').toLowerCase();
        const isDir = aud === 'direction' || aud === 'my_direction';
        return audienceFilter === 'direction' ? isDir : !isDir;
      });
    }

    const answerCounts = new Map<number, number>();
    if (visible.length) {
      const ids = visible.map(v => v.q.id);
      const countRows = await db.select({
        questionId: exchangeAnswers.questionId,
        c: sql<number>`count(*)::int`,
      }).from(exchangeAnswers)
        .where(and(
          inArray(exchangeAnswers.questionId, ids),
          sql`${exchangeAnswers.parentAnswerId} is null`,
        ))
        .groupBy(exchangeAnswers.questionId);
      for (const row of countRows) answerCounts.set(row.questionId, Number(row.c) || 0);
    }

    const sorted = [...visible].sort((a, b) => {
      if (sort === 'unanswered') {
        const ca = answerCounts.get(a.q.id) || 0;
        const cb = answerCounts.get(b.q.id) || 0;
        if (ca !== cb) return ca - cb;
      }
      if (sort === 'popular') {
        const ra = (a.q.reactions as { likes?: number } | null)?.likes || 0;
        const rb = (b.q.reactions as { likes?: number } | null)?.likes || 0;
        if (rb !== ra) return rb - ra;
      }
      const ta = a.q.createdAt ? new Date(a.q.createdAt).getTime() : 0;
      const tb = b.q.createdAt ? new Date(b.q.createdAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return b.q.id - a.q.id;
    });

    let start = 0;
    if (cursorCreatedAt && cursorId != null) {
      start = sorted.findIndex(row => {
        const t = row.q.createdAt ? new Date(row.q.createdAt).getTime() : 0;
        if (t < cursorCreatedAt!.getTime()) return true;
        if (t === cursorCreatedAt!.getTime() && row.q.id < cursorId!) return true;
        return false;
      });
      if (start < 0) start = sorted.length;
    }

    const page = sorted.slice(start, start + limit);
    const pageIds = page.map(p => p.q.id);

    const answersByQuestion = new Map<number, Array<{
      id: number;
      participantId: number;
      text: string;
      parentAnswerId: number | null;
      authorName: string;
      reactions: unknown;
      createdAt: Date | null;
    }>>();

    if (pageIds.length) {
      const answerRows = await db.select({
        a: exchangeAnswers,
        author: participants,
      }).from(exchangeAnswers)
        .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
        .where(inArray(exchangeAnswers.questionId, pageIds))
        .orderBy(asc(exchangeAnswers.createdAt), asc(exchangeAnswers.id));
      for (const row of answerRows) {
        const qid = row.a.questionId;
        if (!answersByQuestion.has(qid)) answersByQuestion.set(qid, []);
        answersByQuestion.get(qid)!.push({
          id: row.a.id,
          participantId: row.a.participantId,
          text: row.a.text,
          parentAnswerId: row.a.parentAnswerId,
          authorName: `${row.author?.firstName ?? ''} ${row.author?.lastName ?? ''}`.trim(),
          reactions: row.a.reactions,
          createdAt: row.a.createdAt,
        });
      }
    }

    const last = page[page.length - 1];
    const nextCursor = page.length === limit && last?.q.createdAt
      ? `${new Date(last.q.createdAt).toISOString()}:${last.q.id}`
      : null;

    const limits = await getExchangeLimitsForParticipant(me.id);

    res.json({
      myParticipantId: me.id,
      limits,
      minQuestionLen: env.EXCHANGE_MIN_QUESTION_LEN,
      minAnswerLen: env.EXCHANGE_MIN_ANSWER_LEN,
      nextCursor,
      questions: page.map(row => {
        const mapped = answersByQuestion.get(row.q.id) || [];
        const topLevelCount = answerCounts.get(row.q.id)
          ?? mapped.filter(a => !a.parentAnswerId).length;
        return {
          ...row.q,
          authorName: `${row.author?.firstName ?? ''} ${row.author?.lastName ?? ''}`.trim(),
          direction: row.author?.direction,
          isMine: row.q.participantId === me.id,
          answerCount: topLevelCount,
          answers: mapped,
          category: row.category ? {
            id: row.category.id,
            slug: row.category.slug,
            title: row.category.title,
            emoji: row.category.emoji,
          } : null,
        };
      }),
    });
  } catch (error) {
    console.error('listExchange:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getExchangeQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const me = req.participant!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный id вопроса' });
      return;
    }

    const { getExchangeLimitsForParticipant } = await import('../services/exchangeLimits.js');

    const [row] = await db.select({
      q: exchangeQuestions,
      author: participants,
      category: exchangeCategories,
    }).from(exchangeQuestions)
      .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .leftJoin(exchangeCategories, eq(exchangeQuestions.categoryId, exchangeCategories.id))
      .where(eq(exchangeQuestions.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Вопрос не найден' });
      return;
    }

    if (!participantCanViewExchangeQuestion(row.q, me, row.author)) {
      res.status(403).json({ error: 'Этот вопрос недоступен' });
      return;
    }

    const answerRows = await db.select({
      a: exchangeAnswers,
      author: participants,
    }).from(exchangeAnswers)
      .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
      .where(eq(exchangeAnswers.questionId, id))
      .orderBy(asc(exchangeAnswers.createdAt), asc(exchangeAnswers.id));

    const mapped = answerRows.map(ar => ({
      id: ar.a.id,
      participantId: ar.a.participantId,
      text: ar.a.text,
      parentAnswerId: ar.a.parentAnswerId,
      authorName: `${ar.author?.firstName ?? ''} ${ar.author?.lastName ?? ''}`.trim(),
      reactions: ar.a.reactions,
      createdAt: ar.a.createdAt,
    }));

    const limits = await getExchangeLimitsForParticipant(me.id);

    res.json({
      limits,
      minAnswerLen: env.EXCHANGE_MIN_ANSWER_LEN,
      question: {
        ...row.q,
        authorName: `${row.author?.firstName ?? ''} ${row.author?.lastName ?? ''}`.trim(),
        direction: row.author?.direction,
        isMine: row.q.participantId === me.id,
        answerCount: mapped.filter(a => !a.parentAnswerId).length,
        answers: mapped,
        category: row.category ? {
          id: row.category.id,
          slug: row.category.slug,
          title: row.category.title,
          emoji: row.category.emoji,
        } : null,
      },
    });
  } catch (error) {
    console.error('getExchangeQuestion:', error);
    res.status(500).json({ error: 'Не удалось загрузить вопрос' });
  }
};

export const createExchangeQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { text, audience, categoryId: rawCategoryId } = req.body;
    const trimmed = typeof text === 'string' ? text.trim() : '';

    const { getExchangeLimitsForParticipant } = await import('../services/exchangeLimits.js');
    const limits = await getExchangeLimitsForParticipant(req.participant!.id);
    if (limits.questionsLeft <= 0) {
      res.status(400).json({
        error: `Лимит на сегодня исчерпан: можно задать не больше ${limits.questionsMax} вопросов в день`,
        limits,
      });
      return;
    }

    const categoryId = Number(rawCategoryId ?? req.body.category_id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      res.status(422).json({
        error: 'Выберите тему вопроса — без рубрики опубликовать нельзя',
        code: 'NO_CATEGORY',
      });
      return;
    }
    if (!trimmed || trimmed.length < env.EXCHANGE_MIN_QUESTION_LEN) {
      res.status(422).json({
        error: `Добавьте деталей — так вам ответят по существу. Сейчас ${trimmed.length} из ${env.EXCHANGE_MIN_QUESTION_LEN} символов.`,
        code: 'TEXT_TOO_SHORT',
        min: env.EXCHANGE_MIN_QUESTION_LEN,
        current: trimmed.length,
      });
      return;
    }

    const [cat] = await db.select().from(exchangeCategories)
      .where(and(eq(exchangeCategories.id, categoryId), eq(exchangeCategories.isActive, true)))
      .limit(1);
    if (!cat) {
      res.status(422).json({
        error: 'Тема не найдена или отключена. Выберите рубрику ещё раз',
        code: 'NO_CATEGORY',
      });
      return;
    }

    const aud = audience === 'direction' || audience === 'my_direction' ? 'direction' : 'all';
    const [q] = await db.insert(exchangeQuestions).values({
      participantId: req.participant!.id,
      text: trimmed.slice(0, 8000),
      audience: aud,
      moderationStatus: 'pending',
      categoryId: cat.id,
      classifiedBy: 'user',
      categoryConfirmed: false,
      reactions: { likes: 0, discuss: 0, likedBy: [], discussBy: [] },
    }).returning();

    const nextLimits = await getExchangeLimitsForParticipant(req.participant!.id);
    res.json({
      question: q,
      limits: nextLimits,
      category: { id: cat.id, slug: cat.slug, title: cat.title, emoji: cat.emoji },
    });
  } catch (error) {
    console.error('createExchangeQuestion:', error);
    res.status(500).json({ error: 'Не удалось сохранить вопрос. Попробуйте ещё раз.' });
  }
};

export const answerExchange = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const questionId = Number(req.params.id);
    const { text, parentAnswerId } = req.body;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'Введите текст ответа' });
      return;
    }
    if (trimmed.length < env.EXCHANGE_MIN_ANSWER_LEN) {
      res.status(422).json({
        error: 'Похоже, это реакция, а не ответ. Нажмите 👍 под вопросом — автор увидит.',
        code: 'ANSWER_TOO_SHORT',
        min: env.EXCHANGE_MIN_ANSWER_LEN,
        current: trimmed.length,
      });
      return;
    }

    const [question] = await db.select().from(exchangeQuestions)
      .where(eq(exchangeQuestions.id, questionId)).limit(1);
    if (!question) {
      res.status(404).json({ error: 'Вопрос не найден' });
      return;
    }

    const [author] = await db.select({
      direction: participants.direction,
      shiftId: participants.shiftId,
    }).from(participants)
      .where(eq(participants.id, question.participantId)).limit(1);
    const blockReason = participantCanAnswerExchangeQuestion(
      question,
      req.participant!,
      author,
    );
    if (blockReason) {
      res.status(403).json({ error: blockReason });
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

    const {
      getExchangeLimitsForParticipant,
      getExchangeLimitsConfig,
    } = await import('../services/exchangeLimits.js');
    const limitsBefore = await getExchangeLimitsForParticipant(req.participant!.id);
    const exchangeCfg = await getExchangeLimitsConfig(req.participant!.shiftId);
    // Отвечать можно без лимита; баллы — только за первые N ответов.
    const awardAnswerPoints = limitsBefore.answersForPointsLeft > 0 && exchangeCfg.pointsPerAnswer > 0;

    const [answer] = await db.insert(exchangeAnswers).values({
      questionId,
      participantId: req.participant!.id,
      text: trimmed.slice(0, 8000),
      parentAnswerId: parentAnswerId ? Number(parentAnswerId) : null,
      reactions: { likes: 0, discuss: 0 },
    }).returning();

    let pointsResult: Awaited<ReturnType<typeof awardPoints>> = null;
    let newMedals: Awaited<ReturnType<typeof evaluateMedalsForParticipantDetailed>> = [];
    let confirm = resolveAnswerConfirmation(undefined);
    try {
      const settings = await getForumSettings(req.participant!.shiftId);
      if (awardAnswerPoints) {
        pointsResult = await awardPoints(
          req.participant!.id,
          'exchange_answer',
          exchangeCfg.pointsPerAnswer,
          resolveEffectiveCurrentDay(settings),
          { ignoreMaxAccruals: true },
        );
      }
      const extras = await answerSubmitExtras(req.participant!.id, settings);
      newMedals = extras.newMedals;
      confirm = extras.confirm;

      if (question.participantId !== req.participant!.id) {
        const { pushCopy } = await import('../services/pushCopy.js');
        await sendPushNotification(
          [question.participantId],
          pushCopy.exchangeAnswerReceived(),
          'transactional_exchange_answer_received',
        ).catch(err => console.warn('answerExchange push:', err));
      }
    } catch (sideErr) {
      console.error('answerExchange side effects:', sideErr);
    }

    const nextLimits = await getExchangeLimitsForParticipant(req.participant!.id);
    res.json({
      answer,
      xpAwarded: pointsResult?.awarded ?? 0,
      track: pointsResult?.track ?? 'path',
      newMedals,
      confirm,
      limits: nextLimits,
    });
  } catch (error) {
    console.error('answerExchange:', error);
    res.status(500).json({ error: 'Не удалось сохранить ответ. Попробуйте ещё раз.' });
  }
};

export const reactExchangeAnswer = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const answerId = Number(req.params.answerId);
    const kind = (req.body?.type || req.body?.kind) as 'like' | 'discuss';
    if (!['like', 'discuss'].includes(kind)) {
      res.status(400).json({ error: 'Invalid reaction type' });
      return;
    }

    const [existing] = await db.select().from(exchangeAnswers).where(eq(exchangeAnswers.id, answerId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Answer not found' });
      return;
    }
    const [question] = await db.select().from(exchangeQuestions)
      .where(eq(exchangeQuestions.id, existing.questionId)).limit(1);
    if (!question) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }
    const [author] = await db.select({
      direction: participants.direction,
      shiftId: participants.shiftId,
    }).from(participants)
      .where(eq(participants.id, question.participantId)).limit(1);
    if (!participantCanViewExchangeQuestion(question, req.participant!, author)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { reactions, removed } = toggleExchangeReaction(existing.reactions, req.participant!.id, kind);
    const [updated] = await db.update(exchangeAnswers)
      .set({ reactions })
      .where(eq(exchangeAnswers.id, answerId))
      .returning();

    res.json({ answer: updated, removed });
  } catch (error) {
    console.error('reactExchangeAnswer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reactExchangeQuestion = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const kind = (req.body?.type || req.body?.kind) as 'like' | 'discuss';
    if (!['like', 'discuss'].includes(kind)) {
      res.status(400).json({ error: 'Invalid reaction type' });
      return;
    }

    const [existing] = await db.select().from(exchangeQuestions).where(eq(exchangeQuestions.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    const [author] = await db.select({
      direction: participants.direction,
      shiftId: participants.shiftId,
    }).from(participants)
      .where(eq(participants.id, existing.participantId)).limit(1);
    if (!participantCanViewExchangeQuestion(existing, req.participant!, author)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { reactions, removed } = toggleExchangeReaction(existing.reactions, req.participant!.id, kind);
    const [updated] = await db.update(exchangeQuestions)
      .set({ reactions })
      .where(eq(exchangeQuestions.id, id))
      .returning();

    res.json({ question: updated, removed });
  } catch (error) {
    console.error('reactExchangeQuestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
