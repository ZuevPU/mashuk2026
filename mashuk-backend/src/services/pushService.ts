import { eq, isNotNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { pushLog, participants } from '../db/schema.js';

const VK_API = 'https://api.vk.com/method';

/** Простой rate-limit: не чаще 1 запроса / 50ms к VK API (Wave F) */
let lastVkCall = 0;
async function throttleVk(): Promise<void> {
  const wait = 50 - (Date.now() - lastVkCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastVkCall = Date.now();
}

export async function sendPushNotification(
  participantIds: number[],
  text: string,
  triggerType: string
): Promise<void> {
  for (const participantId of participantIds) {
    let deliveryStatus = 'skipped_no_token';

    const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
    if (!p) continue;

    const optOut = (p.pushOptOut as Record<string, boolean> | null) ?? {};
    const categoryOf = (t: string): string => {
      if (/touch|checkin|osmysl|evening|morning|point/i.test(t)) return 'touchpoints';
      if (/event|program|schedule|remind/i.test(t)) return 'program';
      if (/task|medal|moderate|volunteer/i.test(t)) return 'tasks';
      if (/exchange|org|peer|answer/i.test(t)) return 'exchange';
      return t;
    };
    const cat = categoryOf(triggerType);
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

    if (env.VK_SERVICE_TOKEN) {
      if (p.vkId) {
        try {
          await throttleVk();
          const params = new URLSearchParams({
            user_ids: String(p.vkId),
            message: text.slice(0, 254),
            access_token: env.VK_SERVICE_TOKEN,
            v: '5.199',
          });
          const res = await fetch(`${VK_API}/notifications.send?${params}`);
          const data = await res.json() as { error?: { error_msg: string; error_code?: number }; response?: unknown };
          if (data.error?.error_code === 6 || data.error?.error_code === 9) {
            // too many requests — backoff
            await new Promise(r => setTimeout(r, 1000));
            deliveryStatus = `error: rate_limited`;
          } else {
            deliveryStatus = data.error ? `error: ${data.error.error_msg}` : 'sent';
          }
        } catch (err) {
          deliveryStatus = `error: ${String(err)}`;
        }
      }
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
    .where(isNotNull(participants.onboardingCompletedAt));
  await sendPushNotification(all.map(p => p.id), text, triggerType);
}
