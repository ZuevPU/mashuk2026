import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, taskTeamConfirmations, tasks, forumSettings } from '../db/schema.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';
import {
  completeSubmissionRewards,
  markSubmissionExpired,
  markSubmissionRejected,
} from './submissionLifecycle.js';

export async function createTeamConfirmations(
  submissionId: number,
  leaderId: number,
  memberIds: number[],
): Promise<void> {
  const all = new Set([leaderId, ...memberIds]);
  for (const pid of all) {
    const [exists] = await db.select({ id: taskTeamConfirmations.id }).from(taskTeamConfirmations)
      .where(and(
        eq(taskTeamConfirmations.submissionId, submissionId),
        eq(taskTeamConfirmations.participantId, pid),
      )).limit(1);
    if (exists) continue;
    await db.insert(taskTeamConfirmations).values({
      submissionId,
      participantId: pid,
      status: pid === leaderId ? 'confirmed' : 'pending',
      respondedAt: pid === leaderId ? new Date() : null,
    });
  }
}

export async function tryFinalizeTeamSubmission(submissionId: number): Promise<boolean> {
  const [sub] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  if (!sub || sub.status !== 'pending_team') return false;

  const rows = await db.select().from(taskTeamConfirmations)
    .where(eq(taskTeamConfirmations.submissionId, submissionId));
  if (rows.length === 0) return false;
  if (rows.some(r => r.status === 'declined')) {
    await markSubmissionRejected(submissionId, 'Отклонено участником команды');
    return false;
  }
  if (!rows.every(r => r.status === 'confirmed')) return false;

  const [task] = await db.select().from(tasks).where(eq(tasks.id, sub.taskId)).limit(1);
  if (!task) return false;

  const teamIds = (sub.teamMemberIds as number[]) || [];
  const payIds = [...new Set([sub.participantId, ...teamIds])];
  await completeSubmissionRewards(submissionId, payIds, task, {
    verificationType: 'team_confirm',
  });
  return true;
}

export async function expireStaleTeamSubmissions(now = new Date()): Promise<number> {
  const pending = await db.select({ s: taskSubmissions, t: tasks })
    .from(taskSubmissions)
    .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
    .where(eq(taskSubmissions.status, 'pending_team'));

  const [settings] = await db.select().from(forumSettings).limit(1);
  const defaultHours = settings?.teamConfirmHoursDefault ?? 24;
  let n = 0;

  for (const { s, t } of pending) {
    const hours = t.teamConfirmHours ?? defaultHours;
    const deadline = new Date(s.submittedAt!.getTime() + hours * 3600_000);
    if (now <= deadline) continue;
    await markSubmissionExpired(s.id, 'Истекло время подтверждения команды');
    await sendPushNotification(
      [s.participantId],
      pushCopy.teamExpired(t.title),
      `team_expired_${s.id}`,
    );
    n += 1;
  }
  return n;
}

export async function notifyTeamConfirmRequest(
  submissionId: number,
  taskTitle: string,
  memberIds: number[],
): Promise<void> {
  if (memberIds.length === 0) return;
  await sendPushNotification(
    memberIds,
    pushCopy.teamConfirmRequest(taskTitle),
    `team_confirm_${submissionId}`,
  );
}

export async function awardTeamOnModeratorApprove(
  submission: typeof taskSubmissions.$inferSelect,
  task: typeof tasks.$inferSelect,
  verifiedByAdminId?: number,
): Promise<void> {
  const teamIds = (submission.teamMemberIds as number[]) || [];
  const payIds = task.confirmationType === 'team' && teamIds.length
    ? [...new Set([submission.participantId, ...teamIds])]
    : [submission.participantId];
  await completeSubmissionRewards(submission.id, payIds, task, {
    verificationType: 'manual_moderator',
    verifiedByAdminId,
  });
}
