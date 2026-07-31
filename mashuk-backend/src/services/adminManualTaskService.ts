import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, taskSubmissions, tasks } from '../db/schema.js';
import { revokePointsLogEntry } from './pointsService.js';
import { assertTaskSubmissionAllowed } from './taskEligibility.js';
import { applyTaskModeration } from './taskModerationService.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import {
  completeSubmissionRewards,
  submissionCreatePatch,
} from './submissionLifecycle.js';

export type ManualTaskResult =
  | { ok: true; submission: typeof taskSubmissions.$inferSelect }
  | { ok: false; error: string; status: number };

export async function adminCompleteParticipantTask(
  participantId: number,
  taskId: number,
  moderatorComment?: string,
): Promise<ManualTaskResult> {
  const [p] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return { ok: false, error: 'Participant not found', status: 404 };

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return { ok: false, error: 'Task not found', status: 404 };

  if (task.confirmationType === 'team') {
    return { ok: false, error: 'Командные задания отмечайте через модерацию заявки', status: 400 };
  }

  const [existing] = await db.select().from(taskSubmissions)
    .where(and(
      eq(taskSubmissions.participantId, participantId),
      eq(taskSubmissions.taskId, taskId),
    ))
    .limit(1);

  if (existing?.status === 'approved' && (existing.pointsAwarded ?? 0) > 0) {
    return { ok: false, error: 'Задание уже выполнено', status: 400 };
  }

  const elig = await assertTaskSubmissionAllowed(participantId, task, {
    allowResubmitRejected: existing?.status === 'rejected',
    existingStatus: existing?.status ?? null,
  });
  if (!elig.ok && existing?.status !== 'rejected') {
    return { ok: false, error: elig.error, status: 400 };
  }

  const lifecyclePatch = submissionCreatePatch({
    task,
    payload: { volunteer: false },
    status: 'approved',
    isTeam: false,
    forceAuto: true,
  });
  let submissionId: number;

  if (existing) {
    const [updated] = await db.update(taskSubmissions)
      .set({
        status: 'approved',
        checkedAt: new Date(),
        verifiedAt: new Date(),
        moderatorComment: moderatorComment ?? 'Отмечено администратором',
        pointsAwarded: 0,
        pointsLogId: null,
        userMedalId: null,
        submittedAt: existing.submittedAt ?? new Date(),
        proofType: 'moderator',
        verificationType: 'manual_moderator',
        lifecycleStage: 'confirmed',
      })
      .where(eq(taskSubmissions.id, existing.id))
      .returning();
    submissionId = updated!.id;
  } else {
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
    submissionId = created!.id;
  }

  await completeSubmissionRewards(submissionId, [participantId], task, {
    verificationType: 'manual_moderator',
  });

  const [submission] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  return { ok: true, submission: submission! };
}

export type RevokeSubmissionResult =
  | { ok: true; submission: typeof taskSubmissions.$inferSelect; revokedLogIds: number[] }
  | { ok: false; error: string; status: number };

const TASK_AWARD_ACTIONS = ['task_complete', 'admin_manual_task'] as const;

async function revokePointsForSubmission(
  submission: typeof taskSubmissions.$inferSelect,
  task: typeof tasks.$inferSelect,
  reason: string,
): Promise<number[]> {
  const pts = submission.pointsAwarded ?? 0;
  if (pts <= 0 || submission.status !== 'approved') return [];

  if (submission.pointsLogId) {
    const r = await revokePointsLogEntry(submission.pointsLogId, submission.participantId, reason);
    if (r.ok) return [submission.pointsLogId];
  }

  const since = submission.checkedAt ?? submission.submittedAt ?? new Date(0);
  const participantIds = new Set<number>([submission.participantId]);
  if (task.confirmationType === 'team') {
    const teamIds = (submission.teamMemberIds as number[]) || [];
    teamIds.forEach(id => participantIds.add(id));
  }

  const revoked: number[] = [];
  for (const pid of participantIds) {
    const rows = await db.select().from(pointsLog).where(and(
      eq(pointsLog.participantId, pid),
      inArray(pointsLog.actionType, [...TASK_AWARD_ACTIONS]),
      eq(pointsLog.points, pts),
      isNull(pointsLog.revokedAt),
      gte(pointsLog.createdAt, new Date(since.getTime() - 60_000)),
    )).orderBy(desc(pointsLog.createdAt)).limit(3);

    for (const row of rows) {
      const r = await revokePointsLogEntry(row.id, pid, reason);
      if (r.ok) revoked.push(row.id);
    }
  }
  return revoked;
}

export async function adminRevokeTaskSubmission(
  submissionId: number,
  reason?: string,
): Promise<RevokeSubmissionResult> {
  const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  if (!existing) return { ok: false, error: 'Submission not found', status: 404 };

  const [task] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);
  if (!task) return { ok: false, error: 'Task not found', status: 404 };

  const revokeReason = reason?.trim() || 'Отмена выполнения администратором';
  let revokedLogIds: number[] = [];

  if (existing.status === 'approved' && (existing.pointsAwarded ?? 0) > 0) {
    revokedLogIds = await revokePointsForSubmission(existing, task, revokeReason);
  }

  const mod = await applyTaskModeration(submissionId, 'rejected', revokeReason);
  if (!mod.ok) {
    return { ok: false, error: mod.error, status: mod.status };
  }

  await db.update(taskSubmissions)
    .set({ pointsAwarded: 0 })
    .where(eq(taskSubmissions.id, submissionId));

  await evaluateMedalsForParticipant(existing.participantId);

  const [submission] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).limit(1);
  return { ok: true, submission: submission!, revokedLogIds };
}
