import type { Request, Response } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { env } from '../config/env.js';
import { resolveActiveShiftId } from '../services/shiftService.js';
import {
  parseEventAttendanceRef,
  recordEventAttendance,
} from '../services/eventAttendanceService.js';
import { sendCommunityMessage } from '../services/pushService.js';

type VkCallbackBody = {
  type?: string;
  group_id?: number;
  secret?: string;
  object?: {
    message?: {
      from_id?: number;
      peer_id?: number;
      text?: string;
      ref?: string;
      payload?: string;
    };
  };
};

function extractRef(message: NonNullable<VkCallbackBody['object']>['message']): string | null {
  if (!message) return null;
  if (typeof message.ref === 'string' && message.ref.trim()) return message.ref.trim();
  const text = (message.text || '').trim();
  const fromText = text.match(/\bevent_\d+_[a-f0-9]+\b/i);
  if (fromText) return fromText[0];
  if (message.payload) {
    try {
      const p = JSON.parse(message.payload) as { ref?: string };
      if (typeof p.ref === 'string') return p.ref;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function findParticipantByVk(vkId: number) {
  const shiftId = await resolveActiveShiftId();
  const [row] = await db.select().from(participants).where(and(
    eq(participants.vkId, vkId),
    eq(participants.shiftId, shiftId),
    isNull(participants.selfDeletedAt),
  )).limit(1);
  return row ?? null;
}

/**
 * VK Callback API: phone-camera QR → vk.me?ref=event_<id>_<token> → attendance + XP.
 */
export async function vkBotCallback(req: Request, res: Response): Promise<void> {
  const body = req.body as VkCallbackBody;

  if (env.VK_CALLBACK_SECRET && body.secret && body.secret !== env.VK_CALLBACK_SECRET) {
    res.status(403).json({ error: 'Invalid secret' });
    return;
  }

  if (body.type === 'confirmation') {
    res.status(200).send(env.VK_CALLBACK_CONFIRMATION || 'ok');
    return;
  }

  res.status(200).send('ok');

  if (body.type !== 'message_new') return;

  const message = body.object?.message;
  const vkId = message?.from_id;
  if (!vkId || vkId <= 0) return;

  const ref = extractRef(message);
  if (!ref) return;

  const parsed = parseEventAttendanceRef(ref);
  if (!parsed) return;

  try {
    const participant = await findParticipantByVk(vkId);
    if (!participant) {
      await safeReply(vkId, 'Не нашли вашу регистрацию на текущей смене. Откройте мини-приложение форума и завершите онбординг.');
      return;
    }

    const result = await recordEventAttendance(participant.id, parsed.eventId, {
      qrToken: parsed.qrToken,
    });

    if (!result.ok) {
      await safeReply(vkId, `Не удалось отметить посещение: ${result.error}`);
      return;
    }

    if (result.duplicate) {
      await safeReply(vkId, 'Вы уже отмечены на этом событии. Отлично, что пришли!');
      return;
    }

    const xp = result.xpAwarded > 0 ? ` +${result.xpAwarded} XP` : '';
    await safeReply(vkId, `Посещение события зафиксировано${xp}. Спасибо!`);
  } catch (err) {
    console.error('vkBotCallback attendance:', err);
  }
}

async function safeReply(vkId: number, text: string): Promise<void> {
  try {
    await sendCommunityMessage(vkId, text);
  } catch (err) {
    console.warn('vkBotCallback reply failed:', err);
  }
}
