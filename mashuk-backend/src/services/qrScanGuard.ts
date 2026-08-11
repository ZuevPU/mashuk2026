import { and, count, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/index.js';
import { taskQrScans } from '../db/schema.js';
import { buildDeviceKey } from './qrService.js';

export type QrScanOutcome = 'success' | 'blocked_duplicate' | 'blocked_device';

export function resolveRequestDeviceKey(req: Request, clientDeviceKey?: string | null): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = req.ip
    || (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null)
    || null;
  return buildDeviceKey({
    ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    clientDeviceKey,
  });
}

/** How many successful QR claims are allowed for this task on one forum day. */
export function maxQrSuccessesPerForumDay(
  executionType?: string | null,
  dailyRepeatLimit?: number | null,
): number {
  // `daily` = once per day; only `repeatable`/`multiple` use the numeric limit.
  if (executionType === 'repeatable' || executionType === 'multiple') {
    return Math.max(1, dailyRepeatLimit ?? 1);
  }
  return 1;
}

export async function assertQrScanAllowed(params: {
  taskId: number;
  participantId: number;
  deviceKey: string;
  forumDay: number;
  executionType?: string | null;
  dailyRepeatLimit?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string; outcome: QrScanOutcome }> {
  const limit = maxQrSuccessesPerForumDay(params.executionType, params.dailyRepeatLimit);

  if ((params.executionType || 'once') === 'once') {
    const [ownSuccess] = await db.select({ id: taskQrScans.id })
      .from(taskQrScans)
      .where(and(
        eq(taskQrScans.taskId, params.taskId),
        eq(taskQrScans.participantId, params.participantId),
        eq(taskQrScans.outcome, 'success'),
      ))
      .limit(1);
    if (ownSuccess) {
      return {
        ok: false,
        error: 'Вы уже выполнили это QR-задание',
        outcome: 'blocked_duplicate',
      };
    }
    return { ok: true };
  }

  const [row] = await db.select({ n: count() })
    .from(taskQrScans)
    .where(and(
      eq(taskQrScans.taskId, params.taskId),
      eq(taskQrScans.participantId, params.participantId),
      eq(taskQrScans.forumDay, params.forumDay),
      eq(taskQrScans.outcome, 'success'),
    ));
  const successCount = Number(row?.n ?? 0);
  if (successCount >= limit) {
    return {
      ok: false,
      error: limit <= 1
        ? 'Вы уже выполнили это QR-задание сегодня'
        : `Достигнут лимит QR-выполнений на сегодня (${limit})`,
      outcome: 'blocked_duplicate',
    };
  }

  // Device-share block disabled for live forum: shared Wi‑Fi / WebView storage
  // produced false positives. Same participant still cannot exceed daily limit (above).
  void params.deviceKey;

  return { ok: true };
}

export async function recordQrScan(params: {
  taskId: number;
  participantId: number;
  vkUserId?: number | null;
  deviceKey: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: QrScanOutcome;
  submissionId?: number | null;
  forumDay: number;
}): Promise<void> {
  await db.insert(taskQrScans).values({
    taskId: params.taskId,
    participantId: params.participantId,
    vkUserId: params.vkUserId ?? null,
    deviceKey: params.deviceKey,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    outcome: params.outcome,
    submissionId: params.submissionId ?? null,
    forumDay: params.forumDay,
  });
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}
