import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { eventAttendance, events } from '../db/schema.js';
import { awardPoints } from './pointsService.js';

export type RecordAttendanceResult = {
  ok: true;
  record: typeof eventAttendance.$inferSelect;
  duplicate: boolean;
  xpAwarded: number;
  track: string;
} | {
  ok: false;
  error: string;
  status: number;
};

/**
 * Idempotent event attendance + XP. When qrToken is provided, validates against events.qr_token.
 */
export async function recordEventAttendance(
  participantId: number,
  eventId: number,
  opts?: { qrToken?: string | null },
): Promise<RecordAttendanceResult> {
  if (!Number.isFinite(eventId) || eventId <= 0) {
    return { ok: false, error: 'Invalid event id', status: 400 };
  }

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) {
    return { ok: false, error: 'Event not found', status: 404 };
  }

  const qrToken = opts?.qrToken?.trim();
  if (qrToken) {
    if (!event.qrToken) {
      return { ok: false, error: 'Event QR is not configured', status: 400 };
    }
    if (event.qrToken !== qrToken) {
      return { ok: false, error: 'Invalid event QR token', status: 403 };
    }
  }

  const [existing] = await db.select().from(eventAttendance)
    .where(and(
      eq(eventAttendance.participantId, participantId),
      eq(eventAttendance.eventId, eventId),
    )).limit(1);
  if (existing) {
    return {
      ok: true,
      record: existing,
      duplicate: true,
      xpAwarded: 0,
      track: 'path',
    };
  }

  const [record] = await db.insert(eventAttendance).values({
    participantId,
    eventId,
  }).returning();

  const pointsResult = await awardPoints(participantId, 'attendance');

  return {
    ok: true,
    record,
    duplicate: false,
    xpAwarded: pointsResult?.awarded ?? 0,
    track: pointsResult?.track ?? 'path',
  };
}

/** Parse bot/deep-link ref: event_<id>_<token> */
export function parseEventAttendanceRef(ref: string): { eventId: number; qrToken: string } | null {
  const m = ref.trim().match(/^event_(\d+)_([a-f0-9]{16,64})$/i);
  if (!m) return null;
  const eventId = Number(m[1]);
  if (!Number.isFinite(eventId) || eventId <= 0) return null;
  return { eventId, qrToken: m[2] };
}

export function buildEventAttendanceRef(eventId: number, token: string): string {
  return `event_${eventId}_${token}`;
}
