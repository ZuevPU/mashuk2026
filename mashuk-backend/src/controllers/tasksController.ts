import { Response } from 'express';
import { eq, and, lte, or, isNull, ilike, ne, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, taskSubmissions, questions, answers, participants, taskTeamConfirmations } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings } from '../services/helpers.js';
import { resolveTaskAwardPoints } from '../services/taskPoints.js';
import { sendPushNotification } from '../services/pushService.js';
import { evaluateMedalsForParticipant } from '../services/medalEvaluator.js';
import {
  assertPostUrlUnique,
  assertTaskSubmissionAllowed,
  isQrInValidWindow,
  isRepeatableExecution,
  loadParticipantTaskSubmissions,
  pickDisplaySubmission,
  resolveSubmissionWriteAction,
} from '../services/taskEligibility.js';
import {
  isTaskOnForumDay,
  isTaskPublishedVisible,
  isTaskSubmissionOpen,
  resolveSubmissionOutcome,
  taskMethodsForParticipant,
  validateTaskSubmissionPayload,
  normalizeTaskAnswerOptions,
} from '../services/taskAdminHelpers.js';
import {
  createTeamConfirmations,
  notifyTeamConfirmRequest,
  tryFinalizeTeamSubmission,
} from '../services/teamTaskService.js';
import { getMoscowParts } from '../services/timePhase.js';
import {
  completeSubmissionRewards,
  enrichSubmissionRow,
  submissionCreatePatch,
  type EnrichedSubmission,
} from '../services/submissionLifecycle.js';

async function resolveTaskListState(
  task: typeof tasks.$inferSelect,
  taskSubs: typeof taskSubmissions.$inferSelect[],
  participantId: number,
  now: Date,
): Promise<{ status: string; canResubmit: boolean; displaySub: typeof taskSubmissions.$inferSelect | undefined }> {
  if (task.publishTime && task.publishTime > now) {
    return { status: 'soon', canResubmit: false, displaySub: pickDisplaySubmission(taskSubs) };
  }

  const displaySub = pickDisplaySubmission(taskSubs);
  const open = isTaskSubmissionOpen(task, now);

  if (displaySub && (displaySub.status === 'pending' || displaySub.status === 'pending_team')) {
    return { status: 'pending', canResubmit: false, displaySub };
  }

  if (displaySub && (displaySub.status === 'rejected' || displaySub.status === 'expired')) {
    const canResubmit = !!task.allowRetry && open;
    return { status: 'rejected', canResubmit, displaySub };
  }

  const elig = await assertTaskSubmissionAllowed(participantId, task);
  if (elig.ok && open) {
    return { status: 'available', canResubmit: false, displaySub: displaySub?.status === 'approved' ? displaySub : undefined };
  }

  if (displaySub?.status === 'approved') {
    return { status: 'done', canResubmit: false, displaySub };
  }

  return { status: displaySub ? 'pending' : 'available', canResubmit: false, displaySub };
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
    const { resolveActiveShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveActiveShiftId();

    const allTasksRaw = await db.select().from(tasks).where(eq(tasks.shiftId, shiftId));
    const allTasks = allTasksRaw.filter(t =>
      isTaskPublishedVisible(t, now) && isTaskOnForumDay(t, settings.currentDay ?? 1),
    );

    const submissions = await db.select().from(taskSubmissions)
      .where(eq(taskSubmissions.participantId, req.participant!.id));

    const subsByTask = new Map<number, typeof taskSubmissions.$inferSelect[]>();
    for (const s of submissions) {
      const list = subsByTask.get(s.taskId) ?? [];
      list.push(s);
      subsByTask.set(s.taskId, list);
    }

    type TaskListItem = {
      id: number;
      title: string;
      shortDescription: string | null;
      description: string | null;
      descriptionHtml: string | null;
      points: number | null;
      category: string | null;
      categoryIconKey: string | null;
      deadline: Date | null;
      answerType: string | null;
      answerOptions: Array<{ label: string; value: string }>;
      confirmationType: string;
      confirmationMethods: string[];
      autoConfirm: boolean | null;
      allowRetry: boolean | null;
      hasQr: boolean;
      executionType: string;
      dailyRepeatLimit: number;
      canSubmitAgain: boolean;
      todayCompletedCount: number;
      status: string;
      canResubmit: boolean;
      submission: EnrichedSubmission | null;
    };

    const dayStart = mskTodayStart(now);

    const mapped = await Promise.all(allTasks.map(async t => {
      const taskSubs = subsByTask.get(t.id) ?? [];
      const { status, canResubmit, displaySub } = await resolveTaskListState(
        t,
        taskSubs,
        req.participant!.id,
        now,
      );
      if (t.hideUntilPublish && t.publishTime && t.publishTime > now) return null;
      if (!isTaskSubmissionOpen(t, now) && !displaySub) return null;
      const methods = taskMethodsForParticipant(t);
      const todayCompletedCount = taskSubs.filter(s =>
        s.status === 'approved' && s.checkedAt && s.checkedAt >= dayStart,
      ).length;
      return {
        id: t.id,
        title: t.title,
        shortDescription: t.shortDescription ?? t.description ?? null,
        description: t.shortDescription ?? t.description ?? null,
        descriptionHtml: t.descriptionHtml ?? t.description ?? null,
        points: t.points,
        category: t.category,
        categoryIconKey: t.iconKey ?? null,
        deadline: t.deadline ?? t.availableTo,
        answerType: t.answerType,
        answerOptions: normalizeTaskAnswerOptions(t.answerOptions),
        confirmationType: t.confirmationType || 'text_photo',
        confirmationMethods: methods,
        autoConfirm: t.autoConfirm,
        allowRetry: t.allowRetry,
        hasQr: Boolean(t.qrToken),
        executionType: t.executionType || 'once',
        dailyRepeatLimit: t.dailyRepeatLimit ?? 1,
        canSubmitAgain: status === 'available' && isRepeatableExecution(t.executionType),
        todayCompletedCount,
        status,
        canResubmit,
        submission: displaySub ? enrichSubmissionRow(displaySub) as EnrichedSubmission : null,
      };
    }));
    let result: TaskListItem[] = mapped.filter((t): t is TaskListItem => t !== null);

    result.sort((a, b) => taskSortRank(a) - taskSortRank(b) || a.id - b.id);

    const progressDone = result.filter(t => t.status === 'done').length;
    const progressTotal = result.length;

    if (filter === 'active') result = result.filter(t => t.status === 'available' || t.canResubmit);
    if (filter === 'done') result = result.filter(t => t.status === 'done');
    if (filter === 'pending') result = result.filter(t => t.status === 'pending');

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
    const { answerText, photoUrl, postUrl, teamMemberIds, qrToken, deviceKey } = req.body as {
      answerText?: string;
      photoUrl?: string;
      postUrl?: string;
      teamMemberIds?: number[];
      qrToken?: string;
      deviceKey?: string;
    };

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const now = new Date();
    const methods = taskMethodsForParticipant(task);
    const isQrSubmit = methods.includes('qr') || !!qrToken;
    const requestDeviceKey = isQrSubmit
      ? (await import('../services/qrScanGuard.js')).resolveRequestDeviceKey(req, deviceKey)
      : null;
    const ipAddress = req.ip
      || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : null)
      || null;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const recordBlockedQr = async (outcome: 'blocked_duplicate' | 'blocked_device') => {
      if (!requestDeviceKey) return;
      const { recordQrScan } = await import('../services/qrScanGuard.js');
      await recordQrScan({
        taskId,
        participantId: req.participant!.id,
        vkUserId: req.participant!.vkId ?? null,
        deviceKey: requestDeviceKey,
        ipAddress,
        userAgent,
        outcome,
      });
    };
    if ((methods.includes('qr') || qrToken) && !isQrInValidWindow(task, now)) {
      res.status(400).json({ error: 'QR-код задания сейчас не активен' });
      return;
    }
    if (!isTaskSubmissionOpen(task, now)) {
      res.status(400).json({ error: 'Срок приёма заявки по этому заданию истёк' });
      return;
    }

    if (task.qrToken && qrToken && qrToken !== task.qrToken) {
      res.status(400).json({ error: 'Invalid QR token' });
      return;
    }

    if (isQrSubmit && qrToken && task.qrToken === qrToken && requestDeviceKey) {
      const { assertQrScanAllowed } = await import('../services/qrScanGuard.js');
      const qrGuard = await assertQrScanAllowed({
        taskId,
        participantId: req.participant!.id,
        deviceKey: requestDeviceKey,
      });
      if (!qrGuard.ok) {
        if (qrGuard.outcome === 'blocked_duplicate' || qrGuard.outcome === 'blocked_device') {
          await recordBlockedQr(qrGuard.outcome);
        }
        res.status(400).json({ error: qrGuard.error });
        return;
      }
    }

    const payloadCheck = validateTaskSubmissionPayload(task, { answerText, photoUrl, postUrl, teamMemberIds, qrToken });
    if (!payloadCheck.ok) {
      res.status(400).json({ error: payloadCheck.error });
      return;
    }

    const confirmationType = task.confirmationType || 'text_photo';
    let teamIds: number[] | null = null;
    if (methods.includes('team') || confirmationType === 'team') {
      teamIds = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(Boolean) : [];
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

    const taskSubs = await loadParticipantTaskSubmissions(req.participant!.id, taskId);
    const rejectedSub = taskSubs.find(s => s.status === 'rejected' || s.status === 'expired');
    const allowResubmit = !!rejectedSub && task.allowRetry !== false;
    const elig = await assertTaskSubmissionAllowed(req.participant!.id, task, {
      allowResubmitRejected: allowResubmit,
      existingStatus: rejectedSub?.status ?? null,
    });
    if (!elig.ok && !allowResubmit) {
      res.status(400).json({ error: elig.error });
      return;
    }

    const writeAction = resolveSubmissionWriteAction(task, taskSubs, elig.ok, allowResubmit);
    if (writeAction.action === 'block') {
      res.status(400).json({ error: writeAction.error });
      return;
    }

    const outcome = resolveSubmissionOutcome(task, { qrToken });
    const isTeam = outcome.isTeam;
    const forceAuto = outcome.forceAuto;
    const status = outcome.status;

    const lifecyclePatch = submissionCreatePatch({
      task,
      payload: { answerText, photoUrl, postUrl, teamMemberIds: teamIds, qrToken },
      status,
      isTeam,
      forceAuto,
    });

    let submission;
    if (writeAction.action === 'update') {
      [submission] = await db.update(taskSubmissions)
        .set({
          answerText,
          photoUrl,
          postUrl: postUrl || null,
          postUrlNormalized,
          teamMemberIds: teamIds,
          status,
          pointsAwarded: 0,
          pointsLogId: null,
          userMedalId: null,
          checkedAt: forceAuto ? new Date() : null,
          verifiedAt: null,
          verifiedByAdminId: null,
          verifiedByVolunteerVkId: null,
          moderatorComment: null,
          submittedAt: new Date(),
          ...lifecyclePatch,
        })
        .where(eq(taskSubmissions.id, writeAction.submissionId))
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
        pointsAwarded: 0,
        checkedAt: forceAuto ? new Date() : null,
        ...lifecyclePatch,
      }).returning();
    }

    let xpAwarded = 0;
    if (isTeam && submission) {
      await db.delete(taskTeamConfirmations).where(eq(taskTeamConfirmations.submissionId, submission.id));
      await createTeamConfirmations(submission.id, req.participant!.id, teamIds!);
      const notifyIds = teamIds!.filter(id => id !== req.participant!.id);
      await notifyTeamConfirmRequest(submission.id, task.title, notifyIds);
    } else if (forceAuto && submission) {
      const rewards = await completeSubmissionRewards(submission.id, [req.participant!.id], task, {
        verificationType: 'auto',
      });
      xpAwarded = (await resolveTaskAwardPoints(task)) || 0;
      [submission] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submission.id)).limit(1);
      void rewards;
      if (isQrSubmit && qrToken && requestDeviceKey) {
        const { recordQrScan } = await import('../services/qrScanGuard.js');
        await recordQrScan({
          taskId,
          participantId: req.participant!.id,
          vkUserId: req.participant!.vkId ?? null,
          deviceKey: requestDeviceKey,
          ipAddress,
          userAgent,
          outcome: 'success',
          submissionId: submission?.id ?? null,
        });
      }
    } else if (submission && (status === 'pending' || status === 'pending_team')) {
      const pendingSubmissionId = submission.id;
      const pendingTitle = task.title;
      const pendingIsTeam = isTeam;
      void import('../services/pushCopy.js')
        .then(({ pushCopy }) => sendPushNotification(
          [req.participant!.id],
          pendingIsTeam
            ? pushCopy.taskPendingTeam(pendingTitle)
            : pushCopy.taskPendingModerator(pendingTitle),
          `transactional_task_pending_${pendingSubmissionId}`,
        ))
        .catch((err) => console.error('task pending push failed:', err));
    }
    // Medals/push must not delay the client response — otherwise the submit modal hangs.
    void evaluateMedalsForParticipant(req.participant!.id).catch((err) => {
      console.error('evaluateMedalsForParticipant after submitTask:', err);
    });

    res.json({
      submission: submission ? enrichSubmissionRow(submission) : null,
      xpAwarded,
      track: 'experience',
    });
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
