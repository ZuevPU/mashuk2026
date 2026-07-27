import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminPushNotifications } from '../db/schema.js';
import { executeAdminPushCampaign } from './pushService.js';

export async function processScheduledAdminPush(now = new Date()): Promise<number> {
  const due = await db.select().from(adminPushNotifications)
    .where(and(
      eq(adminPushNotifications.status, 'queued'),
      lte(adminPushNotifications.publishAt, now),
    ))
    .limit(20);

  let n = 0;
  for (const row of due) {
    if (row.sendMode === 'trigger') continue;
    await executeAdminPushCampaign(row);
    n += 1;
  }
  return n;
}

export async function fireAdminPushNow(notificationId: number): Promise<void> {
  const [row] = await db.select().from(adminPushNotifications)
    .where(eq(adminPushNotifications.id, notificationId)).limit(1);
  if (!row) throw new Error('Not found');
  if (row.status === 'sent') throw new Error('Already sent');
  await executeAdminPushCampaign(row);
}

export async function queueAdminPush(notificationId: number, publishAt: Date): Promise<void> {
  await db.update(adminPushNotifications)
    .set({
      status: 'queued',
      publishAt,
      sendMode: publishAt.getTime() <= Date.now() ? 'now' : 'scheduled',
      updatedAt: new Date(),
    })
    .where(eq(adminPushNotifications.id, notificationId));
}
