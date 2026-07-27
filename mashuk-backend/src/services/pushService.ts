import { eq, isNotNull, isNull, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { pushLog, participants } from '../db/schema.js';

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

export async function sendCommunityMessage(vkId: number, text: string): Promise<VkApiResult> {
  if (!env.VK_COMMUNITY_TOKEN) {
    return { ok: false, status: 'skipped_no_community_token' };
  }
  const body = text.slice(0, 4090);
  const linkSuffix = env.PUBLIC_URL ? `\n${env.PUBLIC_URL}` : '';
  const message = (body + linkSuffix).slice(0, 4090);
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
  if (/exchange|org|peer|answer_received/i.test(triggerType)) return 'exchange';
  return triggerType;
}

function shouldTryCommunity(mini: VkApiResult): boolean {
  if (mini.ok) return false;
  return mini.status.startsWith('error:')
    || mini.status === 'skipped_no_service_token'
    || mini.status === 'skipped_no_token';
}

export async function deliverToVkUser(vkId: number, text: string): Promise<string> {
  if (!vkId) return 'skipped_no_vk_id';

  const mini = await sendMiniAppNotification(vkId, text);
  if (mini.ok) return mini.status;

  if (shouldTryCommunity(mini)) {
    const comm = await sendCommunityMessage(vkId, text);
    if (comm.ok) return comm.status;
    if (mini.status !== 'skipped_no_service_token') {
      return `${mini.status}; ${comm.status}`;
    }
    return comm.status;
  }

  return mini.status;
}

export async function sendPushNotification(
  participantIds: number[],
  text: string,
  triggerType: string,
): Promise<void> {
  const hasAnyToken = !!(env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN);

  for (const participantId of participantIds) {
    const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
    if (!p) continue;

    const optOut = (p.pushOptOut as Record<string, boolean> | null) ?? {};
    const cat = pushCategoryOf(triggerType);
    if (optOut.all === true || optOut[triggerType] === true || optOut[cat] === true) {
      await db.insert(pushLog).values({
        participantId,
        text,
        triggerType,
        sentAt: new Date(),
        deliveryStatus: 'skipped_opt_out',
      });
      continue;
    }

    let deliveryStatus = 'skipped_no_token';
    if (!hasAnyToken) {
      deliveryStatus = 'skipped_no_token';
    } else if (p.vkId) {
      deliveryStatus = await deliverToVkUser(p.vkId, text);
    } else {
      deliveryStatus = 'skipped_no_vk_id';
    }

    await db.insert(pushLog).values({
      participantId,
      text,
      triggerType,
      sentAt: new Date(),
      deliveryStatus,
    });
  }
}

export async function notifyAllParticipants(text: string, triggerType: string): Promise<void> {
  const all = await db.select({ id: participants.id }).from(participants)
    .where(and(isNotNull(participants.onboardingCompletedAt), isNull(participants.selfDeletedAt)));
  await sendPushNotification(all.map(p => p.id), text, triggerType);
}
