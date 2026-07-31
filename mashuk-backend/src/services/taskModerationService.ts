import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, taskTeamConfirmations, tasks } from '../db/schema.js';
import { sendPushNotification } from './pushService.js';

export type TaskModerationResult =
  | { ok: true; submission: typeof taskSubmissions.$inferSelect }
  | { ok: false; error: string; status: number };

export async function applyTaskModeration(
  id: number,
  status: 'approved' | 'rejected',
  moderatorComment?: string | null,
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

  const [updated] = await db.update(taskSubmissions)
    .set({ status, moderatorComment: moderatorComment ?? null, checkedAt: new Date() })
    .where(eq(taskSubmissions.id, id)).returning();

  if (status === 'approved' && updated && !(existing.pointsAwarded ?? 0) && task) {
    const { awardTeamOnModeratorApprove } = await import('./teamTaskService.js');
    const { resolveTaskAwardPoints } = await import('./taskPoints.js');
    const pts = await resolveTaskAwardPoints(task);
    await awardTeamOnModeratorApprove(updated, task);
    await db.update(taskSubmissions)
      .set({ pointsAwarded: pts })
      .where(eq(taskSubmissions.id, id));
    updated.pointsAwarded = pts;
    const { awardTaskLinkedMedals } = await import('./taskMedalAward.js');
    await awardTaskLinkedMedals(existing.participantId, task);
    if (task.confirmationType === 'team') {
      const teamIds = (existing.teamMemberIds as number[]) || [];
      for (const pid of teamIds) {
        if (pid !== existing.participantId) await awardTaskLinkedMedals(pid, task);
      }
    }
  }

  try {
    const title = task?.title || 'Задание';
    if (status === 'approved') {
      await sendPushNotification(
        [existing.participantId],
        `Задание «${title}» принято${task?.points ? ` · +${task.points} ⚡` : ''}`,
        'transactional_task_approved',
      );
    } else if (status === 'rejected') {
      await sendPushNotification(
        [existing.participantId],
        `Задание «${title}» не принято${moderatorComment ? `: ${moderatorComment}` : ''}`,
        'transactional_task_rejected',
      );
    }
  } catch {
    // push optional
  }

  return { ok: true, submission: updated! };
}
