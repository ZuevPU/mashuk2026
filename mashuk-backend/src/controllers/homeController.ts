import { Response } from 'express';
import { eq, and, lte, or, isNull, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  dayFocus, forumSettings, questions, answers, tasks, taskSubmissions, piggybank, events,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings, formatTime } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';

export const getHome = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const participant = req.participant!;
    const settings = await getForumSettings();
    const now = new Date();

    const [focus] = await db.select().from(dayFocus)
      .where(eq(dayFocus.dayNumber, settings.currentDay ?? 1)).limit(1);

    const publishedQuestions = await db.select().from(questions)
      .where(and(
        eq(questions.status, 'published'),
        or(isNull(questions.publishTime), lte(questions.publishTime, now)),
      ));

    const participantAnswers = await db.select().from(answers)
      .where(eq(answers.participantId, participant.id));

    const answeredIds = new Set(participantAnswers.map(a => a.questionId));
    const missed = publishedQuestions.filter(q => {
      if (answeredIds.has(q.id)) return false;
      if (q.closeTime && q.closeTime < now) return false;
      return q.closeTime && q.closeTime > now;
    }).map(q => ({
      id: q.id,
      title: q.title,
      closeTime: q.closeTime,
      block: q.block,
      expired: false,
    }));

    const expiredMissed = publishedQuestions.filter(q => {
      if (answeredIds.has(q.id)) return false;
      return q.closeTime && q.closeTime < now;
    }).map(q => ({
      id: q.id,
      title: q.title,
      closeTime: q.closeTime,
      block: q.block,
      expired: true,
    }));

    const availableTasks = await db.select().from(tasks)
      .where(and(
        or(isNull(tasks.dayNumber), eq(tasks.dayNumber, settings.currentDay ?? 1)),
        or(isNull(tasks.publishTime), lte(tasks.publishTime, now)),
      ));

    const submissions = await db.select().from(taskSubmissions)
      .where(eq(taskSubmissions.participantId, participant.id));

    const submittedTaskIds = new Set(submissions.map(s => s.taskId));
    const activeTasks = availableTasks.filter(t => !submittedTaskIds.has(t.id));

    const ideas = await db.select().from(piggybank)
      .where(and(eq(piggybank.participantId, participant.id), eq(piggybank.tag, 'идея')));

    const priorityQuestion = publishedQuestions.find(q => !answeredIds.has(q.id) && q.block === 'Проверка состояния');

    const dayEvents = await db.select().from(events)
      .where(and(eq(events.dayNumber, settings.currentDay ?? 1), eq(events.isPublished, true)))
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

    const missedCount = expiredMissed.length;

    res.json({
      user: {
        firstName: participant.firstName,
        lastName: participant.lastName,
        direction: participant.direction,
      },
      currentDay: settings.currentDay,
      totalDays: settings.totalDays ?? 4,
      currentDate: now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      dayFocus: focus ? {
        title: focus.title,
        text: focus.text,
        keyQuestion: focus.keyQuestion,
      } : null,
      priorityAction: priorityQuestion ? {
        type: 'question',
        id: priorityQuestion.id,
        title: priorityQuestion.title,
        subtitle: priorityQuestion.timePoint ? `Чекин · ${priorityQuestion.timePoint}` : 'Ответить сейчас',
        route: `/questions?q=${priorityQuestion.id}`,
      } : activeTasks[0] ? {
        type: 'task',
        id: activeTasks[0].id,
        title: activeTasks[0].title,
        subtitle: 'Доступное задание',
        route: `/tasks?task=${activeTasks[0].id}`,
      } : null,
      missedQuestions: [...missed, ...expiredMissed],
      counts: {
        availableQuestions: publishedQuestions.filter(q => !answeredIds.has(q.id)).length,
        availableTasks: activeTasks.length,
        hasNewTasks: activeTasks.some(t => t.publishTime && (now.getTime() - t.publishTime.getTime()) < 86400000),
      },
      points: {
        path: participant.pathPoints ?? 0,
        experience: participant.experiencePoints ?? 0,
        ideas: ideas.length,
      },
      touchpoints: {
        completed: participantAnswers.filter(a => publishedQuestions.some(q => q.id === a.questionId)).length,
        total: publishedQuestions.length || 7,
        missed: missedCount,
        message: missedCount > 0 ? 'Есть пропущенные точки' : 'Продолжайте рефлексию',
      },
      schedule,
      sectionsVisibility: settings.sectionsVisibility ?? {},
    });
  } catch (error) {
    console.error('getHome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const quickPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { tag, text, source } = req.body;
    if (!tag || !text) {
      res.status(400).json({ error: 'tag and text required' });
      return;
    }

    const [entry] = await db.insert(piggybank).values({
      participantId: req.participant!.id,
      tag,
      text,
      source: source || 'собственные размышления',
    }).returning();

    const actionMap: Record<string, string> = {
      идея: 'piggybank_idea',
      мысль: 'piggybank_thought',
      вопрос: 'piggybank_question',
    };
    await awardPoints(req.participant!.id, actionMap[tag] || 'piggybank_entry');

    res.json({ entry });
  } catch (error) {
    console.error('quickPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
