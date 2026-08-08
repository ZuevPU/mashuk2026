import { eq, inArray } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import {
  adminPushNotifications, participantPushDeliveries, pushLog, participants,
} from '../db/schema.js';
import { optOutCategoryForNotificationType, triggerTypeForCampaign } from './pushNotificationTypes.js';
import { expandPushPlaceholders, type PlaceholderContext } from './pushPlaceholderExpand.js';
import { resolveBroadcastParticipantIds, resolvePushAudience, type AudiencePayload } from './pushAudienceResolve.js';
import {
  clipDeliveryStatus,
  isPushDeliveredOk,
  shouldLogPushDeliveryIssue,
} from './pushDeliveryStatus.js';

export { describeDeliveryStatus } from './pushDeliveryStatus.js';

const VK_API = 'https://api.vk.com/method';
const VK_VERSION = '5.199';
const MINI_BATCH_SIZE = 100;

/** Простой rate-limit: не чаще 1 запроса / 50ms к VK API (Wave F) */
let lastVkCall = 0;
async function throttleVk(): Promise<void> {
  const wait = 50 - (Date.now() - lastVkCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastVkCall = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

type VkApiResult = { ok: boolean; status: string; errorCode?: number };

async function vkGet(
  method: string,
  params: Record<string, string>,
  token: string,
  attempt = 0,
): Promise<VkApiResult> {
  await throttleVk();
  const qs = new URLSearchParams({ ...params, access_token: token, v: VK_VERSION });
  const res = await fetch(`${VK_API}/${method}?${qs}`);
  const data = await res.json() as { error?: { error_msg: string; error_code?: number }; response?: unknown };
  if (data.error?.error_code === 6 || data.error?.error_code === 9) {
    if (attempt < 1) {
      await sleep(1000);
      return vkGet(method, params, token, attempt + 1);
    }
    return { ok: false, status: 'error: rate_limited', errorCode: data.error.error_code };
  }
  if (data.error) {
    return { ok: false, status: `error: ${data.error.error_msg}`, errorCode: data.error.error_code };
  }
  return { ok: true, status: 'ok' };
}

type VkNotifyItem = {
  user_id?: number;
  status?: boolean;
  error?: { code?: number; description?: string };
};

type VkSendMessageResponse = {
  error?: { error_msg: string; error_code?: number };
  response?: VkNotifyItem[];
};

async function callNotificationsSendMessage(
  userIds: number[],
  text: string,
  attempt = 0,
): Promise<VkSendMessageResponse> {
  await throttleVk();
  const qs = new URLSearchParams({
    user_ids: userIds.join(','),
    message: text.slice(0, 254),
    access_token: env.VK_SERVICE_TOKEN!,
    v: VK_VERSION,
  });
  const res = await fetch(`${VK_API}/notifications.sendMessage?${qs}`);
  const data = await res.json() as VkSendMessageResponse;
  if ((data.error?.error_code === 6 || data.error?.error_code === 9) && attempt < 1) {
    await sleep(1000);
    return callNotificationsSendMessage(userIds, text, attempt + 1);
  }
  return data;
}

function resultFromNotifyItem(item: VkNotifyItem | undefined): VkApiResult {
  if (!item) return { ok: false, status: 'error: empty_response' };
  if (item.status === true) return { ok: true, status: 'sent_mini' };
  const desc = item.error?.description?.trim()
    || (item.error?.code != null ? `code_${item.error.code}` : 'delivery_failed');
  return { ok: false, status: `error: ${desc}`, errorCode: item.error?.code };
}

/** Батч до 100 user_ids на один HTTP к notifications.sendMessage. */
export async function sendMiniAppNotificationBatch(
  vkIds: number[],
  text: string,
): Promise<Map<number, VkApiResult>> {
  const out = new Map<number, VkApiResult>();
  if (vkIds.length === 0) return out;
  if (!env.VK_SERVICE_TOKEN) {
    for (const id of vkIds) out.set(id, { ok: false, status: 'skipped_no_service_token' });
    return out;
  }

  for (let i = 0; i < vkIds.length; i += MINI_BATCH_SIZE) {
    const chunk = vkIds.slice(i, i + MINI_BATCH_SIZE);
    try {
      const data = await callNotificationsSendMessage(chunk, text);
      if (data.error) {
        const rateLimited = data.error.error_code === 6 || data.error.error_code === 9;
        const status = rateLimited ? 'error: rate_limited' : `error: ${data.error.error_msg}`;
        for (const id of chunk) {
          out.set(id, { ok: false, status, errorCode: data.error.error_code });
        }
        continue;
      }
      const items = Array.isArray(data.response) ? data.response : [];
      const byUser = new Map(items.filter(it => it.user_id != null).map(it => [it.user_id!, it]));
      for (const id of chunk) {
        out.set(id, resultFromNotifyItem(byUser.get(id)));
      }
    } catch (err) {
      for (const id of chunk) out.set(id, { ok: false, status: `error: ${String(err)}` });
    }
  }
  return out;
}

export async function sendMiniAppNotification(vkId: number, text: string): Promise<VkApiResult> {
  const map = await sendMiniAppNotificationBatch([vkId], text);
  return map.get(vkId) ?? { ok: false, status: 'error: empty_response' };
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
  if (triggerType === 'question_publish' || /^question_publish/i.test(triggerType)) return 'touchpoints';
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

async function finalizeDelivery(
  vkId: number,
  text: string,
  mini: VkApiResult,
  logContext?: string,
): Promise<string> {
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

export async function deliverToVkUser(vkId: number, text: string, logContext?: string): Promise<string> {
  if (!vkId) return 'skipped_no_vk_id';
  const mini = await sendMiniAppNotification(vkId, text);
  return finalizeDelivery(vkId, text, mini, logContext);
}

/** При одном participantId возвращает итоговый delivery_status. */
export async function sendPushNotification(
  participantIds: number[],
  text: string,
  triggerType: string,
): Promise<string | undefined> {
  const hasAnyToken = !!(env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN);
  let lastStatus: string | undefined;

  if (participantIds.length === 0) return undefined;

  const rows = await db.select().from(participants)
    .where(inArray(participants.id, participantIds));
  const byId = new Map(rows.map(r => [r.id, r]));

  type Pending = { participantId: number; vkId: number };
  const pending: Pending[] = [];

  for (const participantId of participantIds) {
    const p = byId.get(participantId);
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
        deliveryStatus: clipDeliveryStatus(lastStatus),
      });
      continue;
    }

    if (!hasAnyToken) {
      lastStatus = 'skipped_no_token';
      await db.insert(pushLog).values({
        participantId,
        text,
        triggerType,
        sentAt: new Date(),
        deliveryStatus: clipDeliveryStatus(lastStatus),
      });
      continue;
    }

    if (!p.vkId) {
      lastStatus = 'skipped_no_vk_id';
      await db.insert(pushLog).values({
        participantId,
        text,
        triggerType,
        sentAt: new Date(),
        deliveryStatus: clipDeliveryStatus(lastStatus),
      });
      continue;
    }

    pending.push({ participantId, vkId: p.vkId });
  }

  const miniByVk = await sendMiniAppNotificationBatch(pending.map(p => p.vkId), text);

  for (const item of pending) {
    const mini = miniByVk.get(item.vkId) ?? { ok: false, status: 'error: empty_response' };
    const deliveryStatus = await finalizeDelivery(
      item.vkId,
      text,
      mini,
      `trigger=${triggerType}`,
    );
    lastStatus = deliveryStatus;
    await db.insert(pushLog).values({
      participantId: item.participantId,
      text,
      triggerType,
      sentAt: new Date(),
      deliveryStatus: clipDeliveryStatus(deliveryStatus),
    });
  }

  return participantIds.length === 1 ? lastStatus : undefined;
}

export async function notifyAllParticipants(text: string, triggerType: string): Promise<void> {
  const ids = await resolveBroadcastParticipantIds();
  await sendPushNotification(ids, text, triggerType);
}

export type AdminPushRow = typeof adminPushNotifications.$inferSelect;

function isDeliveredOk(status: string): boolean {
  return isPushDeliveredOk(status);
}

/** VK text: title + body for mini-app (254 char limit on notifications.sendMessage) */
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
    { shiftId: notification.shiftId },
  );
  const triggerType = triggerTypeForCampaign(notification.id, notification.notificationType ?? 'reminder');
  const optCat = optOutCategoryForNotificationType(notification.notificationType ?? 'reminder');
  const hasAnyToken = !!(env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN);

  let delivered = 0;
  const now = new Date();

  type WorkItem = {
    participantId: number;
    vkId: number | null;
    personalizedBody: string;
    vkText: string;
    skipStatus?: string;
  };

  const work: WorkItem[] = [];
  if (participantIds.length > 0) {
    const rows = await db.select().from(participants)
      .where(inArray(participants.id, participantIds));
    const byId = new Map(rows.map(r => [r.id, r]));

    for (const participantId of participantIds) {
      const p = byId.get(participantId);
      if (!p) continue;

      const personalizedBody = expandPushPlaceholders(notification.body, p, {
        programDay: notification.programDay ?? ctx.programDay,
        eventTitle: ctx.eventTitle,
      });
      const vkText = formatVkPushText(notification.pushTitle, personalizedBody);
      const optOut = (p.pushOptOut as Record<string, boolean> | null) ?? {};

      if (optOut.all === true || optOut[optCat] === true) {
        work.push({ participantId, vkId: p.vkId, personalizedBody, vkText, skipStatus: 'skipped_opt_out' });
      } else if (!hasAnyToken) {
        work.push({ participantId, vkId: p.vkId, personalizedBody, vkText, skipStatus: 'skipped_no_token' });
      } else if (!p.vkId) {
        work.push({ participantId, vkId: null, personalizedBody, vkText, skipStatus: 'skipped_no_vk_id' });
      } else {
        work.push({ participantId, vkId: p.vkId, personalizedBody, vkText });
      }
    }
  }

  /** Группы с одинаковым текстом — один батч sendMessage. */
  const byText = new Map<string, WorkItem[]>();
  for (const item of work) {
    if (item.skipStatus) continue;
    const list = byText.get(item.vkText) ?? [];
    list.push(item);
    byText.set(item.vkText, list);
  }

  const deliveryByParticipant = new Map<number, string>();
  for (const item of work) {
    if (item.skipStatus) deliveryByParticipant.set(item.participantId, item.skipStatus);
  }

  for (const [vkText, items] of byText) {
    const vkIds = items.map(i => i.vkId!).filter(Boolean);
    const miniByVk = await sendMiniAppNotificationBatch(vkIds, vkText);
    for (const item of items) {
      const mini = miniByVk.get(item.vkId!) ?? { ok: false, status: 'error: empty_response' };
      const status = await finalizeDelivery(
        item.vkId!,
        vkText,
        mini,
        `campaign=${notification.id} participant=${item.participantId}`,
      );
      deliveryByParticipant.set(item.participantId, status);
    }
  }

  for (const item of work) {
    const vkDeliveryStatus = deliveryByParticipant.get(item.participantId) ?? 'skipped_no_token';
    const visibleUntil = notification.visibleUntil
      ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const statusForDb = clipDeliveryStatus(vkDeliveryStatus);

    const [delivery] = await db.insert(participantPushDeliveries).values({
      notificationId: notification.id,
      participantId: item.participantId,
      personalizedBody: item.personalizedBody,
      pushTitle: notification.pushTitle,
      icon: notification.icon,
      imageUrl: notification.imageUrl,
      visibleUntil,
      vkDeliveryStatus: statusForDb,
    }).returning();

    await db.insert(pushLog).values({
      participantId: item.participantId,
      text: item.vkText,
      triggerType,
      sentAt: new Date(),
      deliveryStatus: statusForDb,
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
