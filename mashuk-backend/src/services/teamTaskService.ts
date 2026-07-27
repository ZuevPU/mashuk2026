import { and, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, taskTeamConfirmations, tasks, forumSettings } from '../db/schema.js';
import { awardPoints } from './pointsService.js';
import { effectiveTaskPoints } from './taskPoints.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import { sendPushNotification } from './pushService.js';

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
    await db.update(taskSubmissions)
      .set({ status: 'rejected', checkedAt: new Date(), moderatorComment: 'Отклонено участником команды' })
      .where(eq(taskSubmissions.id, submissionId));
    return false;
  }
  if (!rows.every(r => r.status === 'confirmed')) return false;

  const [task] = await db.select().from(tasks).where(eq(tasks.id, sub.taskId)).limit(1);
  if (!task) return false;
  const pts = effectiveTaskPoints(task);
  if (!pts) return false;

  await db.update(taskSubmissions)
    .set({ status: 'approved', checkedAt: new Date(), pointsAwarded: pts })
    .where(eq(taskSubmissions.id, submissionId));

  const teamIds = (sub.teamMemberIds as number[]) || [];
  const payIds = new Set([sub.participantId, ...teamIds]);
  for (const pid of payIds) {
    await awardPoints(pid, 'task_complete', pts, task.dayNumber ?? undefined);
    await evaluateMedalsForParticipant(pid);
  }
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
    await db.update(taskSubmissions)
      .set({ status: 'expired', checkedAt: now, moderatorComment: 'Истекло время подтверждения команды' })
      .where(eq(taskSubmissions.id, s.id));
    await sendPushNotification(
      [s.participantId],
      `Командная заявка «${t.title}» закрыта — не все подтвердили участие в срок`,
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
    `Подтвердите участие в командном задании «${taskTitle}»`,
    `team_confirm_${submissionId}`,
  );
}

export async function awardTeamOnModeratorApprove(
  submission: typeof taskSubmissions.$inferSelect,
  task: typeof tasks.$inferSelect,
): Promise<void> {
  const pts = effectiveTaskPoints(task);
  if (task.confirmationType !== 'team') {
    await awardPoints(submission.participantId, 'task_complete', pts, task.dayNumber ?? undefined);
    return;
  }
  const rows = await db.select().from(taskTeamConfirmations)
    .where(eq(taskTeamConfirmations.submissionId, submission.id));
  if (rows.length > 0 && !rows.every(r => r.status === 'confirmed')) {
    return;
  }
  const teamIds = (submission.teamMemberIds as number[]) || [];
  const payIds = new Set([submission.participantId, ...teamIds]);
  for (const pid of payIds) {
    await awardPoints(pid, 'task_complete', pts, task.dayNumber ?? undefined);
  }
}
