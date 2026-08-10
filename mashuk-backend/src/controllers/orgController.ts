import { Response } from 'express';
import { desc, eq, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { orgMessages, orgThreads, participants } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { sendPushNotification } from '../services/pushService.js';
import { logAdminAction } from '../services/adminActionsLog.js';

export const listMyOrgThreads = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const threads = await db.select().from(orgThreads)
      .where(eq(orgThreads.participantId, req.participant!.id))
      .orderBy(desc(orgThreads.updatedAt));

    const withPreview = await Promise.all(threads.map(async (t) => {
      const messages = await db.select().from(orgMessages)
        .where(eq(orgMessages.threadId, t.id))
        .orderBy(desc(orgMessages.createdAt))
        .limit(1);
      const last = messages[0];
      return {
        ...t,
        lastMessagePreview: last?.text?.slice(0, 120) ?? '',
        lastMessageAt: last?.createdAt ?? t.updatedAt,
        messageCount: undefined as number | undefined,
      };
    }));

    res.json({ threads: withPreview });
  } catch (error) {
    console.error('listMyOrgThreads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyOrgThread = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const threadId = Number(req.params.id);
    const [thread] = await db.select().from(orgThreads).where(eq(orgThreads.id, threadId)).limit(1);
    if (!thread || thread.participantId !== req.participant!.id) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    const messages = await db.select().from(orgMessages)
      .where(eq(orgMessages.threadId, threadId))
      .orderBy(asc(orgMessages.createdAt));
    res.json({ thread, messages });
  } catch (error) {
    console.error('getMyOrgThread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createOrgThread = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { subject, text } = req.body as { subject?: string; text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const [thread] = await db.insert(orgThreads).values({
      participantId: req.participant!.id,
      subject: subject?.trim() || 'Обращение',
      status: 'waiting',
    }).returning();

    const [message] = await db.insert(orgMessages).values({
      threadId: thread.id,
      senderType: 'participant',
      senderId: req.participant!.id,
      text: text.trim(),
    }).returning();

    res.json({ thread, message });
  } catch (error) {
    console.error('createOrgThread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const replyOrgThread = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const threadId = Number(req.params.id);
    const { text } = req.body as { text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const [thread] = await db.select().from(orgThreads).where(eq(orgThreads.id, threadId)).limit(1);
    if (!thread || thread.participantId !== req.participant!.id) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const [message] = await db.insert(orgMessages).values({
      threadId,
      senderType: 'participant',
      senderId: req.participant!.id,
      text: text.trim(),
    }).returning();

    await db.update(orgThreads)
      .set({ status: 'waiting', updatedAt: new Date() })
      .where(eq(orgThreads.id, threadId));

    res.json({ message });
  } catch (error) {
    console.error('replyOrgThread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const adminListOrgThreads = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    let threads = await db.select({
      t: orgThreads,
      p: participants,
    }).from(orgThreads)
      .leftJoin(participants, eq(orgThreads.participantId, participants.id))
      .orderBy(desc(orgThreads.updatedAt));

    if (status) {
      threads = threads.filter(r => r.t.status === status);
    }

    const result = await Promise.all(threads.map(async (row) => {
      const messages = await db.select().from(orgMessages)
        .where(eq(orgMessages.threadId, row.t.id))
        .orderBy(asc(orgMessages.createdAt));
      return {
        ...row.t,
        participantName: `${row.p?.firstName ?? ''} ${row.p?.lastName ?? ''}`.trim(),
        direction: row.p?.direction,
        groupName: row.p?.groupName,
        messages,
      };
    }));

    res.json({ threads: result });
  } catch (error) {
    console.error('adminListOrgThreads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const adminReplyOrgThread = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const threadId = Number(req.params.id);
    const { text, sendPush } = req.body as { text?: string; sendPush?: boolean };
    if (!text?.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const [thread] = await db.select().from(orgThreads).where(eq(orgThreads.id, threadId)).limit(1);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const [message] = await db.insert(orgMessages).values({
      threadId,
      senderType: 'admin',
      senderId: req.adminId ?? null,
      text: text.trim(),
    }).returning();

    await db.update(orgThreads)
      .set({ status: 'answered', updatedAt: new Date() })
      .where(eq(orgThreads.id, threadId));

    if (sendPush !== false) {
      const { pushCopy } = await import('../services/pushCopy.js');
      await sendPushNotification(
        [thread.participantId],
        pushCopy.orgReply(text),
        'org_reply',
      );
    }

    await logAdminAction({
      req,
      actionType: 'org_reply',
      section: 'org',
      objectId: threadId,
      newValue: { text: text.trim() },
    });

    res.json({ message, status: 'answered' });
  } catch (error) {
    console.error('adminReplyOrgThread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Permanently delete an org appeal thread and all its messages. */
export const adminDeleteOrgThread = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const threadId = Number(req.params.id);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      res.status(400).json({ error: 'Invalid thread id' });
      return;
    }
    const [thread] = await db.select().from(orgThreads).where(eq(orgThreads.id, threadId)).limit(1);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    await db.delete(orgMessages).where(eq(orgMessages.threadId, threadId));
    await db.delete(orgThreads).where(eq(orgThreads.id, threadId));

    await logAdminAction({
      req,
      actionType: 'org_thread_delete',
      section: 'org',
      objectId: threadId,
      oldValue: {
        participantId: thread.participantId,
        subject: thread.subject,
        status: thread.status,
      },
      isCritical: true,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('adminDeleteOrgThread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
