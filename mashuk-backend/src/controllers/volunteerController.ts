import { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, taskSubmissions, tasks } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';
import { awardPoints } from '../services/pointsService.js';
import { evaluateMedalsForParticipant } from '../services/medalEvaluator.js';
import { logAdminAction } from '../services/adminActionsLog.js';

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

    // Non-admin VK path: must be linked as admin user with vkId
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
    if (confirmType !== 'qr' && confirmType !== 'auto') {
      res.status(400).json({ error: 'Это задание не подтверждается по QR' });
      return;
    }

    const [existing] = await db.select().from(taskSubmissions)
      .where(and(
        eq(taskSubmissions.participantId, participant.id),
        eq(taskSubmissions.taskId, task.id),
      )).limit(1);

    if (existing?.status === 'approved') {
      res.json({ ok: true, alreadyConfirmed: true, submission: existing });
      return;
    }

    const pointsAwarded = task.points ?? 0;
    let submission;
    if (existing) {
      [submission] = await db.update(taskSubmissions).set({
        status: 'approved',
        pointsAwarded,
        checkedAt: new Date(),
        moderatorComment: 'Подтверждено волонтёром по QR',
        answerText: existing.answerText || 'QR-подтверждение',
      }).where(eq(taskSubmissions.id, existing.id)).returning();
    } else {
      [submission] = await db.insert(taskSubmissions).values({
        participantId: participant.id,
        taskId: task.id,
        answerText: 'QR-подтверждение',
        status: 'approved',
        pointsAwarded,
        checkedAt: new Date(),
        moderatorComment: 'Подтверждено волонтёром по QR',
      }).returning();
    }

    if (pointsAwarded > 0) {
      await awardPoints(participant.id, 'task_complete', pointsAwarded);
    }
    await evaluateMedalsForParticipant(participant.id);

    if (isAdmin) {
      await logAdminAction({
        req,
        actionType: 'volunteer_confirm',
        section: 'tasks',
        objectId: submission.id,
        newValue: { participantId: participant.id, taskId: task.id },
      });
    }

    res.json({
      ok: true,
      submission,
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
      },
      pointsAwarded,
    });
  } catch (error) {
    console.error('volunteerConfirm:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
