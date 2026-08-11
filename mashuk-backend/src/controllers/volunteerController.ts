import { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, taskSubmissions, tasks } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { taskMethodsForParticipant } from '../services/taskAdminHelpers.js';
import {
  assertTaskSubmissionAllowed,
  isQrInValidWindow,
  loadParticipantTaskSubmissions,
  resolveSubmissionWriteAction,
} from '../services/taskEligibility.js';
import { resolveForumDayForNewEntry } from '../services/piggybankService.js';
import {
  completeSubmissionRewards,
  enrichSubmissionRow,
  submissionCreatePatch,
} from '../services/submissionLifecycle.js';

/**
 * POST /volunteer/confirm
 * Body: { participantQrToken, taskId }
 * Auth: admin Bearer OR VK user who is staff (admin_users.vk_id match)
 */
export const volunteerConfirm = async (req: AdminRequest & VkAuthRequest, res: Response): Promise<void> => {
  try {
    const { participantQrToken, taskId } = req.body as {
      participantQrToken?: string;
      taskId?: number;
    };

    if (!participantQrToken || !taskId) {
      res.status(400).json({ error: 'participantQrToken and taskId required' });
      return;
    }

    const isAdmin = !!req.isAdmin;
    let volunteerVkId = req.vkUserId;

    if (!isAdmin && !volunteerVkId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!isAdmin) {
      const { adminUsers } = await import('../db/schema.js');
      const [staff] = await db.select().from(adminUsers)
        .where(and(eq(adminUsers.vkId, volunteerVkId!), eq(adminUsers.isActive, true)))
        .limit(1);
      if (!staff) {
        res.status(403).json({ error: 'Только волонтёры / сотрудники могут подтверждать' });
        return;
      }
    }

    const [participant] = await db.select().from(participants)
      .where(eq(participants.qrToken, participantQrToken))
      .limit(1);
    if (!participant) {
      res.status(404).json({ error: 'Участник с таким QR не найден' });
      return;
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, Number(taskId))).limit(1);
    if (!task) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }
    const confirmType = task.confirmationType || 'text_photo';
    const methods = taskMethodsForParticipant(task);
    if (!methods.includes('volunteer') && !methods.includes('qr') && confirmType !== 'qr' && confirmType !== 'auto') {
      res.status(400).json({ error: 'Это задание не подтверждается по QR/волонтёру' });
      return;
    }
    const now = new Date();
    const forumDay = await resolveForumDayForNewEntry();
    if (!isQrInValidWindow(task, now, forumDay)) {
      res.status(400).json({ error: 'QR-код задания сейчас не активен' });
      return;
    }

    const taskSubs = await loadParticipantTaskSubmissions(participant.id, task.id);
    const rejectedSub = taskSubs.find(s => s.status === 'rejected' || s.status === 'expired');
    const allowResubmit = !!rejectedSub && task.allowRetry !== false;

    const elig = await assertTaskSubmissionAllowed(participant.id, task, {
      allowResubmitRejected: allowResubmit,
      existingStatus: rejectedSub?.status ?? null,
    });
    if (!elig.ok && !allowResubmit) {
      const lastApproved = taskSubs.find(s => s.status === 'approved');
      if (lastApproved && (lastApproved.lifecycleStage === 'points_awarded' || lastApproved.lifecycleStage === 'medal_awarded' || (lastApproved.pointsAwarded ?? 0) > 0)) {
        res.json({ ok: true, alreadyConfirmed: true, submission: enrichSubmissionRow(lastApproved) });
        return;
      }
      res.status(400).json({ error: elig.error });
      return;
    }

    const writeAction = resolveSubmissionWriteAction(task, taskSubs, elig.ok, allowResubmit);
    if (writeAction.action === 'block') {
      res.status(400).json({ error: writeAction.error });
      return;
    }

    const lifecyclePatch = submissionCreatePatch({
      task,
      payload: { volunteer: true, qrToken: participantQrToken },
      status: 'approved',
      isTeam: false,
      forceAuto: true,
    });

    let submissionId: number;
    if (writeAction.action === 'update') {
      const [updated] = await db.update(taskSubmissions).set({
        status: 'approved',
        pointsAwarded: 0,
        pointsLogId: null,
        userMedalId: null,
        checkedAt: new Date(),
        verifiedAt: new Date(),
        verifiedByVolunteerVkId: volunteerVkId ?? null,
        verifiedByAdminId: isAdmin ? req.adminId ?? null : null,
        moderatorComment: 'Подтверждено волонтёром по QR',
        answerText: 'QR-подтверждение',
        submittedAt: new Date(),
        ...lifecyclePatch,
        proofType: 'volunteer',
        verificationType: 'manual_volunteer',
      }).where(eq(taskSubmissions.id, writeAction.submissionId)).returning();
      submissionId = updated!.id;
    } else {
      const [created] = await db.insert(taskSubmissions).values({
        participantId: participant.id,
        taskId: task.id,
        answerText: 'QR-подтверждение',
        status: 'approved',
        pointsAwarded: 0,
        checkedAt: new Date(),
        verifiedAt: new Date(),
        verifiedByVolunteerVkId: volunteerVkId ?? null,
        verifiedByAdminId: isAdmin ? req.adminId ?? null : null,
        moderatorComment: 'Подтверждено волонтёром по QR',
        ...lifecyclePatch,
        proofType: 'volunteer',
        verificationType: 'manual_volunteer',
      }).returning();
      submissionId = created!.id;
    }

    const rewards = await completeSubmissionRewards(submissionId, [participant.id], task, {
      verificationType: 'manual_volunteer',
      verifiedByVolunteerVkId: volunteerVkId ?? undefined,
      verifiedByAdminId: isAdmin ? req.adminId : undefined,
    });

    const [submission] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);

    if (isAdmin) {
      await logAdminAction({
        req,
        actionType: 'volunteer_confirm',
        section: 'tasks',
        objectId: submissionId,
        newValue: { participantId: participant.id, taskId: task.id },
      });
    }

    res.json({
      ok: true,
      submission: submission ? enrichSubmissionRow(submission) : null,
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
      },
      pointsAwarded: submission?.pointsAwarded ?? 0,
      pointsLogId: rewards.pointsLogId,
      userMedalId: rewards.userMedalId,
    });
  } catch (error) {
    console.error('volunteerConfirm:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
