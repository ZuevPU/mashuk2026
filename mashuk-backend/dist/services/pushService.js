import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { pushLog, participants } from '../db/schema.js';
import { eq } from 'drizzle-orm';
const VK_API = 'https://api.vk.com/method';
export async function sendPushNotification(participantIds, text, triggerType) {
    for (const participantId of participantIds) {
        let deliveryStatus = 'skipped_no_token';
        if (env.VK_SERVICE_TOKEN) {
            const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
            if (p?.vkId) {
                try {
                    const params = new URLSearchParams({
                        user_ids: String(p.vkId),
                        message: text,
                        access_token: env.VK_SERVICE_TOKEN,
                        v: '5.199',
                    });
                    const res = await fetch(`${VK_API}/notifications.send?${params}`);
                    const data = await res.json();
                    deliveryStatus = data.error ? `error: ${data.error.error_msg}` : 'sent';
                }
                catch (err) {
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
export async function notifyAllParticipants(text, triggerType) {
    const all = await db.select({ id: participants.id }).from(participants);
    await sendPushNotification(all.map(p => p.id), text, triggerType);
}
