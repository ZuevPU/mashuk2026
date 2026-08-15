import { and, desc, eq, gte, lte, ne, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, tasks } from '../db/schema.js';
import { taskDayNumbers } from './taskAdminHelpers.js';
import { getMoscowParts } from './timePhase.js';

export type TaskSubmissionRow = typeof taskSubmissions.$inferSelect;

export function isRepeatableExecution(executionType: string | null | undefined): boolean {
  return executionType === 'daily' || executionType === 'repeatable' || executionType === 'multiple';
}

function bySubmittedAtDesc(a: TaskSubmissionRow, b: TaskSubmissionRow): number {
  return (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0);
}

export function pickDisplaySubmission(submissions: TaskSubmissionRow[]): TaskSubmissionRow | undefined {
  if (!submissions.length) return undefined;
  const pending = submissions
    .filter(s => s.status === 'pending' || s.status === 'pending_team')
    .sort(bySubmittedAtDesc);
  if (pending.length) return pending[0];
  return [...submissions].sort(bySubmittedAtDesc)[0];
}

export function findPendingSubmission(submissions: TaskSubmissionRow[]): TaskSubmissionRow | undefined {
  return submissions.find(s => s.status === 'pending' || s.status === 'pending_team');
}

export function findRejectedSubmission(submissions: TaskSubmissionRow[]): TaskSubmissionRow | undefined {
  return submissions
    .filter(s => s.status === 'rejected' || s.status === 'expired')
    .sort(bySubmittedAtDesc)[0];
}

export type SubmissionWriteAction =
  | { action: 'insert' }
  | { action: 'update'; submissionId: number }
  | { action: 'block'; error: string };

export function resolveSubmissionWriteAction(
  task: typeof tasks.$inferSelect,
  submissions: TaskSubmissionRow[],
  eligOk: boolean,
  allowResubmitRejected: boolean,
): SubmissionWriteAction {
  const pending = findPendingSubmission(submissions);
  if (pending) {
    return { action: 'block', error: 'Заявка уже на проверке' };
  }

  const rejected = findRejectedSubmission(submissions);
  if (rejected && !allowResubmitRejected) {
    return { action: 'block', error: 'Заявка отклонена, повторная отправка недоступна' };
  }
  if (allowResubmitRejected && rejected) {
    return { action: 'update', submissionId: rejected.id };
  }

  if (!eligOk) {
    return { action: 'block', error: 'Already submitted' };
  }

  const executionType = task.executionType || 'once';
  const hasApproved = submissions.some(s => s.status === 'approved');
  if (!submissions.length || (isRepeatableExecution(executionType) && hasApproved)) {
    return { action: 'insert' };
  }

  return { action: 'insert' };
}

export async function loadParticipantTaskSubmissions(
  participantId: number,
  taskId: number,
): Promise<TaskSubmissionRow[]> {
  return db.select().from(taskSubmissions)
    .where(and(
      eq(taskSubmissions.participantId, participantId),
      eq(taskSubmissions.taskId, taskId),
    ))
    .orderBy(desc(taskSubmissions.submittedAt));
}

export function normalizePostUrl(raw: string): string {
  let s = raw.trim();
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.hostname.toLowerCase()}${path}${u.search}`.toLowerCase();
  } catch {
    return s.toLowerCase().replace(/\/+$/, '');
  }
}

function mskDayBounds(now: Date): { start: Date; end: Date } {
  const { dateKey } = getMoscowParts(now);
  const start = new Date(`${dateKey}T00:00:00+03:00`);
  const end = new Date(`${dateKey}T23:59:59.999+03:00`);
  return { start, end };
}

function asValidDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Admin time-only saves are anchored on 2000-01-01; those skip absolute calendar bounds. */
function isTimeOnlyAnchor(d: Date): boolean {
  return getMoscowParts(d).dateKey.startsWith('2000-01-01');
}

function isWithinMskClockWindow(now: Date, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  const nowMin = getMoscowParts(now).totalMinutes;
  const fromMin = from ? getMoscowParts(from).totalMinutes : 0;
  const toMin = to ? getMoscowParts(to).totalMinutes : (24 * 60 - 1);
  if (!Number.isFinite(nowMin) || !Number.isFinite(fromMin) || !Number.isFinite(toMin)) {
    return false; // fail closed
  }
  if (fromMin <= toMin) {
    return nowMin >= fromMin && nowMin <= toMin;
  }
  // Overnight window, e.g. 22:00 → 02:00
  return nowMin >= fromMin || nowMin <= toMin;
}

/**
 * QR is active only when ALL apply:
 * 1) Moscow clock time is inside qrValidFrom..qrValidTo time-of-day (repeats each selected day)
 * 2) optional forumDay ∈ task.dayNumbers
 * 3) for legacy full datetimes (not 2000-01-01 anchors): now is also inside the absolute [from, to]
 */
export function isQrInValidWindow(
  task: {
    qrValidFrom?: Date | string | null;
    qrValidTo?: Date | string | null;
    dayNumbers?: number[] | null;
    dayNumber?: number | null;
  },
  now = new Date(),
  forumDay?: number | null,
): boolean {
  const from = asValidDate(task.qrValidFrom ?? null);
  const to = asValidDate(task.qrValidTo ?? null);

  // Invalid stored bounds must not open the QR.
  if (task.qrValidFrom != null && task.qrValidFrom !== '' && !from) return false;
  if (task.qrValidTo != null && task.qrValidTo !== '' && !to) return false;

  if ((from || to) && !isWithinMskClockWindow(now, from, to)) {
    return false;
  }

  // Legacy admin datetime-local ranges: also require absolute calendar bounds.
  const realFrom = from && !isTimeOnlyAnchor(from) ? from : null;
  const realTo = to && !isTimeOnlyAnchor(to) ? to : null;
  if (realFrom && now < realFrom) return false;
  if (realTo && now > realTo) return false;

  if (forumDay != null && forumDay > 0) {
    const days = taskDayNumbers(task as Pick<typeof tasks.$inferSelect, 'dayNumbers' | 'dayNumber'>);
    if (days.length && !days.includes(forumDay)) return false;
  }
  return true;
}

export async function assertTaskSubmissionAllowed(
  participantId: number,
  task: typeof tasks.$inferSelect,
  opts?: { allowResubmitRejected?: boolean; existingStatus?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const executionType = task.executionType || 'once';
  const now = new Date();
  const { start, end } = mskDayBounds(now);

  const approved = await db.select().from(taskSubmissions).where(and(
    eq(taskSubmissions.participantId, participantId),
    eq(taskSubmissions.taskId, task.id),
    eq(taskSubmissions.status, 'approved'),
  ));

  if (executionType === 'once') {
    if (approved.length > 0 && !(opts?.allowResubmitRejected && opts.existingStatus === 'rejected')) {
      return { ok: false, error: 'Задание уже выполнено (одноразовое)' };
    }
  } else if (executionType === 'daily') {
    const todayApproved = approved.filter(s =>
      s.checkedAt && s.checkedAt >= start && s.checkedAt <= end,
    );
    if (todayApproved.length > 0 && !(opts?.allowResubmitRejected && opts.existingStatus === 'rejected')) {
      return { ok: false, error: 'Задание уже выполнено сегодня' };
    }
  } else if (executionType === 'repeatable' || executionType === 'multiple') {
    const limit = task.dailyRepeatLimit ?? 1;
    const todayCount = approved.filter(s =>
      s.checkedAt && s.checkedAt >= start && s.checkedAt <= end,
    ).length;
    if (todayCount >= limit && !(opts?.allowResubmitRejected && opts.existingStatus === 'rejected')) {
      return { ok: false, error: `Достигнут лимит выполнений на сегодня (${limit})` };
    }
  }

  return { ok: true };
}

/** Task from another shift must look like a missing task — do not leak titles. */
export function taskBelongsToParticipantShift(
  task: { shiftId?: number | null },
  participantShiftId: number | null | undefined,
): boolean {
  if (participantShiftId == null || !Number.isFinite(participantShiftId)) return false;
  if (task.shiftId == null) return true;
  return task.shiftId === participantShiftId;
}

export async function assertPostUrlUnique(
  postUrl: string,
  participantId: number,
): Promise<{ ok: true; normalized: string } | { ok: false; error: string }> {
  const normalized = normalizePostUrl(postUrl);
  const [dup] = await db.select().from(taskSubmissions)
    .where(and(
      eq(taskSubmissions.postUrlNormalized, normalized),
      ne(taskSubmissions.participantId, participantId),
      or(eq(taskSubmissions.status, 'approved'), eq(taskSubmissions.status, 'pending'), eq(taskSubmissions.status, 'pending_team')),
    ))
    .limit(1);
  if (dup) {
    return { ok: false, error: 'Эта ссылка уже использована другим участником' };
  }
  return { ok: true, normalized };
}
