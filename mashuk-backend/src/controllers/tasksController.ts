import { Response } from 'express';
import { eq, and, or, isNull, ilike, ne, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, taskSubmissions, participants, taskTeamConfirmations, pointsLog } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings, resolveEffectiveCurrentDay } from '../services/helpers.js';
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
  taskBelongsToParticipantShift,
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
import { forumDayWindowMsk, getMoscowParts, pointsLogCountsForForumDay } from '../services/timePhase.js';
import {
  completeSubmissionRewards,
  enrichSubmissionRow,
  submissionCreatePatch,
  type EnrichedSubmission,
} from '../services/submissionLifecycle.js';
import { findTaskByQrCode, normalizeTaskQrCode } from '../services/qrService.js';
import { resolveParticipantForTaskShift } from '../services/shiftService.js';
import { resolveForumDayForNewEntry } from '../services/piggybankService.js';
import { isUniqueViolation } from '../services/qrScanGuard.js';
import { isActivePointsLogAction, pointsTrackForAction } from '../services/pointsService.js';

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
    const shiftId = req.participant!.shiftId;
    const settings = await getForumSettings(shiftId);
    const now = new Date();
    const { getShiftById, isShiftLive } = await import('../services/shiftService.js');
    if (!isShiftLive(await getShiftById(shiftId))) {
      const { getActiveHomeNotice } = await import('./homeNoticeController.js');
      res.json({
        tasks: [],
        dayNumber: 1,
        kbLocked: false,
        touchpointsCompleted: 0,
        touchpointsTotal: 0,
        requiredTouchpoints: 0,
        pendingTeamInvites: [],
        progress: { done: 0, total: 0, percent: 0, pointsToday: 0, experienceTotal: 0 },
        shiftLive: false,
        taskNotice: await getActiveHomeNotice(shiftId, now, 'tasks'),
      });
      return;
    }

    const currentDay = resolveEffectiveCurrentDay(settings, now);
    const allTasksRaw = await db.select().from(tasks).where(eq(tasks.shiftId, shiftId));
    const allTasks = allTasksRaw.filter(t =>
      isTaskPublishedVisible(t, now) && isTaskOnForumDay(t, currentDay),
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
    const dayWindow = settings.startDate
      ? forumDayWindowMsk(new Date(settings.startDate), currentDay)
      : { start: dayStart, end: new Date(dayStart.getTime() + 86_400_000) };

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
        s.status === 'approved' && s.checkedAt && s.checkedAt >= dayWindow.start && s.checkedAt < dayWindow.end,
      ).length;
      // Prefer admin rich-text / description — never let a stale shortDescription override it.
      const plainFromHtml = (t.descriptionHtml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const adminDescription = plainFromHtml || (t.description || '').trim() || (t.shortDescription || '').trim() || null;
      return {
        id: t.id,
        title: t.title,
        shortDescription: adminDescription,
        description: adminDescription,
        descriptionHtml: t.descriptionHtml || (adminDescription ? `<p>${adminDescription}</p>` : null),
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
        canSubmitAgain: status === 'available' && (
          isRepeatableExecution(t.executionType) || (t.dailyRepeatLimit ?? 1) > 1
        ),
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

    const xpLogs = await db.select({
      actionType: pointsLog.actionType,
      points: pointsLog.points,
      forumDay: pointsLog.forumDay,
      createdAt: pointsLog.createdAt,
    }).from(pointsLog).where(and(
      eq(pointsLog.participantId, req.participant!.id),
      isNull(pointsLog.revokedAt),
    ));
    const pointsToday = xpLogs.reduce((sum, row) => {
      if (!isActivePointsLogAction(row.actionType)) return sum;
      if (!pointsLogCountsForForumDay(row, currentDay, dayWindow)) return sum;
      if (pointsTrackForAction(row.actionType || '') !== 'experience') return sum;
      return sum + (row.points ?? 0);
    }, 0);

    const [fresh] = await db.select({
      experiencePoints: participants.experiencePoints,
    }).from(participants).where(eq(participants.id, req.participant!.id)).limit(1);
    const experienceTotal = fresh?.experiencePoints ?? req.participant!.experiencePoints ?? 0;

    const { countTouchpointsForDay } = await import('./programController.js');
    const { completed: touchpoints, total: touchpointsTotal } =
      await countTouchpointsForDay(req.participant!.id, currentDay);
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
      taskNotice: await (await import('./homeNoticeController.js')).getActiveHomeNotice(shiftId, now, 'tasks'),
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
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }
    const qrAttempt = !!(qrToken || (task.confirmationMethods || []).includes('qr') || task.confirmationType === 'qr');
    const bound = await resolveParticipantForTaskShift(req.participant!, task.shiftId);
    if (!bound.ok) {
      res.status(qrAttempt ? bound.status : 404).json({
        error: qrAttempt ? bound.error : 'Задание не найдено',
      });
      return;
    }
    req.participant = bound.participant;
    if (!taskBelongsToParticipantShift(task, req.participant.shiftId)) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    const now = new Date();
    if (task.status !== 'published' || task.isHidden) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }
    const methods = taskMethodsForParticipant(task);
    const isQrSubmit = methods.includes('qr') || !!qrToken;
    const requestDeviceKey = isQrSubmit
      ? (await import('../services/qrScanGuard.js')).resolveRequestDeviceKey(req, deviceKey)
      : null;
    const ipAddress = req.ip
      || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : null)
      || null;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const recordBlockedQr = async (outcome: 'blocked_duplicate' | 'blocked_device', forumDay: number) => {
      if (!requestDeviceKey) return;
      const { recordQrScan } = await import('../services/qrScanGuard.js');
      try {
        await recordQrScan({
          taskId,
          participantId: req.participant!.id,
          vkUserId: req.participant!.vkId ?? null,
          deviceKey: requestDeviceKey,
          ipAddress,
          userAgent,
          outcome,
          forumDay,
        });
      } catch {
        /* duplicate blocked logs are fine to ignore */
      }
    };
    const forumDay = isQrSubmit
      ? (await resolveForumDayForNewEntry(req.participant!.shiftId))
      : 0;
    const needsQrWindow = methods.includes('qr')
      || task.confirmationType === 'qr'
      || !!qrToken;
    if (needsQrWindow && !isQrInValidWindow(task, now, forumDay || null)) {
      res.status(400).json({
        error: 'QR-код задания сейчас не активен. Сканируйте только в указанное в админке время и дни.',
      });
      return;
    }
    if ((task.publishTime && task.publishTime > now) || (task.availableFrom && task.availableFrom > now)) {
      res.status(400).json({ error: 'Задание ещё не открыто' });
      return;
    }
    if (!isTaskSubmissionOpen(task, now)) {
      res.status(400).json({ error: 'Срок приёма заявки по этому заданию истёк' });
      return;
    }

    const qrMatches = !!(task.qrToken && qrToken
      && normalizeTaskQrCode(task.qrToken) === normalizeTaskQrCode(qrToken));
    if (task.qrToken && qrToken && !qrMatches) {
      res.status(400).json({ error: 'Invalid QR token' });
      return;
    }

    if (isQrSubmit && qrMatches && requestDeviceKey) {
      const { assertQrScanAllowed } = await import('../services/qrScanGuard.js');
      const qrGuard = await assertQrScanAllowed({
        taskId,
        participantId: req.participant!.id,
        deviceKey: requestDeviceKey,
        forumDay,
        executionType: task.executionType,
        dailyRepeatLimit: task.dailyRepeatLimit,
      });
      if (!qrGuard.ok) {
        if (qrGuard.outcome === 'blocked_duplicate' || qrGuard.outcome === 'blocked_device') {
          await recordBlockedQr(qrGuard.outcome, forumDay);
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
      if (isQrSubmit && qrMatches && requestDeviceKey) {
        const { recordQrScan } = await import('../services/qrScanGuard.js');
        try {
          await recordQrScan({
            taskId,
            participantId: req.participant!.id,
            vkUserId: req.participant!.vkId ?? null,
            deviceKey: requestDeviceKey,
            ipAddress,
            userAgent,
            outcome: 'success',
            submissionId: submission?.id ?? null,
            forumDay,
          });
        } catch (err) {
          if (isUniqueViolation(err)) {
            res.status(400).json({
              error: 'Не удалось зафиксировать повторный QR-скан. Обновите приложение и попробуйте снова.',
            });
            return;
          }
          throw err;
        }
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
    const msg = error instanceof Error ? error.message : String(error);
    if (/task_qr_scans/i.test(msg) || /relation .* does not exist/i.test(msg)) {
      res.status(503).json({
        error: 'Сервис подтверждения QR временно недоступен. Обновите приложение через минуту и попробуйте снова.',
      });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Resolve QR → task without submitting. Used after phone-camera scan so the
 * client can open the task form with the code applied invisibly.
 */
export const resolveTaskQr = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const raw = typeof req.body?.qr === 'string' ? req.body.qr : '';
    const code = normalizeTaskQrCode(raw);
    if (!code) {
      res.status(400).json({ error: 'Укажите код QR' });
      return;
    }

    const task = await findTaskByQrCode(code);
    if (!task) {
      res.status(404).json({ error: 'QR-код не найден' });
      return;
    }
    const bound = await resolveParticipantForTaskShift(req.participant!, task.shiftId);
    if (!bound.ok) {
      res.status(bound.status).json({ error: bound.error });
      return;
    }
    req.participant = bound.participant;

    const methods = taskMethodsForParticipant(task);
    if (!methods.includes('qr') && task.confirmationType !== 'qr') {
      res.status(400).json({ error: 'Это задание не подтверждается QR' });
      return;
    }

    const now = new Date();
    if (task.status !== 'published' || task.isHidden) {
      res.status(404).json({ error: 'QR-код не найден' });
      return;
    }
    if (task.publishTime && task.publishTime > now) {
      res.status(400).json({ error: 'Задание ещё не открыто' });
      return;
    }
    const forumDay = await resolveForumDayForNewEntry(req.participant.shiftId);
    if (!isQrInValidWindow(task, now, forumDay)) {
      res.status(400).json({
        error: 'QR-код задания сейчас не активен. Сканируйте только в указанное в админке время и дни.',
      });
      return;
    }

    res.json({
      taskId: task.id,
      taskTitle: task.title,
      shiftId: task.shiftId ?? req.participant.shiftId ?? null,
      /** Normalized token for client to send later on submit (never shown in UI). */
      qrToken: task.qrToken || code,
    });
  } catch (error) {
    console.error('resolveTaskQr:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Legacy instant-complete scan: body { qr }. Prefer resolve + submit with answer.
 * Identity comes from vkAuth launch-params HMAC (middleware), never from the body.
 */
export const scanTask = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const raw = typeof req.body?.qr === 'string' ? req.body.qr : '';
    const code = normalizeTaskQrCode(raw);
    if (!code) {
      res.status(400).json({ error: 'Укажите код QR' });
      return;
    }

    const task = await findTaskByQrCode(code);
    if (!task) {
      res.status(404).json({ error: 'QR-код не найден' });
      return;
    }
    const bound = await resolveParticipantForTaskShift(req.participant!, task.shiftId);
    if (!bound.ok) {
      res.status(bound.status).json({ error: bound.error });
      return;
    }
    req.participant = bound.participant;

    const methods = taskMethodsForParticipant(task);
    if (!methods.includes('qr') && task.confirmationType !== 'qr') {
      res.status(400).json({ error: 'Это задание не подтверждается QR' });
      return;
    }

    req.params.id = String(task.id);
    req.body = {
      ...(typeof req.body === 'object' && req.body ? req.body : {}),
      qrToken: task.qrToken,
      deviceKey: typeof req.body?.deviceKey === 'string' ? req.body.deviceKey : undefined,
      answerText: typeof req.body?.answerText === 'string' ? req.body.answerText : 'Готово',
    };

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 400) return originalJson(body);
      const b = body as {
        xpAwarded?: number;
        submission?: { id?: number; pointsAwarded?: number | null } | null;
      };
      const points = b.xpAwarded ?? b.submission?.pointsAwarded ?? 0;
      return originalJson({
        points,
        taskTitle: task.title,
        taskId: task.id,
        shiftId: task.shiftId ?? req.participant?.shiftId ?? null,
        submissionId: b.submission?.id ?? null,
        xpAwarded: points,
        track: 'experience',
      });
    }) as typeof res.json;

    await submitTask(req, res);
  } catch (error) {
    console.error('scanTask:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const redirectTaskQr = async (req: { params: { code?: string } }, res: Response): Promise<void> => {
  try {
    const { buildTaskScanDeepLink } = await import('../services/qrService.js');
    const code = normalizeTaskQrCode(String(req.params.code || ''));
    if (!code) {
      res.status(404).send('QR not found');
      return;
    }
    const task = await findTaskByQrCode(code);
    if (!task) {
      res.status(404).send('QR not found');
      return;
    }
    res.redirect(302, buildTaskScanDeepLink(task.qrToken || code, task.id));
  } catch (error) {
    console.error('redirectTaskQr:', error);
    res.status(500).send('Error');
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
        eq(participants.shiftId, req.participant!.shiftId),
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
