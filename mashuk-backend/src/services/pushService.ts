import { eq, isNotNull, isNull, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import {
  adminPushNotifications, participantPushDeliveries, pushLog, participants,
} from '../db/schema.js';
import { optOutCategoryForNotificationType, triggerTypeForCampaign } from './pushNotificationTypes.js';
import { expandPushPlaceholders, type PlaceholderContext } from './pushPlaceholderExpand.js';
import { resolvePushAudience, type AudiencePayload } from './pushAudienceResolve.js';
import { isPushDeliveredOk, shouldLogPushDeliveryIssue } from './pushDeliveryStatus.js';

export { describeDeliveryStatus } from './pushDeliveryStatus.js';

const VK_API = 'https://api.vk.com/method';
const VK_VERSION = '5.199';

/** Простой rate-limit: не чаще 1 запроса / 50ms к VK API (Wave F) */
let lastVkCall = 0;
async function throttleVk(): Promise<void> {
  const wait = 50 - (Date.now() - lastVkCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastVkCall = Date.now();
}

type VkApiResult = { ok: boolean; status: string; errorCode?: number };

async function vkGet(method: string, params: Record<string, string>, token: string): Promise<VkApiResult> {
  await throttleVk();
  const qs = new URLSearchParams({ ...params, access_token: token, v: VK_VERSION });
  const res = await fetch(`${VK_API}/${method}?${qs}`);
  const data = await res.json() as { error?: { error_msg: string; error_code?: number }; response?: unknown };
  if (data.error?.error_code === 6 || data.error?.error_code === 9) {
    await new Promise(r => setTimeout(r, 1000));
    return { ok: false, status: 'error: rate_limited', errorCode: data.error.error_code };
  }
  if (data.error) {
    return { ok: false, status: `error: ${data.error.error_msg}`, errorCode: data.error.error_code };
  }
  return { ok: true, status: 'ok' };
}

export async function sendMiniAppNotification(vkId: number, text: string): Promise<VkApiResult> {
  if (!env.VK_SERVICE_TOKEN) {
    return { ok: false, status: 'skipped_no_service_token' };
  }
  try {
    const r = await vkGet('notifications.send', {
      user_ids: String(vkId),
      message: text.slice(0, 254),
    }, env.VK_SERVICE_TOKEN);
    return r.ok ? { ok: true, status: 'sent_mini' } : r;
  } catch (err) {
    return { ok: false, status: `error: ${String(err)}` };
  }
}

/** Ссылка на мини-приложение в конце ЛС (не PUBLIC_URL / backend). */
export function pushAppLinkSuffix(): string {
  const url = (env.VK_MINI_APP_URL || 'https://vk.ru/app54662212').trim().replace(/\/+$/, '');
  if (!url) return '';
  return `\n\nОткрыть приложение:\n${url}`;
}

export async function sendCommunityMessage(vkId: number, text: string): Promise<VkApiResult> {
  if (!env.VK_COMMUNITY_TOKEN) {
    return { ok: false, status: 'skipped_no_community_token' };
  }
  const body = text.slice(0, 3900);
  const message = (body + pushAppLinkSuffix()).slice(0, 4090);
  try {
    const r = await vkGet('messages.send', {
      user_id: String(vkId),
      random_id: String(Math.floor(Math.random() * 2_000_000_000)),
      message,
    }, env.VK_COMMUNITY_TOKEN);
    return r.ok ? { ok: true, status: 'sent_community' } : r;
  } catch (err) {
    return { ok: false, status: `error: ${String(err)}` };
  }
}

/** Категория push для проверки pushOptOut участника */
export function pushCategoryOf(triggerType: string): string {
  if (triggerType === 'question_publish') return 'tasks';
  if (/^transactional_exchange/i.test(triggerType)) return 'exchange';
  if (/^auto_slot_/i.test(triggerType) || /^auto_retry_slot_/i.test(triggerType)) return 'touchpoints';
  if (/^touchpoint_/i.test(triggerType)) return 'touchpoints';
  if (/touch|checkin|osmysl|evening|morning|point/i.test(triggerType)) return 'touchpoints';
  if (/event|program|schedule|remind/i.test(triggerType)) return 'program';
  if (/^transactional_task|^transactional_medal|^transactional_level/i.test(triggerType)) return 'tasks';
  if (/^task_|medal|moderate|volunteer|level_up/i.test(triggerType)) return 'tasks';
  if (/exchange|peer|answer_received/i.test(triggerType)) return 'exchange';
  if (/^admin_campaign_.*_org/.test(triggerType)) return 'org';
  if (/^admin_campaign_/i.test(triggerType)) return 'program';
  return triggerType;
}

function shouldTryCommunity(mini: VkApiResult): boolean {
  if (mini.ok) return false;
  return mini.status.startsWith('error:')
    || mini.status === 'skipped_no_service_token'
    || mini.status === 'skipped_no_token';
}

export async function deliverToVkUser(vkId: number, text: string, logContext?: string): Promise<string> {
  if (!vkId) return 'skipped_no_vk_id';

  const mini = await sendMiniAppNotification(vkId, text);
  if (mini.ok) return mini.status;

  if (shouldTryCommunity(mini)) {
    const comm = await sendCommunityMessage(vkId, text);
    const status = comm.ok
      ? comm.status
      : (mini.status !== 'skipped_no_service_token'
        ? `${mini.status}; ${comm.status}`
        : comm.status);
    if (shouldLogPushDeliveryIssue(status)) {
      console.warn(`[push] deliver vkId=${vkId}${logContext ? ` ${logContext}` : ''} status=${status}`);
    }
    return status;
  }

  const status = mini.status;
  if (shouldLogPushDeliveryIssue(status)) {
    console.warn(`[push] deliver vkId=${vkId}${logContext ? ` ${logContext}` : ''} status=${status}`);
  }
  return status;
}

/** При одном participantId возвращает итоговый delivery_status. */
export async function sendPushNotification(
  participantIds: number[],
  text: string,
  triggerType: string,
): Promise<string | undefined> {
  const hasAnyToken = !!(env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN);
  let lastStatus: string | undefined;

  for (const participantId of participantIds) {
    const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
    if (!p) continue;

    const optOut = (p.pushOptOut as Record<string, boolean> | null) ?? {};
    const cat = pushCategoryOf(triggerType);
    if (optOut.all === true || optOut[triggerType] === true || optOut[cat] === true) {
      lastStatus = 'skipped_opt_out';
      await db.insert(pushLog).values({
        participantId,
        text,
        triggerType,
        sentAt: new Date(),
        deliveryStatus: lastStatus,
      });
      continue;
    }

    let deliveryStatus = 'skipped_no_token';
    if (!hasAnyToken) {
      deliveryStatus = 'skipped_no_token';
    } else if (p.vkId) {
      deliveryStatus = await deliverToVkUser(p.vkId, text, `trigger=${triggerType}`);
    } else {
      deliveryStatus = 'skipped_no_vk_id';
    }

    lastStatus = deliveryStatus;

    await db.insert(pushLog).values({
      participantId,
      text,
      triggerType,
      sentAt: new Date(),
      deliveryStatus,
    });
  }

  return participantIds.length === 1 ? lastStatus : undefined;
}

export async function notifyAllParticipants(text: string, triggerType: string): Promise<void> {
  const all = await db.select({ id: participants.id }).from(participants)
    .where(and(isNotNull(participants.onboardingCompletedAt), isNull(participants.selfDeletedAt)));
  await sendPushNotification(all.map(p => p.id), text, triggerType);
}

export type AdminPushRow = typeof adminPushNotifications.$inferSelect;

function isDeliveredOk(status: string): boolean {
  return isPushDeliveredOk(status);
}

/** VK text: title + body for mini-app (254 char limit on notifications.send) */
export function formatVkPushText(pushTitle: string | null | undefined, body: string): string {
  const t = pushTitle?.trim();
  if (t) return `${t}: ${body}`.slice(0, 254);
  return body.slice(0, 254);
}

export async function executeAdminPushCampaign(
  notification: AdminPushRow,
  ctx: PlaceholderContext = {},
): Promise<{ delivered: number; opened: number }> {
  const audiencePayload = (notification.audiencePayload ?? {}) as AudiencePayload;
  const participantIds = await resolvePushAudience(
    notification.audienceType ?? 'all',
    audiencePayload,
  );
  const triggerType = triggerTypeForCampaign(notification.id, notification.notificationType ?? 'reminder');
  const optCat = optOutCategoryForNotificationType(notification.notificationType ?? 'reminder');
  const hasAnyToken = !!(env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN);

  let delivered = 0;
  const now = new Date();

  for (const participantId of participantIds) {
    const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
    if (!p) continue;

    const personalizedBody = expandPushPlaceholders(notification.body, p, {
      programDay: notification.programDay ?? ctx.programDay,
      eventTitle: ctx.eventTitle,
    });
    const vkText = formatVkPushText(notification.pushTitle, personalizedBody);

    const optOut = (p.pushOptOut as Record<string, boolean> | null) ?? {};
    let vkDeliveryStatus = 'skipped_no_token';
    if (optOut.all === true || optOut[optCat] === true) {
      vkDeliveryStatus = 'skipped_opt_out';
    } else if (!hasAnyToken) {
      vkDeliveryStatus = 'skipped_no_token';
    } else if (p.vkId) {
      vkDeliveryStatus = await deliverToVkUser(
        p.vkId,
        vkText,
        `campaign=${notification.id} participant=${participantId}`,
      );
    } else {
      vkDeliveryStatus = 'skipped_no_vk_id';
    }

    const visibleUntil = notification.visibleUntil
      ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [delivery] = await db.insert(participantPushDeliveries).values({
      notificationId: notification.id,
      participantId,
      personalizedBody,
      pushTitle: notification.pushTitle,
      icon: notification.icon,
      imageUrl: notification.imageUrl,
      visibleUntil,
      vkDeliveryStatus,
    }).returning();

    await db.insert(pushLog).values({
      participantId,
      text: vkText,
      triggerType,
      sentAt: new Date(),
      deliveryStatus: vkDeliveryStatus,
      notificationId: notification.id,
      deliveryId: delivery.id,
    });

    if (isDeliveredOk(vkDeliveryStatus)) delivered += 1;
  }

  await db.update(adminPushNotifications)
    .set({
      status: 'sent',
      sentAt: now,
      deliveredCount: delivered,
      openedCount: 0,
      updatedAt: now,
    })
    .where(eq(adminPushNotifications.id, notification.id));

  return { delivered, opened: 0 };
}

export async function sendTestCampaignToParticipant(
  notification: AdminPushRow,
  participantId: number,
  ctx: PlaceholderContext = {},
): Promise<{ personalizedBody: string; deliveryStatus: string }> {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) throw new Error('Participant not found');
  const personalizedBody = expandPushPlaceholders(notification.body, p, {
    programDay: notification.programDay ?? ctx.programDay,
    eventTitle: ctx.eventTitle,
  });
  const vkText = formatVkPushText(notification.pushTitle, personalizedBody);
  const triggerType = `admin_test_${notification.id}`;
  const deliveryStatus = await sendPushNotification([participantId], vkText, triggerType) ?? 'unknown';
  return { personalizedBody, deliveryStatus };
}

export async function refreshNotificationStats(notificationId: number): Promise<void> {
  const rows = await db.select().from(participantPushDeliveries)
    .where(eq(participantPushDeliveries.notificationId, notificationId));
  let delivered = 0;
  let opened = 0;
  for (const r of rows) {
    if (isDeliveredOk(r.vkDeliveryStatus ?? '')) delivered += 1;
    if (r.openedAt) opened += 1;
  }
  await db.update(adminPushNotifications)
    .set({ deliveredCount: delivered, openedCount: opened, updatedAt: new Date() })
    .where(eq(adminPushNotifications.id, notificationId));
}
