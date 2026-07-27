import { Response } from 'express';
import { eq, and, lte, or, isNull, ilike, ne, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, taskSubmissions, questions, answers, participants, taskTeamConfirmations } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings } from '../services/helpers.js';
import { awardPoints } from '../services/pointsService.js';
import { effectiveTaskPoints } from '../services/taskPoints.js';
import { sendPushNotification } from '../services/pushService.js';
import { evaluateMedalsForParticipant } from '../services/medalEvaluator.js';
import {
  assertPostUrlUnique,
  assertTaskSubmissionAllowed,
  isQrInValidWindow,
  normalizePostUrl,
} from '../services/taskEligibility.js';
import {
  createTeamConfirmations,
  notifyTeamConfirmRequest,
  tryFinalizeTeamSubmission,
} from '../services/teamTaskService.js';
import { getMoscowParts } from '../services/timePhase.js';

function getTaskStatus(
  task: typeof tasks.$inferSelect,
  submission: typeof taskSubmissions.$inferSelect | undefined,
  now: Date,
): string {
  if (task.publishTime && task.publishTime > now) return 'soon';
  if (!submission) return 'available';
  if (submission.status === 'approved') return 'done';
  if (submission.status === 'rejected' || submission.status === 'expired') return 'rejected';
  if (submission.status === 'pending_team') return 'pending';
  return 'pending';
}

const TASK_STATUS_SORT: Record<string, number> = {
  available: 0,
  soon: 1,
  pending: 2,
  rejected: 3,
  done: 4,
};

function taskSortRank(item: { status: string; canResubmit?: boolean }): number {
  if (item.status === 'available' || item.canResubmit) return 0;
  return TASK_STATUS_SORT[item.status] ?? 5;
}

function mskTodayStart(now: Date): Date {
  const { dateKey } = getMoscowParts(now);
  return new Date(`${dateKey}T00:00:00+03:00`);
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

    type TaskListItem = {
      id: number;
      title: string;
      description: string | null;
      points: number | null;
      category: string | null;
      deadline: Date | null;
      answerType: string | null;
      confirmationType: string;
      autoConfirm: boolean | null;
      allowRetry: boolean | null;
      hasQr: boolean;
      status: string;
      canResubmit: boolean;
      submission: typeof taskSubmissions.$inferSelect | null;
    };

    let result: TaskListItem[] = allTasks.map(t => {
      const sub = subMap.get(t.id);
      const status = getTaskStatus(t, sub, now);
      if (t.hideUntilPublish && t.publishTime && t.publishTime > now) return null;
      const canResubmit = (status === 'rejected') && t.allowRetry;
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
    }).filter((t): t is TaskListItem => t != null);

    result.sort((a, b) => taskSortRank(a) - taskSortRank(b) || a.id - b.id);

    const progressDone = result.filter(t => t.status === 'done').length;
    const progressTotal = result.length;

    if (filter === 'active') result = result.filter(t => t.status === 'available' || t.canResubmit);
    if (filter === 'done') result = result.filter(t => t.status === 'done');
    if (filter === 'pending') result = result.filter(t => t.status === 'pending');

    const dayStart = mskTodayStart(now);
    const pointsToday = submissions
      .filter(s => s.status === 'approved' && s.checkedAt && s.checkedAt >= dayStart)
      .reduce((sum, s) => sum + (s.pointsAwarded ?? 0), 0);

    const experienceTotal = req.participant!.experiencePoints ?? 0;

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

    const pendingTeamInvites = await db.select({
      c: taskTeamConfirmations,
      s: taskSubmissions,
      t: tasks,
    })
      .from(taskTeamConfirmations)
      .innerJoin(taskSubmissions, eq(taskTeamConfirmations.submissionId, taskSubmissions.id))
      .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(and(
        eq(taskTeamConfirmations.participantId, req.participant!.id),
        eq(taskTeamConfirmations.status, 'pending'),
        eq(taskSubmissions.status, 'pending_team'),
      ));

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
      pendingTeamInvites: pendingTeamInvites.map(r => ({
        submissionId: r.s.id,
        taskId: r.t.id,
        taskTitle: r.t.title,
      })),
      progress: {
        done: progressDone,
        total: progressTotal,
        percent: progressTotal ? Math.round((progressDone / progressTotal) * 100) : 0,
        pointsToday,
        experienceTotal,
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

    const now = new Date();
    if ((task.confirmationType === 'qr' || qrToken) && !isQrInValidWindow(task, now)) {
      res.status(400).json({ error: 'QR-код задания сейчас не активен' });
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
    let teamIds: number[] | null = null;
    if (confirmationType === 'team') {
      teamIds = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(Boolean) : [];
      if (teamIds.length < 1) {
        res.status(400).json({ error: 'Укажите участников команды' });
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
      if ((answerType === 'photo' || answerType === 'text_and_photo') && !photoUrl) {
        res.status(400).json({ error: 'Photo required' });
        return;
      }
    }

    let postUrlNormalized: string | null = null;
    if (postUrl?.trim()) {
      const dupCheck = await assertPostUrlUnique(postUrl, req.participant!.id);
      if (!dupCheck.ok) {
        res.status(400).json({ error: dupCheck.error });
        return;
      }
      postUrlNormalized = dupCheck.normalized;
    }

    const [existing] = await db.select().from(taskSubmissions)
      .where(and(
        eq(taskSubmissions.participantId, req.participant!.id),
        eq(taskSubmissions.taskId, taskId),
      )).limit(1);

    const allowResubmit = existing?.status === 'rejected' && task.allowRetry;
    const elig = await assertTaskSubmissionAllowed(req.participant!.id, task, {
      allowResubmitRejected: allowResubmit,
      existingStatus: existing?.status ?? null,
    });
    if (!elig.ok && !allowResubmit) {
      res.status(400).json({ error: elig.error });
      return;
    }
    if (!allowResubmit && existing && existing.status !== 'rejected') {
      res.status(400).json({ error: 'Already submitted' });
      return;
    }

    const isTeam = confirmationType === 'team';
    const forceAuto = !isTeam && (task.autoConfirm || confirmationType === 'auto' || confirmationType === 'qr');
    const status = isTeam ? 'pending_team' : (forceAuto ? 'approved' : 'pending');
    const pointsAwarded = forceAuto ? effectiveTaskPoints(task) : 0;

    let submission;
    if (existing && allowResubmit) {
      [submission] = await db.update(taskSubmissions)
        .set({
          answerText,
          photoUrl,
          postUrl: postUrl || null,
          postUrlNormalized,
          teamMemberIds: teamIds,
          status,
          pointsAwarded,
          checkedAt: forceAuto ? new Date() : null,
          moderatorComment: null,
          submittedAt: new Date(),
        })
        .where(eq(taskSubmissions.id, existing.id))
        .returning();
    } else {
      [submission] = await db.insert(taskSubmissions).values({
        participantId: req.participant!.id,
        taskId,
        answerText,
        photoUrl,
        postUrl: postUrl || null,
        postUrlNormalized,
        teamMemberIds: teamIds,
        status,
        pointsAwarded,
        checkedAt: forceAuto ? new Date() : null,
      }).returning();
    }

    let xpAwarded = 0;
    if (isTeam && submission) {
      await db.delete(taskTeamConfirmations).where(eq(taskTeamConfirmations.submissionId, submission.id));
      await createTeamConfirmations(submission.id, req.participant!.id, teamIds!);
      const notifyIds = teamIds!.filter(id => id !== req.participant!.id);
      await notifyTeamConfirmRequest(submission.id, task.title, notifyIds);
    } else if (forceAuto && pointsAwarded > 0) {
      const awarded = await awardPoints(req.participant!.id, 'task_complete', pointsAwarded, task.dayNumber ?? undefined);
      xpAwarded = awarded?.awarded ?? pointsAwarded;
    } else if (submission && (status === 'pending' || status === 'pending_team')) {
      await sendPushNotification(
        [req.participant!.id],
        isTeam
          ? `Командное задание «${task.title}» отправлено на подтверждение`
          : `Задание «${task.title}» на проверке у модератора`,
        `transactional_task_pending_${submission.id}`,
      );
    }
    await evaluateMedalsForParticipant(req.participant!.id);

    res.json({ submission, xpAwarded, track: 'experience' });
  } catch (error) {
    console.error('submitTask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const teamConfirmSubmission = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const submissionId = Number(req.params.submissionId);
    const accept = req.body?.accept !== false;
    const pid = req.participant!.id;

    const [row] = await db.select().from(taskTeamConfirmations)
      .where(and(
        eq(taskTeamConfirmations.submissionId, submissionId),
        eq(taskTeamConfirmations.participantId, pid),
      )).limit(1);
    if (!row || row.status !== 'pending') {
      res.status(400).json({ error: 'Нет ожидающего подтверждения' });
      return;
    }

    await db.update(taskTeamConfirmations)
      .set({ status: accept ? 'confirmed' : 'declined', respondedAt: new Date() })
      .where(eq(taskTeamConfirmations.id, row.id));

    if (!accept) {
      await db.update(taskSubmissions)
        .set({ status: 'rejected', checkedAt: new Date(), moderatorComment: 'Отклонено участником команды' })
        .where(eq(taskSubmissions.id, submissionId));
    } else {
      await tryFinalizeTeamSubmission(submissionId);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('teamConfirmSubmission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchTeammates = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ participants: [] });
      return;
    }
    const selfId = req.participant!.id;
    const pattern = `%${q}%`;
    const list = await db.select({
      id: participants.id,
      firstName: participants.firstName,
      lastName: participants.lastName,
      direction: participants.direction,
    }).from(participants)
      .where(and(
        ne(participants.id, selfId),
        isNotNull(participants.onboardingCompletedAt),
        isNull(participants.selfDeletedAt),
        or(
          ilike(participants.firstName, pattern),
          ilike(participants.lastName, pattern),
          eq(participants.id, Number(q) || -1),
        ),
      ))
      .limit(15);
    res.json({ participants: list });
  } catch (error) {
    console.error('searchTeammates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
