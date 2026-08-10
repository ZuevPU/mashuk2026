import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, taskTeamConfirmations, tasks } from '../db/schema.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';
import {
  completeSubmissionRewards,
  markSubmissionRejected,
  type VerificationType,
} from './submissionLifecycle.js';

export type TaskModerationResult =
  | { ok: true; submission: typeof taskSubmissions.$inferSelect }
  | { ok: false; error: string; status: number };

export async function applyTaskModeration(
  id: number,
  status: 'approved' | 'rejected',
  moderatorComment?: string | null,
  verifiedByAdminId?: number,
): Promise<TaskModerationResult> {
  const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
  if (!existing) {
    return { ok: false, error: 'Submission not found', status: 404 };
  }

  const [task] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);

  if (status === 'approved' && task?.confirmationType === 'team') {
    const confRows = await db.select().from(taskTeamConfirmations)
      .where(eq(taskTeamConfirmations.submissionId, id));
    if (confRows.length > 0 && !confRows.every(r => r.status === 'confirmed')) {
      return { ok: false, error: 'Командное задание: не все участники подтвердили участие', status: 400 };
    }
  }

  if (status === 'rejected') {
    // Changing an already-approved decision: strip points/medals first.
    if (existing.status === 'approved' && task && ((existing.pointsAwarded ?? 0) > 0 || existing.pointsLogId)) {
      const { stripSubmissionAwards } = await import('./adminManualTaskService.js');
      await stripSubmissionAwards(existing, task, moderatorComment || 'Решение модерации изменено на «отклонено»');
    }
    await markSubmissionRejected(id, moderatorComment, verifiedByAdminId);
    await db.update(taskSubmissions).set({
      pointsAwarded: 0,
      pointsLogId: null,
      userMedalId: null,
    }).where(eq(taskSubmissions.id, id));
    const [updated] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
    try {
      const title = task?.title || 'Задание';
      await sendPushNotification(
        [existing.participantId],
        pushCopy.taskRejected(title, moderatorComment),
        'transactional_task_rejected',
      );
    } catch {
      // push optional
    }
    return { ok: true, submission: updated! };
  }

  // Approve (including re-approve after reject or re-confirm).
  if (task && !(existing.pointsAwarded ?? 0)) {
    // Ensure status is not stuck rejected before awarding.
    if (existing.status !== 'approved') {
      await db.update(taskSubmissions).set({
        status: 'approved',
        lifecycleStage: 'confirmed',
        moderatorComment: moderatorComment ?? existing.moderatorComment,
        verifiedByAdminId: verifiedByAdminId ?? null,
        checkedAt: new Date(),
        verifiedAt: new Date(),
      }).where(eq(taskSubmissions.id, id));
    }
    const teamIds = (existing.teamMemberIds as number[]) || [];
    const payIds = task.confirmationType === 'team' && teamIds.length
      ? [...new Set([existing.participantId, ...teamIds])]
      : [existing.participantId];
    await completeSubmissionRewards(id, payIds, task, {
      verificationType: (existing.verificationType as VerificationType) || 'manual_moderator',
      verifiedByAdminId,
    });
  } else {
    await db.update(taskSubmissions)
      .set({
        status: 'approved',
        verifiedAt: new Date(),
        checkedAt: new Date(),
        verifiedByAdminId: verifiedByAdminId ?? null,
        moderatorComment: moderatorComment ?? existing.moderatorComment,
        lifecycleStage: existing.lifecycleStage || 'confirmed',
      })
      .where(eq(taskSubmissions.id, id));
  }

  const [updated] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);

  // Avoid spam when re-saving the same approved decision.
  if (existing.status !== 'approved') {
    try {
      const title = task?.title || 'Задание';
      await sendPushNotification(
        [existing.participantId],
        pushCopy.taskApproved(title, task?.points),
        'transactional_task_approved',
      );
    } catch {
      // push optional
    }
  }

  return { ok: true, submission: updated! };
}
