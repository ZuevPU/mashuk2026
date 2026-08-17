import { and, desc, eq, gte, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  participants,
  pointsLog,
  taskQrScans,
  taskSubmissions,
  taskTeamConfirmations,
  tasks,
  userMedals,
} from '../db/schema.js';
import { recalculateParticipantTotals, revokePointsLogEntry } from './pointsService.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import {
  completeSubmissionRewards,
  submissionCreatePatch,
} from './submissionLifecycle.js';

export type ManualTaskResult =
  | { ok: true; submission: typeof taskSubmissions.$inferSelect }
  | { ok: false; error: string; status: number };

/**
 * Admin card: mark task completed. Always creates a NEW approved submission,
 * so the same task can be credited multiple times to one participant.
 */
export async function adminCompleteParticipantTask(
  participantId: number,
  taskId: number,
  moderatorComment?: string,
  opts?: { force?: boolean },
): Promise<ManualTaskResult> {
  const [p] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return { ok: false, error: 'Participant not found', status: 404 };

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return { ok: false, error: 'Task not found', status: 404 };

  if (task.confirmationType === 'team') {
    return { ok: false, error: 'Командные задания отмечайте через модерацию заявки', status: 400 };
  }

  if (!opts?.force) {
    const [already] = await db.select({ id: taskSubmissions.id }).from(taskSubmissions)
      .where(and(
        eq(taskSubmissions.participantId, participantId),
        eq(taskSubmissions.taskId, taskId),
        eq(taskSubmissions.status, 'approved'),
      ))
      .limit(1);
    if (already) {
      return {
        ok: false,
        error: 'Задание уже отмечено. Повтор создаст новое начисление баллов.',
        status: 409,
      };
    }
  }

  const lifecyclePatch = submissionCreatePatch({
    task,
    payload: { volunteer: false },
    status: 'approved',
    isTeam: false,
    forceAuto: true,
  });

  const [created] = await db.insert(taskSubmissions).values({
    participantId,
    taskId,
    status: 'approved',
    checkedAt: new Date(),
    verifiedAt: new Date(),
    moderatorComment: moderatorComment ?? 'Отмечено администратором',
    pointsAwarded: 0,
    submittedAt: new Date(),
    ...lifecyclePatch,
    proofType: 'moderator',
    verificationType: 'manual_moderator',
  }).returning();

  const submissionId = created!.id;

  await completeSubmissionRewards(submissionId, [participantId], task, {
    verificationType: 'manual_moderator',
    ignoreMaxAccruals: true,
  });

  const [submission] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  return { ok: true, submission: submission! };
}

export type RevokeSubmissionResult =
  | {
    ok: true;
    deleted: true;
    participantId: number;
    taskId: number;
    submissionId: number;
    revokedLogIds: number[];
  }
  | { ok: false; error: string; status: number };

const TASK_AWARD_ACTIONS = ['task_complete', 'admin_manual_task'] as const;

export async function revokePointsForSubmission(
  submission: typeof taskSubmissions.$inferSelect,
  task: typeof tasks.$inferSelect,
  reason: string,
): Promise<number[]> {
  const revoked = new Set<number>();
  const participantIds = new Set<number>([submission.participantId]);
  if (task.confirmationType === 'team' || Array.isArray(submission.teamMemberIds)) {
    const teamIds = (submission.teamMemberIds as number[]) || [];
    teamIds.forEach(id => participantIds.add(id));
  }

  // Primary: awardPoints stores submissionId on points_log.
  const bySubmission = await db.select().from(pointsLog).where(and(
    eq(pointsLog.submissionId, submission.id),
    isNull(pointsLog.revokedAt),
    gt(pointsLog.points, 0),
  ));
  for (const row of bySubmission) {
    const r = await revokePointsLogEntry(row.id, row.participantId, reason);
    if (r.ok) revoked.add(row.id);
  }

  if (submission.pointsLogId && !revoked.has(submission.pointsLogId)) {
    const r = await revokePointsLogEntry(submission.pointsLogId, submission.participantId, reason);
    if (r.ok) revoked.add(submission.pointsLogId);
  }

  // Fallback for older rows without submissionId / pointsLogId.
  const pts = submission.pointsAwarded ?? 0;
  if (pts > 0 && (submission.status === 'approved' || revoked.size === 0)) {
    const since = submission.checkedAt ?? submission.submittedAt ?? new Date(0);
    for (const pid of participantIds) {
      const rows = await db.select().from(pointsLog).where(and(
        eq(pointsLog.participantId, pid),
        inArray(pointsLog.actionType, [...TASK_AWARD_ACTIONS]),
        eq(pointsLog.points, pts),
        isNull(pointsLog.revokedAt),
        gte(pointsLog.createdAt, new Date(since.getTime() - 60_000)),
      )).orderBy(desc(pointsLog.createdAt)).limit(3);

      for (const row of rows) {
        if (revoked.has(row.id)) continue;
        const r = await revokePointsLogEntry(row.id, pid, reason);
        if (r.ok) revoked.add(row.id);
      }
    }
  }

  return [...revoked];
}

/** Strip awards from an approved submission but keep the row (for re-moderation). */
export async function stripSubmissionAwards(
  submission: typeof taskSubmissions.$inferSelect,
  task: typeof tasks.$inferSelect,
  reason = 'Изменение решения модерации',
): Promise<number[]> {
  const revokedLogIds = await revokePointsForSubmission(submission, task, reason);
  await db.update(taskSubmissions).set({
    userMedalId: null,
    pointsLogId: null,
    pointsAwarded: 0,
  }).where(eq(taskSubmissions.id, submission.id));
  await db.delete(userMedals).where(eq(userMedals.submissionId, submission.id));
  if (submission.userMedalId) {
    await db.delete(userMedals).where(eq(userMedals.id, submission.userMedalId));
  }
  await db.delete(taskQrScans).where(and(
    eq(taskQrScans.participantId, submission.participantId),
    eq(taskQrScans.taskId, submission.taskId),
  ));

  const affected = new Set<number>([submission.participantId]);
  ((submission.teamMemberIds as number[]) || []).forEach(id => affected.add(id));
  for (const pid of affected) {
    await recalculateParticipantTotals(pid);
    await evaluateMedalsForParticipant(pid);
  }
  return revokedLogIds;
}

/**
 * Admin «Отменить»: снять баллы, убрать сдачу/QR-скан и дать пройти задание снова.
 */
export async function adminRevokeTaskSubmission(
  submissionId: number,
  reason?: string,
): Promise<RevokeSubmissionResult> {
  const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  if (!existing) return { ok: false, error: 'Submission not found', status: 404 };

  const [task] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);
  if (!task) return { ok: false, error: 'Task not found', status: 404 };

  const revokeReason = reason?.trim() || 'Отмена выполнения администратором';
  const revokedLogIds = await revokePointsForSubmission(existing, task, revokeReason);
  await releaseTaskProgress(existing);

  const affectedParticipants = new Set<number>([existing.participantId]);
  const teamIds = (existing.teamMemberIds as number[]) || [];
  teamIds.forEach(id => affectedParticipants.add(id));

  for (const pid of affectedParticipants) {
    await recalculateParticipantTotals(pid);
    await evaluateMedalsForParticipant(pid);
  }

  return {
    ok: true,
    deleted: true,
    participantId: existing.participantId,
    taskId: existing.taskId,
    submissionId,
    revokedLogIds,
  };
}

/** Drop medals, QR scans and the submission row so the participant can do the task again. */
export async function releaseTaskProgress(
  submission: typeof taskSubmissions.$inferSelect,
): Promise<void> {
  const submissionId = submission.id;

  // Break possible FK: task_submissions.user_medal_id → user_medals.id
  await db.update(taskSubmissions).set({
    userMedalId: null,
    pointsLogId: null,
    pointsAwarded: 0,
  }).where(eq(taskSubmissions.id, submissionId));

  await db.delete(userMedals).where(eq(userMedals.submissionId, submissionId));
  if (submission.userMedalId) {
    await db.delete(userMedals).where(eq(userMedals.id, submission.userMedalId));
  }

  // Any leftover scan (success or blocked_*) keeps QR unique / "already done" guards.
  await db.delete(taskQrScans).where(and(
    eq(taskQrScans.participantId, submission.participantId),
    eq(taskQrScans.taskId, submission.taskId),
  ));
  const teamIds = (submission.teamMemberIds as number[]) || [];
  for (const pid of teamIds) {
    if (pid === submission.participantId) continue;
    await db.delete(taskQrScans).where(and(
      eq(taskQrScans.participantId, pid),
      eq(taskQrScans.taskId, submission.taskId),
    ));
  }

  await db.delete(taskTeamConfirmations).where(eq(taskTeamConfirmations.submissionId, submissionId));
  await db.delete(taskSubmissions).where(eq(taskSubmissions.id, submissionId));
}

const TASK_POINT_ACTIONS = new Set(['task_complete', 'admin_manual_task']);

/** After XP revoke from the card / levels tab, also uncomplete the linked task. */
export async function releaseTaskAfterPointsRevoke(opts: {
  participantId: number;
  actionType?: string | null;
  submissionId?: number | null;
  pointsLogId: number;
}): Promise<void> {
  if (opts.actionType && !TASK_POINT_ACTIONS.has(opts.actionType)) return;

  let submission: typeof taskSubmissions.$inferSelect | undefined;
  if (opts.submissionId) {
    const [row] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, opts.submissionId)).limit(1);
    submission = row;
  }
  if (!submission) {
    const [byLog] = await db.select().from(taskSubmissions)
      .where(eq(taskSubmissions.pointsLogId, opts.pointsLogId)).limit(1);
    submission = byLog;
  }
  if (!submission || submission.participantId !== opts.participantId) return;
  await releaseTaskProgress(submission);
}
