import { Response } from 'express';
import { eq, and, lte, or, isNull, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  dayFocus, questions, answers, tasks, taskSubmissions, piggybank, events,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  getForumSettings, formatTime, getMoscowPhase, isEveningWrapWindow,
  getTouchpointAccess, resolveEffectiveCurrentDay,
} from '../services/helpers.js';
import { awardPoints, getLevelProgress } from '../services/pointsService.js';
import { loadDayContext } from './dayStateController.js';
import {
  normalizePiggybankTag,
  normalizePiggybankSource,
  isAllowedPiggybankTag,
  isAllowedPiggybankSource,
  pointsActionForTag,
  ORG_TAG,
} from '../services/piggybankDict.js';

export const getHome = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const participant = req.participant!;
    const settings = await getForumSettings();
    const now = new Date();
    const currentDay = resolveEffectiveCurrentDay(settings, now);
    const totalDays = settings.totalDays ?? 8;
    const timeSlot = getMoscowPhase(now);
    const eveningWrap = isEveningWrapWindow(now);

    const [focus] = await db.select().from(dayFocus)
      .where(eq(dayFocus.dayNumber, currentDay)).limit(1);

    const publishedQuestions = await db.select().from(questions)
      .where(eq(questions.status, 'published'));

    const TOUCH_BLOCKS = new Set(['Проверка состояния', 'Точки осмысления', 'Итоги дня']);
    const dayQuestions = publishedQuestions.filter(q =>
      q.dayNumber === currentDay && TOUCH_BLOCKS.has(q.block || ''));
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
        const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
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

    const ideas = await db.select().from(piggybank)
      .where(and(eq(piggybank.participantId, participant.id), eq(piggybank.tag, 'идея')));

    const priorityQuestion = publishedQuestions.find(q => {
      if (answeredIds.has(q.id) || q.block !== 'Проверка состояния') return false;
      const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
      return access === 'open' || access === 'overdue';
    });
    const pointB = publishedQuestions.find(q => {
      if (answeredIds.has(q.id)) return false;
      if (!(q.block === 'Точка Б' || q.dayNumber === 8)) return false;
      const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
      return access === 'open' || access === 'overdue';
    });

    const dayEvents = await db.select().from(events)
      .where(and(eq(events.dayNumber, currentDay), eq(events.isPublished, true)))
      .orderBy(asc(events.startTime));

    const schedule: { kind: string; title: string; time: string; place?: string | null }[] = [];
    const nowEvent = dayEvents.find(e =>
      e.startTime && e.startTime <= now && (!e.endTime || e.endTime >= now));
    if (nowEvent) {
      schedule.push({
        kind: 'now',
        title: nowEvent.title,
        time: formatTime(nowEvent.startTime),
        place: nowEvent.place,
      });
    }
    const futureEvents = dayEvents.filter(e => e.startTime && e.startTime > now);
    if (futureEvents[0]) {
      const diffMs = futureEvents[0].startTime!.getTime() - now.getTime();
      schedule.push({
        kind: diffMs < 3600000 ? 'soon' : 'next',
        title: futureEvents[0].title,
        time: formatTime(futureEvents[0].startTime),
        place: futureEvents[0].place,
      });
    }
    if (futureEvents[1] && schedule.length < 3) {
      schedule.push({
        kind: 'next',
        title: futureEvents[1].title,
        time: formatTime(futureEvents[1].startTime),
        place: futureEvents[1].place,
      });
    }

    const missedCount = activeMissed.filter(q => q.overdue).length + lockedMissed.length;
    const dayContext = await loadDayContext(participant.id, currentDay, participant.pedagogicalRole);

    let priorityAction: Record<string, unknown> | null = null;
    if (currentDay === 8 && pointB) {
      priorityAction = {
        type: 'question',
        id: pointB.id,
        title: pointB.title,
        subtitle: 'Точка Б · финальная рефлексия',
        route: `/questions?q=${pointB.id}`,
      };
    } else if (eveningWrap && dayContext.eveningQuestionnaire.available && !dayContext.eveningQuestionnaire.completed) {
      priorityAction = {
        type: 'evening',
        id: 'evening',
        title: '✦ Завершение дня',
        subtitle: currentDay === 7
          ? 'Итоговая анкета · Точка Б'
          : 'Оценки дня · эксперимент · роль на завтра',
        route: '/?evening=1',
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
    } else if (timeSlot === 'morning' && activeTasks[0]) {
      priorityAction = {
        type: 'task',
        id: activeTasks[0].id,
        title: activeTasks[0].title,
        subtitle: 'Доступное задание',
        route: `/tasks?task=${activeTasks[0].id}`,
      };
    }

    const dayTouchpointsTotal = dayQuestions.length || 7;
    const dayTouchpointsCompleted = participantAnswers.filter(a =>
      dayQuestions.some(q => q.id === a.questionId)).length;

    const touchpointItems = dayQuestions.map(q => {
      const done = answeredIds.has(q.id);
      const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
      let state: 'done' | 'active' | 'overdue' | 'locked' | 'pending' = 'pending';
      if (done) state = 'done';
      else if (access === 'locked') state = 'locked';
      else if (access === 'overdue') state = 'overdue';
      else if (access === 'open') state = 'active';
      else state = 'pending';
      return { id: q.id, title: q.title, state, block: q.block };
    });

    const pathProg = await getLevelProgress(participant.pathPoints ?? 0, 'path');
    const expProg = await getLevelProgress(participant.experiencePoints ?? 0, 'experience');

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
      roleOfDay: dayContext.roleOfDay,
      experiment: currentDay === 8 ? null : dayContext.experiment,
      eveningQuestionnaire: dayContext.eveningQuestionnaire,
      missedQuestions: [...activeMissed, ...lockedMissed],
      counts: {
        availableQuestions: publishedQuestions.filter(q => {
          if (answeredIds.has(q.id)) return false;
          const access = getTouchpointAccess(q.dayNumber, currentDay, q.closeTime, now, q.publishTime);
          return access === 'open' || access === 'overdue';
        }).length,
        availableTasks: activeTasks.length,
        hasNewTasks: activeTasks.some(t => t.publishTime && (now.getTime() - t.publishTime.getTime()) < 86400000),
      },
      points: {
        path: participant.pathPoints ?? 0,
        experience: participant.experiencePoints ?? 0,
        ideas: ideas.length,
        pathLevel: pathProg.level,
        experienceLevel: expProg.level,
        pathProgress: pathProg.progress,
        experienceProgress: expProg.progress,
      },
      touchpoints: {
        completed: dayTouchpointsCompleted,
        total: dayTouchpointsTotal,
        missed: missedCount,
        message: missedCount > 0
          ? (activeMissed.some(q => q.overdue)
            ? `${activeMissed.filter(q => q.overdue).length} пропущена — ещё можно заполнить`
            : 'Есть пропущенные точки')
          : 'Начни с утренней проверки состояния',
        items: touchpointItems,
      },
      schedule,
      ui: {
        showTasksBanner: timeSlot === 'morning',
        showQuickCapture: timeSlot === 'day' && currentDay !== 8,
        showEveningCard: eveningWrap,
      },
      sectionsVisibility: settings.sectionsVisibility ?? {},
      startDate: settings.startDate ?? null,
    });
  } catch (error) {
    console.error('getHome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const quickPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { tag: rawTag, text, source: rawSource } = req.body;
    if (!rawTag || !text) {
      res.status(400).json({ error: 'tag and text required' });
      return;
    }

    const tag = normalizePiggybankTag(String(rawTag));
    if (!isAllowedPiggybankTag(tag)) {
      res.status(400).json({ error: 'Invalid tag' });
      return;
    }

    // Организаторам — источник не обязателен
    let source = normalizePiggybankSource(rawSource);
    if (tag !== ORG_TAG) {
      if (!source || !isAllowedPiggybankSource(source)) {
        res.status(400).json({ error: 'source required (choose after text)' });
        return;
      }
    } else {
      source = source || 'Своя мысль';
    }

    const [entry] = await db.insert(piggybank).values({
      participantId: req.participant!.id,
      tag,
      text,
      source,
    }).returning();

    await awardPoints(req.participant!.id, pointsActionForTag(tag));

    res.json({ entry });
  } catch (error) {
    console.error('quickPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
