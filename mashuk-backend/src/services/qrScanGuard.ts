import { and, eq, ne } from 'drizzle-orm';
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

export async function assertQrScanAllowed(params: {
  taskId: number;
  participantId: number;
  deviceKey: string;
}): Promise<{ ok: true } | { ok: false; error: string; outcome: QrScanOutcome }> {
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

  const [deviceHit] = await db.select({
    id: taskQrScans.id,
    participantId: taskQrScans.participantId,
  })
    .from(taskQrScans)
    .where(and(
      eq(taskQrScans.taskId, params.taskId),
      eq(taskQrScans.deviceKey, params.deviceKey),
      eq(taskQrScans.outcome, 'success'),
      ne(taskQrScans.participantId, params.participantId),
    ))
    .limit(1);
  if (deviceHit) {
    return {
      ok: false,
      error: 'Это QR-задание уже выполнено с этого же устройства другим участником. Откройте мини-приложение со своего телефона или попросите волонтёра подтвердить задание.',
      outcome: 'blocked_device',
    };
  }

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
  });
}
