import { and, eq, gte, lte, ne, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskSubmissions, tasks } from '../db/schema.js';
import { getMoscowParts } from './timePhase.js';

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

export function isQrInValidWindow(
  task: { qrValidFrom?: Date | null; qrValidTo?: Date | null },
  now = new Date(),
): boolean {
  if (task.qrValidFrom && now < new Date(task.qrValidFrom)) return false;
  if (task.qrValidTo && now > new Date(task.qrValidTo)) return false;
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
