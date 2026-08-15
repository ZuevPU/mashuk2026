import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminPushNotifications, events, pushTriggerFires,
} from '../db/schema.js';
import { executeAdminPushCampaign } from './pushService.js';
import { resolveEventInterval } from './eventSchedule.js';
import { getForumSettings } from './helpers.js';

type TriggerConfig = {
  kind?: string;
  eventId?: number;
  minutesBefore?: number;
  taskId?: number;
  token?: string;
};

async function claimTriggerFire(notificationId: number, fireKey: string): Promise<boolean> {
  try {
    await db.insert(pushTriggerFires).values({ notificationId, fireKey });
    return true;
  } catch {
    return false;
  }
}

export async function runProgramEventBeforeTriggers(now = new Date()): Promise<number> {
  const settings = await getForumSettings();
  const rows = await db.select().from(adminPushNotifications)
    .where(and(
      eq(adminPushNotifications.status, 'queued'),
      eq(adminPushNotifications.sendMode, 'trigger'),
    ));

  let fired = 0;
  for (const n of rows) {
    const cfg = (n.triggerConfig ?? {}) as TriggerConfig;
    if (cfg.kind !== 'program_event_before' || !cfg.eventId) continue;

    const [ev] = await db.select().from(events).where(eq(events.id, cfg.eventId)).limit(1);
    if (!ev || !ev.isPublished || !ev.dayPublished) continue;

    const interval = resolveEventInterval(ev, ev.shiftId ? await getForumSettings(ev.shiftId) : settings);
    if (!interval?.start) continue;

    const minutesBefore = cfg.minutesBefore ?? 15;
    const triggerAt = new Date(interval.start.getTime() - minutesBefore * 60_000);
    if (now < triggerAt || now > interval.start) continue;

    const fireKey = `event_${cfg.eventId}_${interval.start.toISOString()}`;
    if (!(await claimTriggerFire(n.id, fireKey))) continue;

    await executeAdminPushCampaign(n, {
      programDay: ev.dayNumber ?? undefined,
      eventTitle: ev.title,
    });
    await db.update(adminPushNotifications)
      .set({ triggerFiredAt: now, updatedAt: now })
      .where(eq(adminPushNotifications.id, n.id));
    fired += 1;
  }
  return fired;
}

export async function fireTaskPublishTrigger(taskId: number, now = new Date()): Promise<void> {
  const rows = await db.select().from(adminPushNotifications)
    .where(and(
      eq(adminPushNotifications.status, 'queued'),
      eq(adminPushNotifications.sendMode, 'trigger'),
    ));

  for (const n of rows) {
    const cfg = (n.triggerConfig ?? {}) as TriggerConfig;
    if (cfg.kind !== 'task_publish') continue;
    if (cfg.taskId != null && cfg.taskId !== taskId) continue;

    const fireKey = `task_${taskId}`;
    if (!(await claimTriggerFire(n.id, fireKey))) continue;

    await executeAdminPushCampaign(n);
    await db.update(adminPushNotifications)
      .set({ triggerFiredAt: now, updatedAt: now })
      .where(eq(adminPushNotifications.id, n.id));
  }
}

export async function fireWebhookTrigger(token: string, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  const rows = await db.select().from(adminPushNotifications)
    .where(and(
      eq(adminPushNotifications.status, 'queued'),
      eq(adminPushNotifications.sendMode, 'trigger'),
    ));

  const match = rows.find(n => {
    const cfg = (n.triggerConfig ?? {}) as TriggerConfig;
    return cfg.kind === 'webhook' && cfg.token === token;
  });
  if (!match) return { ok: false, error: 'not_found' };

  const fireKey = `webhook_${now.toISOString().slice(0, 16)}`;
  if (!(await claimTriggerFire(match.id, fireKey))) {
    return { ok: false, error: 'already_fired_recently' };
  }

  await executeAdminPushCampaign(match);
  await db.update(adminPushNotifications)
    .set({ triggerFiredAt: now, updatedAt: now })
    .where(eq(adminPushNotifications.id, match.id));
  return { ok: true };
}
