import { eq, desc, inArray, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, directions, thematicTags, forumSettings, dayFocus, events, tasks, questions, questionOptions, taskSubmissions, exchangeQuestions, exchangeAnswers, eventAttendance, materials, levelsConfig, piggybank, answers, dailyStats, pushLog, pointsLog, } from '../db/schema.js';
import { notifyAllParticipants, sendPushNotification } from '../services/pushService.js';
import { recalculateDailyStats } from '../services/analyticsService.js';
import { clearCache } from '../services/cache.js';
import { eventCreateSchema, eventUpdateSchema, taskCreateSchema, taskUpdateSchema, questionCreateSchema, questionUpdateSchema, parseBody, } from '../validation/adminSchemas.js';
export const listParticipants = async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const [total] = await db.select({ count: count() }).from(participants);
    const list = await db.select().from(participants)
        .orderBy(desc(participants.createdAt))
        .limit(limit).offset(offset);
    res.json({ participants: list, totalCount: total.count });
};
export const updateParticipantDirection = async (req, res) => {
    const id = Number(req.params.id);
    const { directionId } = req.body;
    const [dir] = await db.select().from(directions).where(eq(directions.id, directionId)).limit(1);
    if (!dir) {
        res.status(400).json({ error: 'Invalid direction' });
        return;
    }
    const [updated] = await db.update(participants)
        .set({ directionId: dir.id, direction: dir.name })
        .where(eq(participants.id, id)).returning();
    if (!updated) {
        res.status(404).json({ error: 'Participant not found' });
        return;
    }
    res.json({ participant: updated });
};
export const resetRegistration = async (req, res) => {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const [participant] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
    if (!participant) {
        res.status(404).json({ error: 'Participant not found' });
        return;
    }
    const exQs = await db.select({ id: exchangeQuestions.id })
        .from(exchangeQuestions)
        .where(eq(exchangeQuestions.participantId, id));
    const exQIds = exQs.map(q => q.id);
    await db.transaction(async (tx) => {
        if (exQIds.length > 0) {
            await tx.delete(exchangeAnswers).where(inArray(exchangeAnswers.questionId, exQIds));
        }
        await tx.delete(exchangeAnswers).where(eq(exchangeAnswers.participantId, id));
        await tx.delete(exchangeQuestions).where(eq(exchangeQuestions.participantId, id));
        await tx.delete(answers).where(eq(answers.participantId, id));
        await tx.delete(taskSubmissions).where(eq(taskSubmissions.participantId, id));
        await tx.delete(eventAttendance).where(eq(eventAttendance.participantId, id));
        await tx.delete(piggybank).where(eq(piggybank.participantId, id));
        await tx.delete(pointsLog).where(eq(pointsLog.participantId, id));
        await tx.delete(participants).where(eq(participants.id, id));
    });
    res.json({ ok: true });
};
export const createParticipant = async (req, res) => {
    const { vkId, firstName, lastName, directionId } = req.body;
    if (!vkId) {
        res.status(400).json({ error: 'vkId required' });
        return;
    }
    let directionName;
    if (directionId) {
        const [dir] = await db.select().from(directions).where(eq(directions.id, directionId)).limit(1);
        directionName = dir?.name;
    }
    const [created] = await db.insert(participants).values({
        vkId: Number(vkId),
        firstName: firstName || 'Участник',
        lastName: lastName || '',
        directionId: directionId || null,
        direction: directionName,
    }).returning();
    res.json({ participant: created });
};
export const crudDirections = {
    list: async (_req, res) => {
        res.json({ directions: await db.select().from(directions) });
    },
    create: async (req, res) => {
        const [d] = await db.insert(directions).values({ name: req.body.name }).returning();
        res.json({ direction: d });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const [updated] = await db.update(directions)
            .set({ name: req.body.name, isHidden: req.body.isHidden })
            .where(eq(directions.id, id)).returning();
        if (!updated) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ direction: updated });
    },
};
export const crudThematicTags = {
    list: async (_req, res) => {
        res.json({ tags: await db.select().from(thematicTags) });
    },
    create: async (req, res) => {
        const [t] = await db.insert(thematicTags).values({ name: req.body.name }).returning();
        res.json({ tag: t });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const [updated] = await db.update(thematicTags)
            .set({ name: req.body.name })
            .where(eq(thematicTags.id, id)).returning();
        if (!updated) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ tag: updated });
    },
    delete: async (req, res) => {
        const id = Number(req.params.id);
        const [deleted] = await db.delete(thematicTags).where(eq(thematicTags.id, id)).returning();
        if (!deleted) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ ok: true });
    },
};
export const updateForumSettings = async (req, res) => {
    const [existing] = await db.select().from(forumSettings).limit(1);
    if (existing) {
        const [updated] = await db.update(forumSettings)
            .set({ ...req.body, updatedAt: new Date() })
            .where(eq(forumSettings.id, existing.id)).returning();
        clearCache('forumSettings');
        res.json({ settings: updated });
    }
    else {
        const [created] = await db.insert(forumSettings).values(req.body).returning();
        clearCache('forumSettings');
        res.json({ settings: created });
    }
};
export const upsertDayFocus = async (req, res) => {
    const { dayNumber, title, text, keyQuestion } = req.body;
    const [existing] = await db.select().from(dayFocus).where(eq(dayFocus.dayNumber, dayNumber)).limit(1);
    if (existing) {
        const [updated] = await db.update(dayFocus)
            .set({ title, text, keyQuestion }).where(eq(dayFocus.id, existing.id)).returning();
        res.json({ focus: updated });
    }
    else {
        const [created] = await db.insert(dayFocus).values({ dayNumber, title, text, keyQuestion }).returning();
        res.json({ focus: created });
    }
};
export const listDayFocus = async (_req, res) => {
    const list = await db.select().from(dayFocus).orderBy(dayFocus.dayNumber);
    res.json({ focus: list });
};
export const crudEvents = {
    list: async (_req, res) => res.json({ events: await db.select().from(events) }),
    create: async (req, res) => {
        const parsed = parseBody(eventCreateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [e] = await db.insert(events).values(parsed.data).returning();
        clearCache('events_day_');
        res.json({ event: e });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const parsed = parseBody(eventUpdateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [updated] = await db.update(events).set(parsed.data).where(eq(events.id, id)).returning();
        if (!updated) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        clearCache('events_day_');
        res.json({ event: updated });
    },
    delete: async (req, res) => {
        const id = Number(req.params.id);
        const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
        if (!existing) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await db.delete(eventAttendance).where(eq(eventAttendance.eventId, id));
        await db.update(materials).set({ eventId: null }).where(eq(materials.eventId, id));
        await db.delete(events).where(eq(events.id, id));
        clearCache('events_day_');
        res.json({ ok: true });
    },
};
export const crudTasks = {
    list: async (_req, res) => res.json({ tasks: await db.select().from(tasks) }),
    create: async (req, res) => {
        const parsed = parseBody(taskCreateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [t] = await db.insert(tasks).values(parsed.data).returning();
        if (t.pushOnPublish) {
            await notifyAllParticipants(`Новое задание: ${t.title}`, 'task_publish');
        }
        res.json({ task: t });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const parsed = parseBody(taskUpdateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
        if (!before) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const [updated] = await db.update(tasks).set(parsed.data).where(eq(tasks.id, id)).returning();
        const now = new Date();
        const wasLive = before?.publishTime && before.publishTime <= now;
        const isLive = updated?.publishTime && updated.publishTime <= now;
        if (updated?.pushOnPublish && isLive && !wasLive) {
            await notifyAllParticipants(`Новое задание: ${updated.title}`, 'task_publish');
        }
        res.json({ task: updated });
    },
    delete: async (req, res) => {
        const id = Number(req.params.id);
        const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
        if (!existing) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await db.delete(taskSubmissions).where(eq(taskSubmissions.taskId, id));
        await db.delete(tasks).where(eq(tasks.id, id));
        res.json({ ok: true });
    },
};
export const crudQuestions = {
    list: async (_req, res) => res.json({ questions: await db.select().from(questions) }),
    create: async (req, res) => {
        const parsed = parseBody(questionCreateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [q] = await db.insert(questions).values({
            type: 'open',
            status: 'draft',
            ...parsed.data,
        }).returning();
        if (q.pushOnPublish && q.status === 'published') {
            await notifyAllParticipants(`Новый вопрос: ${q.title}`, 'question_publish');
        }
        res.json({ question: q });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const parsed = parseBody(questionUpdateSchema, req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const [before] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
        if (!before) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const [updated] = await db.update(questions).set(parsed.data).where(eq(questions.id, id)).returning();
        const wasPublished = before?.status === 'published';
        const isPublished = updated?.status === 'published';
        if (updated?.pushOnPublish && isPublished && !wasPublished) {
            await notifyAllParticipants(`Новый вопрос: ${updated.title}`, 'question_publish');
        }
        res.json({ question: updated });
    },
    delete: async (req, res) => {
        const id = Number(req.params.id);
        const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
        if (!existing) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await db.delete(answers).where(eq(answers.questionId, id));
        await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
        await db.delete(questions).where(eq(questions.id, id));
        res.json({ ok: true });
    },
    listOptions: async (req, res) => {
        const questionId = Number(req.params.id);
        const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, questionId));
        res.json({ options: opts });
    },
    addOption: async (req, res) => {
        const questionId = Number(req.params.id);
        const [opt] = await db.insert(questionOptions).values({
            questionId,
            label: req.body.label,
            value: req.body.value || req.body.label,
        }).returning();
        res.json({ option: opt });
    },
    deleteOption: async (req, res) => {
        const optionId = Number(req.params.optionId);
        await db.delete(questionOptions).where(eq(questionOptions.id, optionId));
        res.json({ ok: true });
    },
};
export const moderateTask = async (req, res) => {
    const id = Number(req.params.id);
    const { status, moderatorComment } = req.body;
    const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
    if (!existing) {
        res.status(404).json({ error: 'Submission not found' });
        return;
    }
    const [updated] = await db.update(taskSubmissions)
        .set({ status, moderatorComment, checkedAt: new Date() })
        .where(eq(taskSubmissions.id, id)).returning();
    if (status === 'approved' && updated && !(existing.pointsAwarded ?? 0)) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, updated.taskId)).limit(1);
        if (task?.points) {
            const { awardPoints } = await import('../services/pointsService.js');
            await awardPoints(updated.participantId, 'task_complete', task.points);
            await db.update(taskSubmissions)
                .set({ pointsAwarded: task.points })
                .where(eq(taskSubmissions.id, id));
            updated.pointsAwarded = task.points;
        }
    }
    res.json({ submission: updated });
};
export const moderateExchange = async (req, res) => {
    const id = Number(req.params.id);
    const { moderationStatus } = req.body;
    const [before] = await db.select().from(exchangeQuestions).where(eq(exchangeQuestions.id, id)).limit(1);
    if (!before) {
        res.status(404).json({ error: 'Question not found' });
        return;
    }
    const [updated] = await db.update(exchangeQuestions)
        .set({ moderationStatus })
        .where(eq(exchangeQuestions.id, id)).returning();
    if (moderationStatus === 'approved' && before.moderationStatus !== 'approved' && updated) {
        const { awardPoints } = await import('../services/pointsService.js');
        await awardPoints(updated.participantId, 'exchange_question');
    }
    res.json({ question: updated });
};
export const listPendingExchange = async (_req, res) => {
    const list = await db.select().from(exchangeQuestions)
        .where(eq(exchangeQuestions.moderationStatus, 'pending'));
    res.json({ questions: list });
};
export const listAllExchange = async (req, res) => {
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    let baseQuery = db.select({
        q: exchangeQuestions,
        p: participants,
    }).from(exchangeQuestions)
        .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id));
    let countQuery = db.select({ count: count() }).from(exchangeQuestions);
    if (status) {
        baseQuery = baseQuery.where(eq(exchangeQuestions.moderationStatus, status));
        countQuery = countQuery.where(eq(exchangeQuestions.moderationStatus, status));
    }
    const [total] = await countQuery;
    const rows = await baseQuery.orderBy(desc(exchangeQuestions.createdAt)).limit(limit).offset(offset);
    const qIds = rows.map(r => r.q.id);
    let answersByQ = new Map();
    if (qIds.length > 0) {
        const allAnswers = await db.select({
            a: exchangeAnswers,
            author: participants,
        }).from(exchangeAnswers)
            .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
            .where(inArray(exchangeAnswers.questionId, qIds));
        for (const row of allAnswers) {
            const qid = row.a.questionId;
            if (!answersByQ.has(qid))
                answersByQ.set(qid, []);
            answersByQ.get(qid).push(row);
        }
    }
    res.json({
        questions: rows.map(r => ({
            ...r.q,
            authorName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
            direction: r.p?.direction,
            answers: (answersByQ.get(r.q.id) || []).map(ar => ({
                id: ar.a.id,
                text: ar.a.text,
                authorName: `${ar.author?.firstName ?? ''} ${ar.author?.lastName ?? ''}`.trim(),
                reactions: ar.a.reactions,
                createdAt: ar.a.createdAt,
            })),
        })),
        totalCount: total.count,
    });
};
export const listExchangeAnswers = async (_req, res) => {
    const rows = await db.select({
        a: exchangeAnswers,
        q: exchangeQuestions,
        author: participants,
    }).from(exchangeAnswers)
        .leftJoin(exchangeQuestions, eq(exchangeAnswers.questionId, exchangeQuestions.id))
        .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
        .orderBy(desc(exchangeAnswers.createdAt));
    res.json({
        answers: rows.map(r => ({
            ...r.a,
            questionText: r.q?.text,
            authorName: `${r.author?.firstName ?? ''} ${r.author?.lastName ?? ''}`.trim(),
        })),
    });
};
export const crudLevels = {
    list: async (_req, res) => res.json({ config: await db.select().from(levelsConfig) }),
    upsert: async (req, res) => {
        const { actionType, pointsPerUnit, maxAccruals, levelThresholds } = req.body;
        const [existing] = await db.select().from(levelsConfig)
            .where(eq(levelsConfig.actionType, actionType)).limit(1);
        if (existing) {
            const [updated] = await db.update(levelsConfig)
                .set({ pointsPerUnit, maxAccruals, levelThresholds })
                .where(eq(levelsConfig.id, existing.id)).returning();
            res.json({ config: updated });
        }
        else {
            const [created] = await db.insert(levelsConfig).values(req.body).returning();
            res.json({ config: created });
        }
    },
};
export const crudMaterials = {
    list: async (_req, res) => {
        res.json({ materials: await db.select().from(materials) });
    },
    create: async (req, res) => {
        const [m] = await db.insert(materials).values(req.body).returning();
        res.json({ material: m });
    },
    update: async (req, res) => {
        const id = Number(req.params.id);
        const [updated] = await db.update(materials).set(req.body).where(eq(materials.id, id)).returning();
        if (!updated) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ material: updated });
    },
    delete: async (req, res) => {
        const id = Number(req.params.id);
        const [deleted] = await db.delete(materials).where(eq(materials.id, id)).returning();
        if (!deleted) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({ ok: true });
    },
};
export const exportParticipants = async (_req, res) => {
    const list = await db.select().from(participants);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=participants.csv');
    const header = 'id,vk_id,first_name,last_name,direction,interests,path_points,experience_points,created_at\n';
    const rows = list.map(p => [p.id, p.vkId, p.firstName, p.lastName, p.direction, JSON.stringify(p.interests || []), p.pathPoints, p.experiencePoints, p.createdAt].join(',')).join('\n');
    res.send('\uFEFF' + header + rows);
};
export const exportAnswers = async (_req, res) => {
    const rows = await db.select({ a: answers, p: participants, q: questions })
        .from(answers)
        .leftJoin(participants, eq(answers.participantId, participants.id))
        .leftJoin(questions, eq(answers.questionId, questions.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=answers.csv');
    const header = 'participant_id,name,direction,block,question_title,question_type,time_point,word_count,points,created_at\n';
    const csv = rows.map(r => [
        r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        r.q?.block, r.q?.title, r.q?.type, r.q?.timePoint || '',
        r.a.wordCount, r.a.pointsAwarded, r.a.createdAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + header + csv);
};
export const exportPiggybank = async (_req, res) => {
    const rows = await db.select({ e: piggybank, p: participants })
        .from(piggybank)
        .leftJoin(participants, eq(piggybank.participantId, participants.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=piggybank.csv');
    const header = 'participant_id,name,direction,tag,source,text,created_at\n';
    const csv = rows.map(r => [
        r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        r.e.tag, r.e.source, `"${(r.e.text || '').replace(/"/g, '""')}"`, r.e.createdAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + header + csv);
};
export const exportTaskSubmissions = async (_req, res) => {
    const rows = await db.select({ s: taskSubmissions, p: participants, t: tasks })
        .from(taskSubmissions)
        .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
        .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=task_submissions.csv');
    const header = 'id,participant_id,name,direction,task_title,status,answer_text,photo_url,points_awarded,submitted_at,checked_at\n';
    const csv = rows.map(r => [
        r.s.id, r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        r.t?.title, r.s.status, `"${(r.s.answerText || '').replace(/"/g, '""')}"`,
        r.s.photoUrl, r.s.pointsAwarded, r.s.submittedAt, r.s.checkedAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + header + csv);
};
export const exportExchange = async (_req, res) => {
    const qs = await db.select({ q: exchangeQuestions, p: participants })
        .from(exchangeQuestions)
        .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id));
    const ans = await db.select({ a: exchangeAnswers, p: participants, q: exchangeQuestions })
        .from(exchangeAnswers)
        .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
        .leftJoin(exchangeQuestions, eq(exchangeAnswers.questionId, exchangeQuestions.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=exchange.csv');
    let csv = 'type,id,participant_name,direction,question_text,answer_text,status,reactions,created_at\n';
    csv += qs.map(r => [
        'question', r.q.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        `"${(r.q.text || '').replace(/"/g, '""')}"`, '', r.q.moderationStatus, '', r.q.createdAt,
    ].join(',')).join('\n');
    csv += '\n' + ans.map(r => [
        'answer', r.a.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        `"${(r.q?.text || '').replace(/"/g, '""')}"`, `"${(r.a.text || '').replace(/"/g, '""')}"`,
        '', JSON.stringify(r.a.reactions || {}), r.a.createdAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + csv);
};
export const exportAttendance = async (_req, res) => {
    const rows = await db.select({ a: eventAttendance, p: participants, e: events })
        .from(eventAttendance)
        .leftJoin(participants, eq(eventAttendance.participantId, participants.id))
        .leftJoin(events, eq(eventAttendance.eventId, events.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    const header = 'id,participant_id,name,direction,event_title,event_day,created_at\n';
    const csv = rows.map(r => [
        r.a.id, r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        r.e?.title, r.e?.dayNumber, r.a.createdAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + header + csv);
};
export const exportPointsLog = async (_req, res) => {
    const rows = await db.select({ l: pointsLog, p: participants })
        .from(pointsLog)
        .leftJoin(participants, eq(pointsLog.participantId, participants.id))
        .orderBy(desc(pointsLog.createdAt));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=points_log.csv');
    const header = 'id,participant_id,name,direction,action_type,points,created_at\n';
    const csv = rows.map(r => [
        r.l.id, r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
        r.l.actionType, r.l.points, r.l.createdAt,
    ].join(',')).join('\n');
    res.send('\uFEFF' + header + csv);
};
export const getAnalyticsSummary = async (_req, res) => {
    const participantCount = (await db.select().from(participants)).length;
    const answerCount = (await db.select().from(answers)).length;
    const stats = await db.select().from(dailyStats).limit(1);
    const tagStats = {};
    for (const e of await db.select().from(piggybank)) {
        const tag = e.tag || 'без тега';
        tagStats[tag] = (tagStats[tag] || 0) + 1;
    }
    res.json({
        participantCount,
        answerCount,
        completionPercent: stats[0]?.completionPercent ?? 0,
        avgEnergy: stats[0]?.avgEnergy ?? 0,
        emotionsDistribution: stats[0]?.emotionsDistribution ?? {},
        redFlag: stats[0]?.redFlag ?? false,
        piggybankTags: tagStats,
    });
};
export const getAnalyticsCharts = async (_req, res) => {
    const stats = await db.select().from(dailyStats);
    const allAnswers = await db.select().from(answers);
    const checkins = allAnswers.filter(a => {
        const d = a.answerData;
        return d && typeof d.energy === 'number';
    });
    const energyByDay = {};
    for (const a of checkins) {
        const day = a.createdAt ? new Date(a.createdAt).toLocaleDateString('ru-RU') : 'unknown';
        const energy = a.answerData.energy;
        if (!energyByDay[day])
            energyByDay[day] = [];
        energyByDay[day].push(energy);
    }
    const energyTrend = Object.entries(energyByDay).map(([day, vals]) => ({
        day,
        avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }));
    const tagStats = {};
    for (const e of await db.select().from(piggybank)) {
        if (e.tag)
            tagStats[e.tag] = (tagStats[e.tag] || 0) + 1;
    }
    const completionByDirection = stats
        .filter(s => s.direction !== 'all')
        .map(s => ({ direction: s.direction, percent: s.completionPercent ?? 0 }));
    res.json({
        emotions: stats.find(s => s.direction === 'all')?.emotionsDistribution ?? {},
        energyTrend,
        completionPercent: stats.find(s => s.direction === 'all')?.completionPercent ?? 0,
        completionByDirection,
        piggybankTags: Object.entries(tagStats).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
        medianWordCount: stats.find(s => s.direction === 'all')?.medianWordCount ?? 0,
    });
};
export const sendManualPush = async (req, res) => {
    const { text, participantId } = req.body;
    if (!text?.trim()) {
        res.status(400).json({ error: 'text required' });
        return;
    }
    if (participantId) {
        await sendPushNotification([Number(participantId)], text, 'manual');
    }
    else {
        await notifyAllParticipants(text, 'manual');
    }
    res.json({ ok: true });
};
export const listPushLog = async (_req, res) => {
    const log = await db.select().from(pushLog).orderBy(desc(pushLog.sentAt)).limit(50);
    res.json({ log });
};
export const listPointsLog = async (_req, res) => {
    const log = await db.select({
        l: pointsLog,
        p: participants,
    }).from(pointsLog)
        .leftJoin(participants, eq(pointsLog.participantId, participants.id))
        .orderBy(desc(pointsLog.createdAt))
        .limit(100);
    res.json({
        log: log.map(r => ({
            ...r.l,
            participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
        })),
    });
};
export const triggerAnalyticsRecalc = async (_req, res) => {
    await recalculateDailyStats();
    res.json({ ok: true });
};
export const listPendingSubmissions = async (_req, res) => {
    const rows = await db.select({
        s: taskSubmissions,
        p: participants,
        t: tasks,
    }).from(taskSubmissions)
        .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
        .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
        .where(eq(taskSubmissions.status, 'pending'));
    res.json({
        submissions: rows.map(r => ({
            ...r.s,
            participantName: `${r.p?.firstName} ${r.p?.lastName}`,
            taskTitle: r.t?.title,
        })),
    });
};
export const listAllSubmissions = async (req, res) => {
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    let baseQuery = db.select({
        s: taskSubmissions,
        p: participants,
        t: tasks,
    }).from(taskSubmissions)
        .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
        .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
    let countQuery = db.select({ count: count() }).from(taskSubmissions);
    if (status) {
        baseQuery = baseQuery.where(eq(taskSubmissions.status, status));
        countQuery = countQuery.where(eq(taskSubmissions.status, status));
    }
    const [total] = await countQuery;
    const rows = await baseQuery.orderBy(desc(taskSubmissions.submittedAt)).limit(limit).offset(offset);
    res.json({
        submissions: rows.map(r => ({
            ...r.s,
            participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
            taskTitle: r.t?.title,
            taskDay: r.t?.dayNumber,
        })),
        totalCount: total.count,
    });
};
export const listEventAttendance = async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const [total] = await db.select({ count: count() }).from(eventAttendance);
    const rows = await db.select({
        a: eventAttendance,
        p: participants,
        e: events,
    }).from(eventAttendance)
        .leftJoin(participants, eq(eventAttendance.participantId, participants.id))
        .leftJoin(events, eq(eventAttendance.eventId, events.id))
        .orderBy(desc(eventAttendance.createdAt))
        .limit(limit).offset(offset);
    res.json({
        attendance: rows.map(r => ({
            ...r.a,
            participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
            direction: r.p?.direction,
            eventTitle: r.e?.title,
            eventDay: r.e?.dayNumber,
        })),
        totalCount: total.count,
    });
};
export const getForumSettings = async (_req, res) => {
    const [settings] = await db.select().from(forumSettings).limit(1);
    res.json({ settings: settings ?? null });
};
