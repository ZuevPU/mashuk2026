import { Response } from 'express';
import { eq, and, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, taskSubmissions, questions, answers } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';

function getTaskStatus(
  task: typeof tasks.$inferSelect,
  submission: typeof taskSubmissions.$inferSelect | undefined,
  now: Date
): string {
  if (task.publishTime && task.publishTime > now) return 'soon';
  if (!submission) return 'available';
  if (submission.status === 'approved') return 'done';
  if (submission.status === 'rejected') return 'rejected';
  return 'pending';
}

export const listTasks = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const filter = (req.query.filter as string) || 'all';
    const settings = await getForumSettings();
    const now = new Date();

    const allTasks = await db.select().from(tasks)
      .where(and(
        or(isNull(tasks.dayNumber), eq(tasks.dayNumber, settings.currentDay ?? 1)),
      ));

    const submissions = await db.select().from(taskSubmissions)
      .where(eq(taskSubmissions.participantId, req.participant!.id));

    const subMap = new Map(submissions.map(s => [s.taskId, s]));

    let result = allTasks.map(t => {
      const sub = subMap.get(t.id);
      const status = getTaskStatus(t, sub, now);
      if (t.hideUntilPublish && t.publishTime && t.publishTime > now) return null;
      const canResubmit = status === 'rejected' && t.allowRetry;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        points: t.points,
        category: t.category,
        deadline: t.deadline,
        answerType: t.answerType,
        allowRetry: t.allowRetry,
        status,
        canResubmit,
        submission: sub ?? null,
      };
    }).filter(Boolean);

    if (filter === 'active') result = result.filter(t => t!.status === 'available' || t!.canResubmit);
    if (filter === 'done') result = result.filter(t => t!.status === 'done');
    if (filter === 'pending') result = result.filter(t => t!.status === 'pending');

    const done = result.filter(t => t!.status === 'done').length;
    const pointsToday = submissions
      .filter(s => s.status === 'approved' && s.checkedAt && s.checkedAt >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .reduce((sum, s) => sum + (s.pointsAwarded ?? 0), 0);

    const publishedQuestions = await db.select().from(questions)
      .where(and(eq(questions.status, 'published'), or(isNull(questions.publishTime), lte(questions.publishTime, now))));
    const participantAnswers = await db.select().from(answers)
      .where(eq(answers.participantId, req.participant!.id));
    const touchpoints = participantAnswers.filter(a => publishedQuestions.some(q => q.id === a.questionId)).length;

    res.json({
      tasks: result,
      dayNumber: settings.currentDay ?? 1,
      kbLocked: touchpoints < 4,
      progress: {
        done,
        total: result.length,
        percent: result.length ? Math.round((done / result.length) * 100) : 0,
        pointsToday,
      },
    });
  } catch (error) {
    console.error('listTasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitTask = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const taskId = Number(req.params.id);
    const { answerText, photoUrl } = req.body;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const answerType = task.answerType || 'text_and_photo';
    if (answerType === 'text' && !answerText?.trim()) {
      res.status(400).json({ error: 'Text answer required' });
      return;
    }
    if (answerType === 'photo' && !photoUrl) {
      res.status(400).json({ error: 'Photo required' });
      return;
    }

    const [existing] = await db.select().from(taskSubmissions)
      .where(and(
        eq(taskSubmissions.participantId, req.participant!.id),
        eq(taskSubmissions.taskId, taskId),
      )).limit(1);

    const status = task.autoConfirm ? 'approved' : 'pending';
    const pointsAwarded = task.autoConfirm ? (task.points ?? 0) : 0;

    let submission;
    if (existing) {
      if (existing.status === 'rejected' && task.allowRetry) {
        [submission] = await db.update(taskSubmissions)
          .set({
            answerText,
            photoUrl,
            status,
            pointsAwarded,
            checkedAt: task.autoConfirm ? new Date() : null,
            moderatorComment: null,
          })
          .where(eq(taskSubmissions.id, existing.id))
          .returning();
      } else {
        res.status(400).json({ error: 'Already submitted' });
        return;
      }
    } else {
      [submission] = await db.insert(taskSubmissions).values({
        participantId: req.participant!.id,
        taskId,
        answerText,
        photoUrl,
        status,
        pointsAwarded,
        checkedAt: task.autoConfirm ? new Date() : null,
      }).returning();
    }

    if (task.autoConfirm && pointsAwarded > 0) {
      await awardPoints(req.participant!.id, 'task_complete', pointsAwarded);
    }

    res.json({ submission });
  } catch (error) {
    console.error('submitTask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
