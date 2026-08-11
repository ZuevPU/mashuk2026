import { Response } from 'express';
import { eq, and, lte, or, isNull, asc, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  dayFocus, questions, answers, tasks, taskSubmissions, piggybank, events, scheduleDays,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  getForumSettings, formatTime, getMoscowPhase, isEveningWrapWindow,
  getForumOperationalDateKey, resolveParticipantForumDay,
  resolveLiveProgramDay, stateCheckTimePointOrder,
} from '../services/helpers.js';
import {
  getEventLiveStatus,
  isKeyProgramBlock,
  resolveEventInterval,
} from '../services/eventSchedule.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import {
  buildTouchpointItemsForDay,
  isTouchpointQuestionForForumDay,
} from '../services/touchpointProgress.js';
import { questionMatchesDay } from '../services/questionAdminHelpers.js';
import {
  getQuestionAccess,
  questionAudienceAllowsParticipant,
  questionVisibleToParticipant,
} from '../services/questionEligibility.js';
import {
  normalizePracticesConfig,
  practicesConfigForParticipant,
} from '../services/practicesVoteConfig.js';
import { getLevelProgress, totalRatingScore } from '../services/pointsService.js';
import { loadDayContext } from './dayStateController.js';
import { resolveEveningSurveyDayForParticipant } from '../services/eveningSurveyDay.js';
import { resolveHomeActiveCard } from '../services/homeActiveCard.js';
import { resolveActiveShiftId } from '../services/shiftService.js';

export const getHome = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const participant = req.participant!;
    const settings = await getForumSettings();
    const now = new Date();
    const totalDays = settings.totalDays ?? 8;
    const timeSlot = getMoscowPhase(now);
    let eveningWrap = isEveningWrapWindow(now);

    const shiftIdForQs = await resolveActiveShiftId();
    const publishedDayRows = await db.select({ dayNumber: scheduleDays.dayNumber })
      .from(scheduleDays)
      .where(and(
        eq(scheduleDays.shiftId, shiftIdForQs),
        eq(scheduleDays.isPublished, true),
      ));
    const publishedDays = publishedDayRows.map(r => r.dayNumber);
    const liveProgramDay = resolveLiveProgramDay(settings, publishedDays, now);
    // Focus + touchpoints must follow the same live day as schedule.
    // Publishing day N opens program via resolveLiveProgramDay even if admin
    // currentDay lagged — without this, Home kept «yesterday» points/focus.
    const currentDay = resolveParticipantForumDay(settings, publishedDays, now);

    const [focus] = await db.select().from(dayFocus)
      .where(and(
        eq(dayFocus.dayNumber, currentDay),
        eq(dayFocus.shiftId, shiftIdForQs),
      )).limit(1);
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

    const enrichMissed = (q: typeof publishedQuestions[0], access: ReturnType<typeof getQuestionAccess>) => ({
      id: q.id,
      title: q.title,
      closeTime: q.closeTime,
      block: q.block,
      access,
      expired: access === 'locked',
      overdue: access === 'overdue',
    });

    // Only today's points — do not keep yesterday's overdue/locked in Home.
    const missed = publishedQuestions
      .filter(q => !answeredIds.has(q.id) && questionMatchesDay(q, currentDay))
      .map(q => {
        const access = getQuestionAccess(q, currentDay, now);
        return enrichMissed(q, access);
      })
      .filter(q => q.access === 'open' || q.access === 'overdue' || q.access === 'locked');

    // Only still-fillable misses for today — locked previous/closed slots stay buried.
    const activeMissed = missed.filter(q => q.access === 'open' || q.access === 'overdue');
    const lockedMissed: typeof missed = [];

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
      .where(and(eq(piggybank.participantId, participant.id), isNull(piggybank.deletedAt)));
    const piggybankCount = piggyRows.length;

    const stateCheckOrder = stateCheckTimePointOrder(now);
    let priorityQuestion: typeof publishedQuestions[0] | undefined;
    for (const tp of stateCheckOrder) {
      priorityQuestion = publishedQuestions.find(q => {
        if (answeredIds.has(q.id) || q.block !== 'Проверка состояния') return false;
        if (!questionMatchesDay(q, currentDay)) return false;
        if ((q.timePoint || '') !== tp) return false;
        const access = getQuestionAccess(q, currentDay, now);
        return access === 'open' || access === 'overdue';
      });
      if (priorityQuestion) break;
    }
    const pointB = publishedQuestions.find(q => {
      if (answeredIds.has(q.id)) return false;
      if (!(q.block === 'Точка Б' || q.dayNumber === 8)) return false;
      const access = getQuestionAccess(q, currentDay, now);
      return access === 'open' || access === 'overdue';
    });

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

    // «Скоро» — ближайшие 30 минут (раньше отсекалось <15 мин, и событие пропадало из «Скоро»)
    const SOON_MIN_MS = 0;
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
    }).filter(x => x.start && !x.event.hideFromHome);

    const schedule: { kind: string; title: string; time: string; place?: string | null }[] = [];
    // «Сейчас» — все текущие верхнеуровневые события (ужин, сессии и т.д.), не только key_block.
    // Если идут и ключевые блоки, и обычные — сначала ключевые, затем остальные (лимит 4).
    const liveNow = enrichedEvents
      .filter(x => x.status === 'now')
      .sort((a, b) => a.start!.getTime() - b.start!.getTime());
    const keyNow = liveNow.filter(x => isKeyProgramBlock(x.event));
    const otherNow = liveNow.filter(x => !isKeyProgramBlock(x.event));
    const nowEvents = [...keyNow, ...otherNow].slice(0, 4);
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
    const eveningSurveyDay = await resolveEveningSurveyDayForParticipant(
      participant.id,
      settings,
      now,
    );
    const dayContext = await loadDayContext(participant.id, currentDay, participant.pedagogicalRole, {
      now,
      settings,
      hasPointB,
      pointBQuestionId: pointB?.id ?? pointBQuestion?.id ?? null,
    });
    const eveningContext = eveningSurveyDay !== currentDay
      ? await loadDayContext(participant.id, eveningSurveyDay, participant.pedagogicalRole, {
        now,
        settings,
        hasPointB,
        pointBQuestionId: pointB?.id ?? pointBQuestion?.id ?? null,
      })
      : dayContext;
    const eveningQuestionnaire = {
      ...eveningContext.eveningQuestionnaire,
      dayNumber: eveningSurveyDay,
    };
    if (eveningSurveyDay >= 1 && eveningSurveyDay <= 7) {
      eveningWrap = !!eveningQuestionnaire.open;
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

    const eveningCard = eveningQuestionnaire.available
      ? {
        title: '✦ Завершение дня',
        subtitle: eveningSurveyDay === 7
          ? `Итоговая анкета · день ${eveningSurveyDay} · без роли на завтра`
          : `Итоговая анкета · день ${eveningSurveyDay}`,
      }
      : null;
    const dayTouchpointsTotal = TOUCHPOINT_SLOTS.length;
    // Slot 7: completed evening form for the current forum day (eveningRatings), not only marker answers.
    const eveningDoneForTouchpoints = currentDay === eveningSurveyDay
      ? !!eveningQuestionnaire.completed
      : !!dayContext.eveningQuestionnaire?.completed;
    const touchpointItemsRaw = buildTouchpointItemsForDay(
      dayQuestions,
      answeredIds,
      currentDay,
      currentDay,
      now,
      { eveningDone: eveningDoneForTouchpoints },
    );
    // Until evening opensAt (or force-publish), slot 7 stays pending — not active/overdue.
    const eveningSlotOpen = !!eveningQuestionnaire.open;
    const touchpointItems = touchpointItemsRaw.map(item => {
      const isEveningSlot = /итоговая анкета/i.test(item.title || '')
        || (item.block || '').includes('Итог');
      if (!isEveningSlot || item.state === 'done') return item;
      if (!eveningSlotOpen) return { ...item, state: 'pending' as const };
      return item;
    });
    const dayTouchpointsCompleted = touchpointItems.filter(i => i.state === 'done').length;

    // Missed banner = overdue (still fillable) only. Locked slots from a closed
    // window / previous day must not nag on a freshly published day.
    const missedToday = touchpointItems
      .filter(i => i.state === 'overdue')
      .map(i => ({
        id: typeof i.id === 'number' ? i.id : Number(i.id) || 0,
        title: i.title ?? '',
        state: 'overdue' as const,
      }))
      .filter(i => i.id > 0);
    const missedTodayCount = missedToday.length;
    const ctaQuestionId = missedToday[0]?.id ?? null;
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
      eveningQuestionnaire,
      schedule,
      touchpointItems: touchpointItems.map(i => ({
        id: typeof i.id === 'number' ? i.id : 0,
        title: i.title,
        state: i.state,
      })),
      delayedSurvey: delayedSurveyCard,
    });

    const unansweredAfterBlocks = publishedQuestions
      .filter(q => {
        if (answeredIds.has(q.id)) return false;
        const kind = String(q.questionKind || q.reflectionKind || '').toLowerCase();
        if (kind !== 'after_blocks') return false;
        if (!questionMatchesDay(q, currentDay)) return false;
        if (!questionVisibleToParticipant(q, participant, currentDay)) return false;
        const access = getQuestionAccess(q, currentDay, now);
        return access === 'open' || access === 'overdue';
      })
      .map(q => ({
        id: q.id,
        title: q.title,
        overdue: getQuestionAccess(q, currentDay, now) === 'overdue',
      }))
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.id - b.id);

    const practicesVoteQuestions = publishedQuestions
      .filter(q => {
        const isPractices = q.questionKind === 'practices_vote'
          || q.answerType === 'practices_vote'
          || q.type === 'practices_vote';
        if (!isPractices || q.isHidden) return false;
        if (q.publishTime && q.publishTime > now) return false;
        return questionAudienceAllowsParticipant(q, participant);
      })
      .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0) || b.id - a.id);

    const practicesQuestion = practicesVoteQuestions[0] ?? null;
    let practicesSection: {
      questionId: number;
      title: string;
      resultsPublished: boolean;
      likesPerParticipant: number;
      preamble: string;
      answered: boolean;
      practices: Array<{
        id: string;
        title: string;
        description: string;
        participantName: string;
        direction: string;
        resultPlace?: string | null;
        resultTime?: string | null;
      }>;
    } | null = null;

    if (practicesQuestion) {
      const cfg = practicesConfigForParticipant(
        normalizePracticesConfig(practicesQuestion.practicesConfig),
      );
      if (cfg.practices.some(p => p.title.trim())) {
        practicesSection = {
          questionId: practicesQuestion.id,
          title: practicesQuestion.title,
          resultsPublished: cfg.resultsPublished,
          likesPerParticipant: cfg.likesPerParticipant,
          preamble: cfg.preamble,
          answered: answeredIds.has(practicesQuestion.id),
          practices: cfg.practices.filter(p => p.title.trim()),
        };
      }
    }

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

    let homeNotice: {
      id: number;
      title: string;
      body: string;
      ctaUrl: string | null;
      ctaLabel: string | null;
      imageUrls: string[];
    } | null = null;
    try {
      const { getActiveHomeNotice } = await import('./homeNoticeController.js');
      homeNotice = await getActiveHomeNotice(shiftIdForQs, now);
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
        textHtml: focus.textHtml,
        keyQuestion: focus.keyQuestion,
      } : null,
      priorityAction,
      activeCard,
      delayedSurvey: delayedSurveyCard,
      roleOfDay: dayContext.roleOfDay,
      experiment: currentDay === 8 ? null : (eveningContext.experiment ?? dayContext.experiment),
      eveningQuestionnaire,
      missedQuestions: [...activeMissed, ...lockedMissed],
      unansweredAfterBlocks,
      practicesSection,
      counts: {
        availableQuestions: publishedQuestions.filter(q => {
          if (answeredIds.has(q.id)) return false;
          if (!questionMatchesDay(q, currentDay) && q.block !== 'Точка Б' && q.dayNumber !== 8) {
            return false;
          }
          if (!questionVisibleToParticipant(q, participant, currentDay)) return false;
          // Evening stub is not a list question until opensAt (shown via eveningCard).
          const isEve = /итоговая анкета/i.test(q.title || '')
            || (q.block || '').toLowerCase().includes('итоги дня');
          if (isEve && !eveningQuestionnaire.available) return false;
          const access = getQuestionAccess(q, currentDay, now);
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
      homeNotice,
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
