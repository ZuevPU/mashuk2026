import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, tasks } from '../db/schema.js';
import { awardPoints } from './pointsService.js';
import { resolveTaskAwardPoints } from './taskPoints.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import { awardTaskLinkedMedals } from './taskMedalAward.js';
import { taskMethodsForParticipant } from './taskAdminHelpers.js';

export const PROOF_TYPES = ['qr', 'photo', 'post', 'volunteer', 'moderator', 'team'] as const;
export const VERIFICATION_TYPES = ['auto', 'manual_moderator', 'manual_volunteer', 'team_confirm'] as const;
export const LIFECYCLE_STAGES = [
  'created',
  'awaiting_confirm',
  'confirmed',
  'points_awarded',
  'medal_awarded',
  'rejected',
  'expired',
] as const;

export type ProofType = (typeof PROOF_TYPES)[number];
export type VerificationType = (typeof VERIFICATION_TYPES)[number];
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  qr: 'QR',
  photo: 'Фото',
  post: 'Пост VK',
  volunteer: 'Волонтёр',
  moderator: 'Модератор',
  team: 'Команда',
};

export const VERIFICATION_TYPE_LABELS: Record<VerificationType, string> = {
  auto: 'Авто',
  manual_moderator: 'Модератор',
  manual_volunteer: 'Волонтёр',
  team_confirm: 'Команда',
};

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  created: 'Создана',
  awaiting_confirm: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  points_awarded: 'Баллы начислены',
  medal_awarded: 'Медаль получена',
  rejected: 'Отклонена',
  expired: 'Истекла',
};

export const LIFECYCLE_CHAIN: LifecycleStage[] = [
  'created',
  'awaiting_confirm',
  'confirmed',
  'points_awarded',
  'medal_awarded',
];

type TaskLike = Pick<typeof tasks.$inferSelect, 'confirmationMethods' | 'confirmationType' | 'autoConfirm' | 'scopeType'>;
type SubmissionLike = Partial<Pick<typeof taskSubmissions.$inferSelect,
  'status' | 'lifecycleStage' | 'pointsAwarded' | 'pointsLogId' | 'userMedalId' | 'proofType' | 'verificationType'
>> & { status?: string | null };

export function inferProofType(
  task: TaskLike,
  payload: {
    qrToken?: string;
    photoUrl?: string | null;
    postUrl?: string;
    answerText?: string;
    teamMemberIds?: number[] | null;
    volunteer?: boolean;
  },
): ProofType {
  if (payload.volunteer) return 'volunteer';
  if (payload.qrToken) return 'qr';
  if (payload.postUrl?.trim()) return 'post';
  if (payload.photoUrl) return 'photo';
  const methods = taskMethodsForParticipant(task);
  if (methods.includes('team') || (payload.teamMemberIds?.length ?? 0) > 0) return 'team';
  if (methods.includes('qr')) return 'qr';
  if (methods.includes('link')) return 'post';
  if (methods.includes('photo')) return 'photo';
  if (methods.includes('volunteer')) return 'volunteer';
  return 'moderator';
}

export function inferVerificationType(
  opts: { isTeam: boolean; forceAuto: boolean; via?: 'volunteer' | 'moderator' },
): VerificationType {
  if (opts.via === 'volunteer') return 'manual_volunteer';
  if (opts.via === 'moderator') return 'manual_moderator';
  if (opts.isTeam) return 'team_confirm';
  if (opts.forceAuto) return 'auto';
  return 'manual_moderator';
}

export function deriveLifecycleStage(sub: SubmissionLike): LifecycleStage {
  if (sub.lifecycleStage && LIFECYCLE_STAGES.includes(sub.lifecycleStage as LifecycleStage)) {
    return sub.lifecycleStage as LifecycleStage;
  }
  if (sub.status === 'rejected') return 'rejected';
  if (sub.status === 'expired') return 'expired';
  if (sub.status === 'pending' || sub.status === 'pending_team') return 'awaiting_confirm';
  if (sub.userMedalId) return 'medal_awarded';
  if (sub.pointsLogId || (sub.pointsAwarded ?? 0) > 0) return 'points_awarded';
  if (sub.status === 'approved') return 'confirmed';
  return 'created';
}

export function lifecycleChainProgress(stage: LifecycleStage): {
  stage: LifecycleStage;
  label: string;
  chain: { key: LifecycleStage; label: string; done: boolean; current: boolean }[];
} {
  const derived = stage;
  const terminal = derived === 'rejected' || derived === 'expired';
  const chain = LIFECYCLE_CHAIN.map(key => {
    let done = false;
    let current = false;
    if (terminal) {
      current = false;
      done = false;
    } else if (derived === key) {
      current = true;
      done = true;
    } else {
      const idx = LIFECYCLE_CHAIN.indexOf(derived);
      const keyIdx = LIFECYCLE_CHAIN.indexOf(key);
      done = idx >= 0 && keyIdx >= 0 && keyIdx < idx;
      current = false;
    }
    return { key, label: LIFECYCLE_STAGE_LABELS[key], done, current };
  });
  return { stage: derived, label: LIFECYCLE_STAGE_LABELS[derived], chain };
}

export type EnrichedSubmission = typeof taskSubmissions.$inferSelect & {
  lifecycleStage: LifecycleStage;
  lifecycleLabel: string;
  lifecycleChain: ReturnType<typeof lifecycleChainProgress>['chain'];
  proofTypeLabel: string | null;
  verificationTypeLabel: string | null;
};

export function enrichSubmissionRow<T extends Record<string, unknown>>(row: T): T & {
  lifecycleStage: LifecycleStage;
  lifecycleLabel: string;
  lifecycleChain: ReturnType<typeof lifecycleChainProgress>['chain'];
  proofTypeLabel: string | null;
  verificationTypeLabel: string | null;
} {
  const stage = deriveLifecycleStage(row as unknown as SubmissionLike);
  const chainInfo = lifecycleChainProgress(stage);
  const proof = row.proofType as ProofType | null | undefined;
  const verification = row.verificationType as VerificationType | null | undefined;
  return {
    ...row,
    lifecycleStage: stage,
    lifecycleLabel: chainInfo.label,
    lifecycleChain: chainInfo.chain,
    proofTypeLabel: proof ? PROOF_TYPE_LABELS[proof] ?? proof : null,
    verificationTypeLabel: verification ? VERIFICATION_TYPE_LABELS[verification] ?? verification : null,
  };
}

export function submissionCreatePatch(opts: {
  task: TaskLike;
  payload: Parameters<typeof inferProofType>[1];
  status: string;
  isTeam: boolean;
  forceAuto: boolean;
}): {
  proofType: ProofType;
  verificationType: VerificationType;
  lifecycleStage: LifecycleStage;
} {
  const proofType = inferProofType(opts.task, opts.payload);
  const verificationType = inferVerificationType({
    isTeam: opts.isTeam,
    forceAuto: opts.forceAuto,
  });
  let lifecycleStage: LifecycleStage = 'created';
  if (opts.status === 'pending' || opts.status === 'pending_team') lifecycleStage = 'awaiting_confirm';
  else if (opts.forceAuto) lifecycleStage = 'confirmed';
  return { proofType, verificationType, lifecycleStage };
}

export async function completeSubmissionRewards(
  submissionId: number,
  participantIds: number[],
  task: typeof tasks.$inferSelect,
  opts: {
    verificationType?: VerificationType;
    verifiedByAdminId?: number;
    verifiedByVolunteerVkId?: number;
    /** Admin manual card: allow awarding beyond once/daily task_complete caps. */
    ignoreMaxAccruals?: boolean;
  } = {},
): Promise<{ pointsLogId: number | null; userMedalId: number | null; lifecycleStage: LifecycleStage }> {
  const pts = await resolveTaskAwardPoints(task);
  const leaderId = participantIds[0];
  let pointsLogId: number | null = null;
  let userMedalId: number | null = null;

  for (const pid of participantIds) {
    if (pts > 0) {
      const result = await awardPoints(pid, 'task_complete', pts, task.dayNumber ?? undefined, {
        submissionId,
        ignoreMaxAccruals: opts.ignoreMaxAccruals,
      });
      if (pid === leaderId && result?.logId) pointsLogId = result.logId;
    }
    const medal = await awardTaskLinkedMedals(pid, task, submissionId);
    if (pid === leaderId) userMedalId = medal.userMedalId;
    await evaluateMedalsForParticipant(pid);
  }

  const lifecycleStage: LifecycleStage = userMedalId ? 'medal_awarded' : (pointsLogId || pts > 0 ? 'points_awarded' : 'confirmed');
  const now = new Date();

  await db.update(taskSubmissions).set({
    status: 'approved',
    pointsAwarded: pts,
    pointsLogId,
    userMedalId,
    lifecycleStage,
    verifiedAt: now,
    checkedAt: now,
    verifiedByAdminId: opts.verifiedByAdminId ?? null,
    verifiedByVolunteerVkId: opts.verifiedByVolunteerVkId ?? null,
    verificationType: opts.verificationType ?? undefined,
  }).where(eq(taskSubmissions.id, submissionId));

  return { pointsLogId, userMedalId, lifecycleStage };
}

export async function markSubmissionRejected(
  submissionId: number,
  moderatorComment?: string | null,
  verifiedByAdminId?: number,
): Promise<void> {
  await db.update(taskSubmissions).set({
    status: 'rejected',
    lifecycleStage: 'rejected',
    moderatorComment: moderatorComment ?? null,
    checkedAt: new Date(),
    verifiedAt: new Date(),
    verifiedByAdminId: verifiedByAdminId ?? null,
  }).where(eq(taskSubmissions.id, submissionId));
}

export async function markSubmissionExpired(submissionId: number, comment: string): Promise<void> {
  await db.update(taskSubmissions).set({
    status: 'expired',
    lifecycleStage: 'expired',
    moderatorComment: comment,
    checkedAt: new Date(),
  }).where(eq(taskSubmissions.id, submissionId));
}
