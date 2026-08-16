import { Response } from 'express';
import { db } from '../db/index.js';
import { adminPushNotifications, events, questions, tasks } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { resolveAdminShiftId, selectedAdminShiftOr400 } from '../services/shiftService.js';
import { getForumSettings } from '../services/helpers.js';
import { pushCopy } from '../services/pushCopy.js';
import { sendPushNotification, notifyAllParticipants } from '../services/pushService.js';
import {
  notifyQuestionAudience,
  sentTriggerGlobalSince,
  startOfMoscowDay,
} from '../services/questionAutoNotify.js';
import {
  alreadySentToday,
  appLinkForContent,
  defaultTextForContent,
  lastPushForTriggers,
  loadContentNotifyBoard,
  sendTriggerForContent,
  triggersForContent,
  type ContentNotifyKind,
} from '../services/contentNotifyBoard.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { resolveBroadcastParticipantIds } from '../services/pushAudienceResolve.js';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { participantDayState, participants } from '../db/schema.js';

const KINDS: ContentNotifyKind[] = ['question', 'task', 'event', 'evening', 'forum_wrap'];

function parseKind(raw: unknown): ContentNotifyKind | null {
  const k = String(raw || '');
  return KINDS.includes(k as ContentNotifyKind) ? k as ContentNotifyKind : null;
}

export const getContentNotifyBoard = async (req: AdminRequest, res: Response): Promise<void> => {
  const shiftId = await resolveAdminShiftId(req);
  const settings = await getForumSettings(shiftId);
  const totalDays = settings?.totalDays ?? 8;
  const day = Math.max(1, Math.min(totalDays, Number(req.query.day) || 1));
  const board = await loadContentNotifyBoard({ day, shiftId, totalDays });
  res.json({
    ...board,
    totalDays,
    channels: ['mini_app', 'community_dm'],
    hint: 'Одно сообщение уходит в уведомление мини-приложения и в личку сообщества. Повтор в тот же день МСК блокируется, пока не нажмёте «ещё раз».',
  });
};

export const previewContentNotify = async (req: AdminRequest, res: Response): Promise<void> => {
  const kind = parseKind(req.body?.kind);
  const id = Number(req.body?.id);
  const day = Math.max(1, Number(req.body?.day) || 1);
  if (!kind || !Number.isFinite(id)) {
    res.status(400).json({ error: 'Укажите kind и id' });
    return;
  }
  const custom = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const text = custom || defaultTextForContent(kind, title, day);
  res.json({
    preview: text,
    appLinkHash: appLinkForContent(kind, id),
    channels: [
      { key: 'mini_app', label: 'Уведомление мини-приложения VK' },
      { key: 'community_dm', label: 'Личное сообщение от сообщества' },
    ],
  });
};

async function resolveSendTarget(
  kind: ContentNotifyKind,
  id: number,
  day: number,
  shiftId: number,
  text: string,
): Promise<{ ids: number[]; trigger: string; appLinkHash: string; text: string } | { error: string; status: number }> {
  const trigger = sendTriggerForContent(kind, id, day);
  const appLinkHash = appLinkForContent(kind, id);

  if (kind === 'question') {
    const [q] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!q) return { error: 'Вопрос не найден', status: 404 };
    if (q.status !== 'published' || q.isHidden) {
      return { error: 'Сначала опубликуйте вопрос', status: 400 };
    }
    const ids = await (await import('../services/questionAutoNotify.js')).resolveQuestionNotifyAudience(q);
    const body = text || (q.pushTemplate || '').trim() || pushCopy.touchpointOpen(q.title);
    return { ids, trigger, appLinkHash, text: body };
  }

  if (kind === 'task') {
    const [t] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!t || t.shiftId !== shiftId) return { error: 'Задание не найдено в выбранной смене', status: 404 };
    if (t.status !== 'published' || t.isHidden) {
      return { error: 'Сначала опубликуйте задание', status: 400 };
    }
    const ids = await resolveBroadcastParticipantIds(shiftId);
    return { ids, trigger, appLinkHash, text: text || pushCopy.taskPublished(t.title) };
  }

  if (kind === 'event') {
    const [e] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!e || e.shiftId !== shiftId) return { error: 'Слот программы не найден', status: 404 };
    if (!e.isPublished || !e.dayPublished) {
      return { error: 'Опубликуйте слот в программе дня', status: 400 };
    }
    const ids = await resolveBroadcastParticipantIds(shiftId);
    return { ids, trigger, appLinkHash, text: text || pushCopy.eventSoon(e.title, e.place) };
  }

  const allIds = await resolveBroadcastParticipantIds(shiftId);
  if (kind === 'forum_wrap') {
    const doneRows = allIds.length
      ? await db.select({ id: participants.id }).from(participants).where(and(
        inArray(participants.id, allIds),
        isNotNull(participants.forumWrapRatings),
      ))
      : [];
    const done = new Set(doneRows.map(r => r.id));
    const ids = allIds.filter(pid => !done.has(pid));
    return {
      ids,
      trigger,
      appLinkHash,
      text: text || 'Итоговая анкета форума уже доступна. Откройте главную и заполните — займёт несколько минут.',
    };
  }

  const doneRows = allIds.length
    ? await db.select({ participantId: participantDayState.participantId }).from(participantDayState).where(and(
      eq(participantDayState.dayNumber, day),
      isNotNull(participantDayState.eveningRatings),
      inArray(participantDayState.participantId, allIds),
    ))
    : [];
  const done = new Set(doneRows.map(r => r.participantId));
  return {
    ids: allIds.filter(pid => !done.has(pid)),
    trigger,
    appLinkHash,
    text: text || pushCopy.eveningQuestionnaireOpen(day),
  };
}

export const sendContentNotify = async (req: AdminRequest, res: Response): Promise<void> => {
  const kind = parseKind(req.body?.kind);
  const id = Number(req.body?.id);
  const day = Math.max(1, Number(req.body?.day) || 1);
  const force = req.body?.force === true;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const scheduledRaw = typeof req.body?.scheduledAt === 'string' ? req.body.scheduledAt.trim() : '';
  if (!kind || !Number.isFinite(id)) {
    res.status(400).json({ error: 'Укажите kind и id' });
    return;
  }

  const shiftId = await selectedAdminShiftOr400(req, res);
  if (shiftId == null) return;
  const target = await resolveSendTarget(kind, id, day, shiftId, text);
  if ('error' in target) {
    res.status(target.status).json({ error: target.error });
    return;
  }

  if (scheduledRaw) {
    const publishAt = new Date(scheduledRaw);
    if (Number.isNaN(publishAt.getTime())) {
      res.status(400).json({ error: 'Некорректная дата отправки' });
      return;
    }
    if (publishAt.getTime() > Date.now() + 30_000) {
      const [row] = await db.insert(adminPushNotifications).values({
        shiftId,
        internalName: `День ${day} · ${kind} · ${id}`,
        body: target.text,
        notificationType: kind === 'task' ? 'task' : kind === 'event' ? 'program' : 'reminder',
        status: 'queued',
        programDay: day,
        publishAt,
        sendMode: 'scheduled',
        triggerConfig: { kind: 'content_item', itemKind: kind, itemId: id, appLinkHash: target.appLinkHash },
        audienceType: 'all',
        audiencePayload: {},
        createdByAdminId: req.adminId ?? null,
      }).returning();
      await logAdminAction({
        req,
        actionType: 'content_notify_schedule',
        section: 'push',
        objectId: `${kind}:${id}`,
        newValue: { day, publishAt, id: row.id },
      });
      res.json({
        ok: true,
        scheduled: true,
        scheduledId: row.id,
        scheduledAt: publishAt.toISOString(),
        preview: target.text,
        message: `Отправка запланирована на ${publishAt.toLocaleString('ru-RU')}`,
      });
      return;
    }
  }

  const last = await lastPushForTriggers(triggersForContent(kind, id, day));
  if (!force && alreadySentToday(last?.sentAt ?? null)) {
    res.status(409).json({
      error: `Уже отправлено сегодня. Чтобы не спамить, повтор — только кнопкой «ещё раз».`,
      lastSentAt: last?.sentAt?.toISOString() ?? null,
      alreadySent: true,
    });
    return;
  }

  if (kind === 'question') {
    const [q] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (q && !force) {
      const openTrigger = sendTriggerForContent('question', id, day);
      if (await sentTriggerGlobalSince(openTrigger, startOfMoscowDay())) {
        res.status(409).json({
          error: 'По этому вопросу уже уходило уведомление сегодня. Нажмите «ещё раз», если нужно повторить.',
          alreadySent: true,
        });
        return;
      }
    }
    if (q) {
      const result = await notifyQuestionAudience(q, target.text, target.trigger);
      await logAdminAction({
        req, actionType: 'content_notify_send', section: 'push', objectId: `${kind}:${id}`,
        newValue: { day, sentTo: result.sentTo },
      });
      res.json({
        ok: true,
        sentTo: result.sentTo,
        preview: result.text,
        channels: ['mini_app', 'community_dm'],
        message: result.sentTo
          ? `Отправлено ${result.sentTo} участникам (мини-приложение + ЛС сообщества)`
          : 'Нет участников в аудитории',
      });
      return;
    }
  }

  if (target.ids.length) {
    await sendPushNotification(target.ids, target.text, target.trigger, {
      appLinkHash: target.appLinkHash,
    });
  } else if (kind === 'task' || kind === 'event') {
    await notifyAllParticipants(target.text, target.trigger, shiftId);
  }

  await logAdminAction({
    req, actionType: 'content_notify_send', section: 'push', objectId: `${kind}:${id}`,
    newValue: { day, sentTo: target.ids.length, force },
  });
  res.json({
    ok: true,
    sentTo: target.ids.length,
    preview: target.text,
    channels: ['mini_app', 'community_dm'],
    message: target.ids.length
      ? `Отправлено ${target.ids.length} участникам (мини-приложение + ЛС сообщества)`
      : 'Нет участников для отправки',
  });
};
