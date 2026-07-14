import { Response } from 'express';
import { eq, and, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, taskSubmissions, questions, answers } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';
import { evaluateMedalsForParticipant } from '../services/medalEvaluator.js';

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
        confirmationType: t.confirmationType || 'text_photo',
        autoConfirm: t.autoConfirm,
        allowRetry: t.allowRetry,
        hasQr: Boolean(t.qrToken),
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

    const currentDay = settings.currentDay ?? 1;
    const dayQuestions = await db.select().from(questions)
      .where(and(
        eq(questions.status, 'published'),
        eq(questions.dayNumber, currentDay),
        or(isNull(questions.publishTime), lte(questions.publishTime, now)),
      ));
    const participantAnswers = await db.select().from(answers)
      .where(eq(answers.participantId, req.participant!.id));
    const answeredIds = new Set(participantAnswers.map(a => a.questionId));
    const touchpoints = dayQuestions.filter(q => answeredIds.has(q.id)).length;
    const touchpointsTotal = dayQuestions.length || 7;
    const requiredTouchpoints = settings.kbUnlockThreshold ?? 4;
    const unlockDisabled = settings.kbUnlockDisabled === true;

    res.json({
      tasks: result.map(t => {
        const task = allTasks.find(x => x.id === t!.id);
        const availableFrom = task?.publishTime && task.publishTime > now
          ? task.publishTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : null;
        return { ...t, availableFrom };
      }),
      dayNumber: currentDay,
      kbLocked: !unlockDisabled && touchpoints < requiredTouchpoints,
      touchpointsCompleted: touchpoints,
      touchpointsTotal,
      requiredTouchpoints,
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
    const { answerText, photoUrl, postUrl, teamMemberIds, qrToken } = req.body;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.qrToken && qrToken && qrToken !== task.qrToken) {
      res.status(400).json({ error: 'Invalid QR token' });
      return;
    }

    const confirmationType = task.confirmationType || 'text_photo';
    const answerType = task.answerType || 'text_and_photo';

    if (confirmationType === 'photo' && !photoUrl) {
      res.status(400).json({ error: 'Требуется фото' });
      return;
    }
    if (confirmationType === 'post_url' && !postUrl?.trim()) {
      res.status(400).json({ error: 'Требуется ссылка на пост' });
      return;
    }
    if (confirmationType === 'qr') {
      if (!task.qrToken) {
        res.status(400).json({ error: 'QR для задания ещё не сгенерирован' });
        return;
      }
      if (!qrToken || qrToken !== task.qrToken) {
        res.status(400).json({ error: 'Отсканируйте QR задания или дождитесь подтверждения волонтёра' });
        return;
      }
    }
    if (confirmationType === 'team') {
      const teamIds = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(Boolean) : [];
      if (teamIds.length < 1) {
        res.status(400).json({ error: 'Укажите ID участников команды' });
        return;
      }
    }
    if (confirmationType === 'auto') {
      // no extra fields
    } else if (confirmationType === 'text_photo' || !task.confirmationType) {
      if (answerType === 'text' && !answerText?.trim()) {
        res.status(400).json({ error: 'Text answer required' });
        return;
      }
      if (answerType === 'photo' && !photoUrl) {
        res.status(400).json({ error: 'Photo required' });
        return;
      }
    }

    // Антидубль ссылок на посты (Wave B)
    if (postUrl) {
      const [dup] = await db.select().from(taskSubmissions)
        .where(eq(taskSubmissions.postUrl, String(postUrl)))
        .limit(1);
      if (dup && dup.participantId !== req.participant!.id) {
        res.status(400).json({ error: 'Эта ссылка уже использована другим участником' });
        return;
      }
    }

    const [existing] = await db.select().from(taskSubmissions)
      .where(and(
        eq(taskSubmissions.participantId, req.participant!.id),
        eq(taskSubmissions.taskId, taskId),
      )).limit(1);

    const forceAuto = task.autoConfirm || confirmationType === 'auto' || confirmationType === 'qr';
    const status = forceAuto ? 'approved' : 'pending';
    const pointsAwarded = forceAuto ? (task.points ?? 0) : 0;
    const teamIds = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(Boolean) : null;

    let submission;
    if (existing) {
      if (existing.status === 'rejected' && task.allowRetry) {
        [submission] = await db.update(taskSubmissions)
          .set({
            answerText,
            photoUrl,
            postUrl: postUrl || null,
            teamMemberIds: teamIds,
            status,
            pointsAwarded,
            checkedAt: forceAuto ? new Date() : null,
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
        postUrl: postUrl || null,
        teamMemberIds: teamIds,
        status,
        pointsAwarded,
        checkedAt: forceAuto ? new Date() : null,
      }).returning();
    }

    let xpAwarded = 0;
    if (forceAuto && pointsAwarded > 0) {
      const awarded = await awardPoints(req.participant!.id, 'task_complete', pointsAwarded);
      xpAwarded = awarded?.awarded ?? pointsAwarded;
      if (teamIds?.length) {
        for (const mid of teamIds) {
          if (mid !== req.participant!.id) {
            await awardPoints(mid, 'task_complete', pointsAwarded);
          }
        }
      }
    }
    await evaluateMedalsForParticipant(req.participant!.id);

    res.json({ submission, xpAwarded, track: 'experience' });
  } catch (error) {
    console.error('submitTask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
