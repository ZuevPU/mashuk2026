import { Response } from 'express';
import { eq, and, lte, or, isNull, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  dayFocus, questions, answers, tasks, taskSubmissions, piggybank, events, scheduleDays,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  getForumSettings, formatTime, getMoscowPhase, isEveningWrapWindow,
  getTouchpointAccess, getForumOperationalDateKey, resolveEffectiveCurrentDay,
  resolveLiveProgramDay, stateCheckTimePointOrder,
} from '../services/helpers.js';
import {
  getEventLiveStatus,
  resolveEventInterval,
} from '../services/eventSchedule.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import {
  buildTouchpointItemsForDay,
  isTouchpointQuestionForForumDay,
} from '../services/touchpointProgress.js';
import { questionMatchesDay } from '../services/questionAdminHelpers.js';
import { resolveQuestionDayForAccess } from '../services/questionEligibility.js';
import { getLevelProgress, totalRatingScore } from '../services/pointsService.js';
import { loadDayContext } from './dayStateController.js';
import { resolveHomeActiveCard } from '../services/homeActiveCard.js';
import { resolveActiveShiftId } from '../services/shiftService.js';

export const getHome = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const participant = req.participant!;
    const settings = await getForumSettings();
    const now = new Date();
    const currentDay = resolveEffectiveCurrentDay(settings, now);
    const totalDays = settings.totalDays ?? 8;
    const timeSlot = getMoscowPhase(now);
    let eveningWrap = isEveningWrapWindow(now);

    const [focus] = await db.select().from(dayFocus)
      .where(eq(dayFocus.dayNumber, currentDay)).limit(1);

    const shiftIdForQs = await resolveActiveShiftId();
    const publishedQuestions = await db.select().from(questions)
      .where(and(
        eq(questions.status, 'published'),
        eq(questions.shiftId, shiftIdForQs),
      ));

    const dayQuestions = publishedQuestions.filter(q =>
      isTouchpointQuestionForForumDay(q, currentDay));
    const participantAnswers = await db.select().from(answers)
      .where(eq(answers.participantId, participant.id));

    const answeredIds = new Set(participantAnswers.map(a => a.questionId));

    const enrichMissed = (q: typeof publishedQuestions[0], access: ReturnType<typeof getTouchpointAccess>) => ({
      id: q.id,
      title: q.title,
      closeTime: q.closeTime,
      block: q.block,
      access,
      expired: access === 'locked',
      overdue: access === 'overdue',
    });

    const missed = publishedQuestions
      .filter(q => !answeredIds.has(q.id))
      .map(q => {
        const accessDay = resolveQuestionDayForAccess(q, currentDay);
        const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
        return enrichMissed(q, access);
      })
      .filter(q => q.access === 'open' || q.access === 'overdue' || q.access === 'locked');

    const activeMissed = missed.filter(q => q.access === 'open' || q.access === 'overdue');
    const lockedMissed = missed.filter(q => q.access === 'locked');

    const availableTasks = await db.select().from(tasks)
      .where(and(
        or(isNull(tasks.dayNumber), eq(tasks.dayNumber, currentDay)),
        or(isNull(tasks.publishTime), lte(tasks.publishTime, now)),
      ));

    const submissions = await db.select().from(taskSubmissions)
      .where(eq(taskSubmissions.participantId, participant.id));

    const submittedTaskIds = new Set(submissions.map(s => s.taskId));
    const activeTasks = availableTasks.filter(t => !submittedTaskIds.has(t.id));

    const piggyRows = await db.select().from(piggybank)
      .where(eq(piggybank.participantId, participant.id));
    const piggybankCount = piggyRows.length;

    const stateCheckOrder = stateCheckTimePointOrder(now);
    let priorityQuestion: typeof publishedQuestions[0] | undefined;
    for (const tp of stateCheckOrder) {
      priorityQuestion = publishedQuestions.find(q => {
        if (answeredIds.has(q.id) || q.block !== 'Проверка состояния') return false;
        if (!questionMatchesDay(q, currentDay)) return false;
        if ((q.timePoint || '') !== tp) return false;
        const accessDay = resolveQuestionDayForAccess(q, currentDay);
        const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
        return access === 'open' || access === 'overdue';
      });
      if (priorityQuestion) break;
    }
    const pointB = publishedQuestions.find(q => {
      if (answeredIds.has(q.id)) return false;
      if (!(q.block === 'Точка Б' || q.dayNumber === 8)) return false;
      const accessDay = resolveQuestionDayForAccess(q, currentDay);
      const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
      return access === 'open' || access === 'overdue';
    });

    const publishedDayRows = await db.select({ dayNumber: scheduleDays.dayNumber })
      .from(scheduleDays)
      .where(and(
        eq(scheduleDays.shiftId, shiftIdForQs),
        eq(scheduleDays.isPublished, true),
      ));
    const publishedDays = publishedDayRows.map(r => r.dayNumber);
    const liveProgramDay = resolveLiveProgramDay(settings, publishedDays, now);

    const [dayMeta] = await db.select().from(scheduleDays).where(and(
      eq(scheduleDays.dayNumber, liveProgramDay),
      eq(scheduleDays.shiftId, shiftIdForQs),
    )).limit(1);
    const dayIsLive = dayMeta?.isPublished === true;

    const dayEvents = dayIsLive
      ? await db.select().from(events)
        .where(and(
          eq(events.shiftId, shiftIdForQs),
          eq(events.dayNumber, liveProgramDay),
          eq(events.isPublished, true),
          eq(events.dayPublished, true),
          isNull(events.parentEventId),
        ))
        .orderBy(asc(events.startTime))
      : [];

    const SOON_MIN_MS = 15 * 60_000;
    const SOON_MAX_MS = 30 * 60_000;
    // Bind active program clocks to today's MSK date so «Сейчас» follows
    // the wall clock even when the published day lags the calendar day.
    const scheduleContext = {
      startDate: settings.startDate ?? null,
      dayCalendarDateKey: getForumOperationalDateKey(now),
    };

    const enrichedEvents = dayEvents.map(e => {
      const { start, end } = resolveEventInterval(e, scheduleContext);
      const status = getEventLiveStatus(liveProgramDay, liveProgramDay, start, end, now);
      return { event: e, start, end, status };
    }).filter(x => x.start);

    const schedule: { kind: string; title: string; time: string; place?: string | null }[] = [];
    // All overlapping «сейчас» blocks — not only the first by startTime
    const nowEvents = enrichedEvents
      .filter(x => x.status === 'now')
      .sort((a, b) => a.start!.getTime() - b.start!.getTime());
    for (const nowEvent of nowEvents) {
      schedule.push({
        kind: 'now',
        title: nowEvent.event.title,
        time: formatTime(nowEvent.start),
        place: nowEvent.event.place,
      });
    }
    const futureEvents = enrichedEvents
      .filter(x => x.status === 'future' && x.start!)
      .sort((a, b) => a.start!.getTime() - b.start!.getTime());
    const soonEvent = futureEvents.find(e => {
      const diffMs = e.start!.getTime() - now.getTime();
      return diffMs >= SOON_MIN_MS && diffMs <= SOON_MAX_MS;
    });
    if (soonEvent && schedule.length < 4) {
      schedule.push({
        kind: 'soon',
        title: soonEvent.event.title,
        time: formatTime(soonEvent.start),
        place: soonEvent.event.place,
      });
    }
    const nextEvent = futureEvents.find(e => {
      if (soonEvent && e.event.id === soonEvent.event.id) return false;
      if (soonEvent) return e.start!.getTime() > soonEvent.start!.getTime();
      return true;
    });
    if (nextEvent && schedule.length < 4) {
      schedule.push({
        kind: 'next',
        title: nextEvent.event.title,
        time: formatTime(nextEvent.start),
        place: nextEvent.event.place,
      });
    }

    const missedCount = activeMissed.filter(q => q.overdue).length + lockedMissed.length;
    const pointBQuestion = publishedQuestions.find(q => q.block === 'Точка Б');
    const hasPointB = !!(participant.pointBAnswers && (
      Array.isArray(participant.pointBAnswers)
        ? participant.pointBAnswers.length > 0
        : Object.keys(participant.pointBAnswers as object).length > 0
    ));
    const dayContext = await loadDayContext(participant.id, currentDay, participant.pedagogicalRole, {
      now,
      settings,
      hasPointB,
      pointBQuestionId: pointB?.id ?? pointBQuestion?.id ?? null,
    });
    if (currentDay >= 1 && currentDay <= 7) {
      eveningWrap = !!dayContext.eveningQuestionnaire.open;
    }

    let priorityAction: { type: string; title: string; subtitle: string; route: string; id?: number } | null = null;
    if (currentDay === 8 && pointB) {
      priorityAction = {
        type: 'question',
        id: pointB.id,
        title: pointB.title,
        subtitle: 'Точка Б · финальная рефлексия',
        route: `/questions?q=${pointB.id}`,
      };
    } else if (priorityQuestion) {
      priorityAction = {
        type: 'question',
        id: priorityQuestion.id,
        title: priorityQuestion.title,
        subtitle: priorityQuestion.timePoint
          ? `Проверка состояния · ${priorityQuestion.timePoint}`
          : 'Ответить сейчас',
        route: `/questions?q=${priorityQuestion.id}`,
      };
    }

    const eveningCard = dayContext.eveningQuestionnaire.available
      ? {
        title: '✦ Завершение дня',
        subtitle: currentDay === 7
          ? 'Итоговая анкета · без роли на завтра'
          : 'Оценки дня · эксперимент · роль на завтра',
      }
      : null;
    const dayTouchpointsTotal = TOUCHPOINT_SLOTS.length;
    const touchpointItems = buildTouchpointItemsForDay(
      dayQuestions,
      answeredIds,
      currentDay,
      currentDay,
      now,
    );
    const dayTouchpointsCompleted = touchpointItems.filter(i => i.state === 'done').length;

    const missedToday = touchpointItems
      .filter(i => i.state === 'overdue' || i.state === 'locked')
      .map(i => ({
        id: i.id,
        title: i.title ?? '',
        state: i.state as 'overdue' | 'locked',
      }));
    const missedTodayCount = missedToday.length;
    const ctaQuestionId = touchpointItems.find(i => i.state === 'overdue')?.id
      ?? missedToday[0]?.id;
    const dayMissedCount = missedTodayCount;

    const pathProg = await getLevelProgress(participant.pathPoints ?? 0, 'path');
    const expProg = await getLevelProgress(participant.experiencePoints ?? 0, 'experience');

    let delayedSurveyCard: { id: number; title: string; subtitle: string } | null = null;
    try {
      const { getPendingDelayedSurvey } = await import('../services/exports/delayedMeasureService.js');
      const pending = await getPendingDelayedSurvey(participant.id);
      if (pending) {
        delayedSurveyCard = {
          id: pending.id,
          title: 'Как вы после форума?',
          subtitle: 'Короткий опрос через 6–8 недель — 3 вопроса, ~2 минуты',
        };
      }
    } catch {
      /* migration pending */
    }

    const activeCard = resolveHomeActiveCard({
      now,
      eveningWrap,
      currentDay,
      priorityAction,
      eveningCard,
      eveningQuestionnaire: dayContext.eveningQuestionnaire,
      schedule,
      touchpointItems: touchpointItems.map(i => ({
        id: typeof i.id === 'number' ? i.id : 0,
        title: i.title,
        state: i.state,
      })),
      delayedSurvey: delayedSurveyCard,
    });

    let activePushBanners: {
      id: number;
      pushTitle: string | null;
      personalizedBody: string;
      icon: string | null;
      imageUrl: string | null;
      visibleUntil: Date | null;
    }[] = [];
    try {
      const { listActivePushBanners } = await import('./pushBannerController.js');
      activePushBanners = await listActivePushBanners(participant.id, now);
    } catch {
      // migration pending
    }

    res.json({
      user: {
        firstName: participant.firstName,
        lastName: participant.lastName,
        direction: participant.direction,
        pedagogicalRole: participant.pedagogicalRole,
        groupId: participant.groupId,
        groupName: participant.groupName,
      },
      currentDay,
      totalDays,
      timeSlot,
      eveningWrap,
      currentDate: now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' }),
      dayFocus: focus ? {
        title: focus.title,
        text: focus.text,
        keyQuestion: focus.keyQuestion,
      } : null,
      priorityAction,
      activeCard,
      delayedSurvey: delayedSurveyCard,
      roleOfDay: dayContext.roleOfDay,
      experiment: currentDay === 8 ? null : dayContext.experiment,
      eveningQuestionnaire: dayContext.eveningQuestionnaire,
      missedQuestions: [...activeMissed, ...lockedMissed],
      counts: {
        availableQuestions: publishedQuestions.filter(q => {
          if (answeredIds.has(q.id)) return false;
          const accessDay = resolveQuestionDayForAccess(q, currentDay);
          const access = getTouchpointAccess(accessDay, currentDay, q.closeTime, now, q.publishTime);
          return access === 'open' || access === 'overdue';
        }).length,
        availableTasks: activeTasks.length,
        hasNewTasks: activeTasks.some(t => t.publishTime && (now.getTime() - t.publishTime.getTime()) < 86400000),
      },
      points: {
        path: participant.pathPoints ?? 0,
        experience: participant.experiencePoints ?? 0,
        bonus: participant.bonusPoints ?? 0,
        total: totalRatingScore(
          participant.pathPoints ?? 0,
          participant.experiencePoints ?? 0,
          participant.bonusPoints ?? 0,
        ),
        ideas: piggybankCount,
        pathLevel: pathProg.level,
        experienceLevel: expProg.level,
        pathProgress: pathProg.progress,
        experienceProgress: expProg.progress,
      },
      touchpoints: {
        completed: dayTouchpointsCompleted,
        total: dayTouchpointsTotal,
        missed: dayMissedCount,
        missedToday,
        missedTodayCount,
        ctaQuestionId: ctaQuestionId ?? null,
        message: (() => {
          const openCount = touchpointItems.filter(i => i.state === 'active').length;
          const pendingCount = touchpointItems.filter(i => i.state === 'pending').length;
          const doneCount = touchpointItems.filter(i => i.state === 'done').length;
          if (dayMissedCount === 0) {
            if (openCount > 0) return `${openCount} открыто сейчас`;
            if (doneCount === dayTouchpointsTotal) return 'Все точки дня пройдены';
            if (pendingCount > 0) return 'Следующие точки откроются по расписанию';
            return 'Сейчас нет открытых точек';
          }
          const overdueN = missedToday.filter(m => m.state === 'overdue').length;
          if (overdueN > 0) return `${overdueN} пропущено — ещё можно заполнить`;
          return `${dayMissedCount} точек пропущено`;
        })(),
        items: touchpointItems,
      },
      schedule,
      eveningCard,
      ui: {
        showTasksBanner: false,
        showQuickCapture: currentDay !== 8,
        showPiggybankFab: currentDay !== 8,
        showEveningCard: !!eveningCard,
      },
      sectionsVisibility: settings.sectionsVisibility ?? {},
      startDate: settings.startDate ?? null,
      activePushBanners,
    });
  } catch (error) {
    console.error('getHome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const quickPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { tag: rawTag, tags: rawTags, text, source: rawSource, forumDay } = req.body;
    const tagsInput = rawTags ?? rawTag;
    if (!tagsInput || !text) {
      res.status(400).json({ error: 'tag(s) and text required' });
      return;
    }

    const { createPiggybankEntry } = await import('../services/piggybankService.js');
    try {
      const entry = await createPiggybankEntry({
        participantId: req.participant!.id,
        text,
        tags: tagsInput,
        source: rawSource,
        forumDay: forumDay != null ? Number(forumDay) : undefined,
      });
      res.json({ entry });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid payload';
      res.status(400).json({ error: msg });
    }
  } catch (error) {
    console.error('quickPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
