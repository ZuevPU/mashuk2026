import { Response } from 'express';
import {
  eq, and, or, count, asc, desc, inArray, ilike, ne, isNull,
} from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  questions, questionOptions, answers, exchangeQuestions, exchangeAnswers, orgThreads, participants, forumSettings,
  adminActionsLog,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { notifyAllParticipants } from '../services/pushService.js';
import {
  questionCreateSchema, questionUpdateSchema, parseBody,
  copyQuestionsSelectedSchema, copyQuestionToDaySchema, reorderQuestionOptionsSchema,
} from '../validation/adminSchemas.js';
import {
  enrichQuestionWritePayload, normalizeDayNumbers, questionMatchesDay,
  serializeAdminQuestion, shiftQuestionWindows,
} from '../services/questionAdminHelpers.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../services/touchpointTemplates.js';
import { formatQuestionTimeWindow } from '../services/reflectionTypeLabel.js';

function participantDisplayName(p: typeof participants.$inferSelect | null): string | undefined {
  if (!p) return undefined;
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || String(p.vkId);
}

function slotWindowsForTitle(title: string, toDay: number, startDate: Date) {
  const slot = TOUCHPOINT_SLOTS.find(s => s.title === title);
  if (!slot) return null;
  return windowsForDay(startDate, toDay, slot);
}

async function answerCountsForQuestionIds(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const id of ids) map.set(id, 0);
  if (!ids.length) return map;
  const rows = await db.select({
    questionId: answers.questionId,
    cnt: count(),
  }).from(answers)
    .where(inArray(answers.questionId, ids))
    .groupBy(answers.questionId);
  for (const r of rows) map.set(r.questionId, Number(r.cnt));
  return map;
}

function buildQuestionValues(raw: Record<string, unknown>, textFallback: string) {
  const enriched = enrichQuestionWritePayload(raw);
  const textBody = (typeof enriched.text === 'string' && enriched.text.trim())
    ? enriched.text.trim()
    : textFallback;
  return { ...enriched, text: textBody } as typeof questions.$inferInsert;
}

async function listExchangeRows(req: AdminRequest, res: Response) {
  const q = (req.query.q as string | undefined)?.trim();
  const status = req.query.status as string | undefined;
  const conditions = [];
  if (status) conditions.push(eq(exchangeQuestions.moderationStatus, status));
  if (q) conditions.push(ilike(exchangeQuestions.text, `%${q}%`));
  const rows = await db.select({
    ex: exchangeQuestions,
    p: participants,
  }).from(exchangeQuestions)
    .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exchangeQuestions.createdAt))
    .limit(200);

  const exIds = rows.map(r => r.ex.id);
  const ansCounts = new Map<number, number>();
  if (exIds.length) {
    const ac = await db.select({ questionId: exchangeAnswers.questionId, cnt: count() })
      .from(exchangeAnswers)
      .where(inArray(exchangeAnswers.questionId, exIds))
      .groupBy(exchangeAnswers.questionId);
    for (const r of ac) ansCounts.set(r.questionId, Number(r.cnt));
  }

  const items = rows.map(r => ({
    source: 'exchange' as const,
    id: r.ex.id,
    title: (r.ex.text || '').slice(0, 80) + ((r.ex.text || '').length > 80 ? '…' : ''),
    text: r.ex.text,
    type: 'exchange',
    answerType: 'text',
    questionKind: 'exchange',
    dayNumber: null,
    dayNumbers: [],
    audienceLabel: r.ex.audience || 'all',
    status: r.ex.moderationStatus || 'pending',
    answerCount: ansCounts.get(r.ex.id) ?? 0,
    publishTime: null,
    closeTime: null,
    participantName: participantDisplayName(r.p),
    readOnly: true,
  }));

  res.json({ questions: items, totalCount: items.length, source: 'exchange' });
}

async function listOrgRows(req: AdminRequest, res: Response) {
  const q = (req.query.q as string | undefined)?.trim();
  const status = req.query.status as string | undefined;
  const conditions = [];
  if (status) conditions.push(eq(orgThreads.status, status));
  const rows = await db.select({
    t: orgThreads,
    p: participants,
  }).from(orgThreads)
    .leftJoin(participants, eq(orgThreads.participantId, participants.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orgThreads.updatedAt))
    .limit(200);

  let items = rows.map(r => ({
    source: 'org' as const,
    id: r.t.id,
    title: r.t.subject || `Обращение #${r.t.id}`,
    text: r.t.subject,
    type: 'org',
    answerType: 'text',
    questionKind: 'org_director',
    dayNumber: null,
    dayNumbers: [],
    audienceLabel: '—',
    status: r.t.status || 'waiting',
    answerCount: 0,
    publishTime: null,
    closeTime: null,
    participantName: participantDisplayName(r.p),
    readOnly: true,
  }));
  if (q) {
    const lq = q.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(lq)
      || (i.participantName && String(i.participantName).toLowerCase().includes(lq)));
  }
  res.json({ questions: items, totalCount: items.length, source: 'org' });
}

export const crudQuestions = {
  list: async (req: AdminRequest, res: Response) => {
    const source = req.query.source as string | undefined;
    if (source === 'exchange') {
      await listExchangeRows(req, res);
      return;
    }
    if (source === 'org') {
      await listOrgRows(req, res);
      return;
    }

    const status = req.query.status as string | undefined;
    const audienceType = req.query.audienceType as string | undefined;
    const questionKind = req.query.questionKind as string | undefined;
    const day = req.query.day ? Number(req.query.day) : undefined;
    const q = (req.query.q as string | undefined)?.trim();
    const includeHidden = req.query.includeHidden === 'true';
    const includeArchived = req.query.includeArchived === 'true';
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);

    const conditions: ReturnType<typeof eq>[] = [eq(questions.shiftId, shiftId)];
    if (!includeArchived) conditions.push(ne(questions.status, 'archived'));
    if (status) conditions.push(eq(questions.status, status));
    if (audienceType) conditions.push(eq(questions.audienceType, audienceType));
    if (questionKind) conditions.push(eq(questions.questionKind, questionKind));
    if (!includeHidden) conditions.push(or(eq(questions.isHidden, false), isNull(questions.isHidden))!);
    if (q) {
      conditions.push(or(
        ilike(questions.title, `%${q}%`),
        ilike(questions.text, `%${q}%`),
        ilike(questions.subtitle, `%${q}%`),
      )!);
    }

    let rows = await db.select().from(questions)
      .where(and(...conditions))
      .orderBy(asc(questions.sortOrder), asc(questions.id));

    if (day && !Number.isNaN(day)) {
      rows = rows.filter(r => questionMatchesDay(r, day));
    }

    const [{ totalCount }] = await db.select({ totalCount: count() }).from(questions)
      .where(and(eq(questions.shiftId, shiftId), ne(questions.status, 'archived')));

    const ids = rows.map(r => r.id);
    const counts = await answerCountsForQuestionIds(ids);
    res.json({
      questions: rows.map(r => {
        const ser = serializeAdminQuestion(r, counts.get(r.id) ?? 0);
        return {
          ...ser,
          timeWindowLabel: formatQuestionTimeWindow(r.publishTime, r.closeTime),
          readOnly: false,
        };
      }),
      totalCount: Number(totalCount),
    });
  },

  getOne: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [q] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!q) { res.status(404).json({ error: 'Not found' }); return; }
    const opts = await db.select().from(questionOptions)
      .where(eq(questionOptions.questionId, id))
      .orderBy(asc(questionOptions.sortOrder), asc(questionOptions.id));
    const [{ cnt }] = await db.select({ cnt: count() }).from(answers).where(eq(answers.questionId, id));
    res.json({
      question: serializeAdminQuestion(q, Number(cnt)),
      options: opts,
    });
  },

  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(questionCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const values = buildQuestionValues(parsed.data as Record<string, unknown>, parsed.data.title.trim());
    if (!values.type) values.type = 'open';
    if (!values.status) values.status = 'draft';
    const [q] = await db.insert(questions).values({ ...values, shiftId }).returning();
    if (q.pushOnPublish && q.status === 'published') {
      const msg = q.pushTemplate?.trim() || `Новая точка: «${q.title}». Откройте в приложении.`;
      await notifyAllParticipants(msg, 'question_publish');
    }
    res.json({ question: serializeAdminQuestion(q, 0) });
  },

  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(questionUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [before] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }

    const enriched = enrichQuestionWritePayload(parsed.data as Record<string, unknown>, before);
    const [{ count: answerCount }] = await db.select({ count: count() }).from(answers).where(eq(answers.questionId, id));
    const newTitle = enriched.title != null ? String(enriched.title) : before.title;
    const newText = enriched.text != null ? String(enriched.text) : before.text;
    const isPracticesVote = (enriched.questionKind ?? before.questionKind) === 'practices_vote'
      || (enriched.answerType ?? before.answerType) === 'practices_vote'
      || (enriched.type ?? before.type) === 'practices_vote';
    // For practices vote, `text` mirrors preamble — do not version solely on preamble edits.
    const textChanging = isPracticesVote
      ? newTitle !== before.title
      : (newText !== before.text || newTitle !== before.title);

    if (answerCount > 0 && textChanging) {
      await db.update(questions).set({ status: 'archived' }).where(eq(questions.id, id));
      const copyFields = {
        shiftId: before.shiftId,
        title: newTitle,
        text: newText,
        type: (enriched.type as string) ?? before.type,
        answerType: (enriched.answerType as string) ?? before.answerType,
        questionKind: (enriched.questionKind as string) ?? before.questionKind,
        subtitle: enriched.subtitle !== undefined ? (enriched.subtitle as string | null) : before.subtitle,
        block: enriched.block !== undefined ? (enriched.block as string | null) : before.block,
        reflectionKind: enriched.reflectionKind !== undefined ? (enriched.reflectionKind as string | null) : before.reflectionKind,
        status: (enriched.status as string) ?? 'published',
        publishTime: before.publishTime,
        closeTime: before.closeTime,
        points: enriched.points !== undefined ? Number(enriched.points) : before.points,
        timePoint: enriched.timePoint !== undefined ? (enriched.timePoint as string | null) : before.timePoint,
        dayNumber: enriched.dayNumber !== undefined ? Number(enriched.dayNumber) : before.dayNumber,
        dayNumbers: (enriched.dayNumbers as number[] | undefined) ?? before.dayNumbers,
        direction: before.direction,
        audienceType: enriched.audienceType !== undefined ? (enriched.audienceType as string) : before.audienceType,
        audienceDirectionId: enriched.audienceDirectionId !== undefined ? (enriched.audienceDirectionId as number | null) : before.audienceDirectionId,
        audienceGroupId: enriched.audienceGroupId !== undefined ? (enriched.audienceGroupId as number | null) : before.audienceGroupId,
        audienceRole: enriched.audienceRole !== undefined ? (enriched.audienceRole as string | null) : before.audienceRole,
        isRequired: enriched.isRequired !== undefined ? Boolean(enriched.isRequired) : before.isRequired,
        isHidden: enriched.isHidden !== undefined ? Boolean(enriched.isHidden) : before.isHidden,
        sortOrder: enriched.sortOrder !== undefined ? Number(enriched.sortOrder) : before.sortOrder,
        allowRetry: enriched.allowRetry !== undefined ? Boolean(enriched.allowRetry) : before.allowRetry,
        allowOther: enriched.allowOther !== undefined ? Boolean(enriched.allowOther) : before.allowOther,
        pushOnPublish: enriched.pushOnPublish !== undefined ? Boolean(enriched.pushOnPublish) : before.pushOnPublish,
        pushTemplate: enriched.pushTemplate !== undefined ? (enriched.pushTemplate as string | null) : before.pushTemplate,
        linkedEventIds: (enriched.linkedEventIds as number[] | undefined) ?? before.linkedEventIds,
        practicesConfig: enriched.practicesConfig !== undefined ? enriched.practicesConfig : before.practicesConfig,
        showWhen: (enriched.showWhen !== undefined
          ? enriched.showWhen
          : before.showWhen) as { questionId: number; optionValues: string[] } | null,
        parentQuestionId: id,
      };
      const [created] = await db.insert(questions).values(copyFields).returning();
      const { logAdminAction } = await import('../services/adminActionsLog.js');
      await logAdminAction({
        req, actionType: 'question_update', section: 'questions', objectId: created.id,
        oldValue: { id, title: before.title }, newValue: { id: created.id, parentQuestionId: id, answerCount },
        comment: `Новая версия: уже было ${answerCount} ответов`, isCritical: true,
      });
      res.json({
        question: serializeAdminQuestion(created, 0),
        versioned: true,
        archivedId: id,
        previousAnswerCount: answerCount,
      });
      return;
    }

    const patch = { ...enriched };
    if (patch.text === null) delete patch.text;
    delete (patch as Record<string, unknown>).requiresModeration;
    const [updated] = await db.update(questions)
      .set(patch as Partial<typeof questions.$inferInsert>)
      .where(eq(questions.id, id))
      .returning();
    const wasPublished = before.status === 'published';
    const isPublished = updated?.status === 'published';
    if (updated?.pushOnPublish && isPublished && !wasPublished) {
      const msg = updated.pushTemplate?.trim() || `Новая точка: «${updated.title}». Откройте в приложении.`;
      await notifyAllParticipants(msg, 'question_publish');
    }
    res.json({ question: serializeAdminQuestion(updated!, Number(answerCount)), versioned: false });
  },

  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await db.delete(answers).where(eq(answers.questionId, id));
    await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
    await db.delete(questions).where(eq(questions.id, id));
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'question_delete', section: 'questions', objectId: id,
      oldValue: existing, isCritical: true,
    });
    res.json({ ok: true });
  },

  duplicate: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [src] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }
    const { id: _id, createdAt, ...rest } = src;
    const [copy] = await db.insert(questions).values({
      ...rest,
      title: `${src.title} (копия)`,
      status: 'draft',
      pushOnPublish: false,
      parentQuestionId: src.parentQuestionId,
    }).returning();
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, id));
    for (const o of opts) {
      await db.insert(questionOptions).values({
        questionId: copy.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
      });
    }
    res.json({ question: serializeAdminQuestion(copy, 0) });
  },

  copyToDay: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(copyQuestionToDaySchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const targetDay = parsed.data.targetDay;
    const [src] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }
    const fromDay = src.dayNumber ?? normalizeDayNumbers(src.dayNumbers ?? undefined, 1)[0];
    const [settings] = await db.select().from(forumSettings).limit(1);
    const startDate = settings?.startDate || new Date();
    const { publishTime, closeTime } = shiftQuestionWindows(
      src, fromDay, targetDay, startDate,
      title => slotWindowsForTitle(title, targetDay, startDate),
    );
    const { id: _id, createdAt, ...rest } = src;
    const [copy] = await db.insert(questions).values({
      ...rest,
      dayNumber: targetDay,
      dayNumbers: [targetDay],
      publishTime,
      closeTime,
      status: 'draft',
      pushOnPublish: false,
      parentQuestionId: src.id,
    }).returning();
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, id));
    for (const o of opts) {
      await db.insert(questionOptions).values({
        questionId: copy.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
      });
    }
    res.json({ question: serializeAdminQuestion(copy, 0) });
  },

  listVersions: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [current] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: 'Not found' }); return; }

    const chain: typeof current[] = [current];
    let cursor = current;
    while (cursor.parentQuestionId) {
      const [parent] = await db.select().from(questions).where(eq(questions.id, cursor.parentQuestionId)).limit(1);
      if (!parent) break;
      chain.unshift(parent);
      cursor = parent;
    }
    const children = await db.select().from(questions).where(eq(questions.parentQuestionId, id));
    for (const ch of children) chain.push(ch);

    const ids = chain.map(c => c.id);
    const answerCounts = ids.length
      ? await db.select({ questionId: answers.questionId, count: count() })
        .from(answers)
        .where(inArray(answers.questionId, ids))
        .groupBy(answers.questionId)
      : [];
    const countByQ = new Map(answerCounts.map(r => [r.questionId, Number(r.count)]));

    const logs = ids.length
      ? await db.select().from(adminActionsLog)
        .where(and(
          eq(adminActionsLog.section, 'questions'),
          or(...ids.map(id => eq(adminActionsLog.objectId, String(id)))),
        ))
        .orderBy(desc(adminActionsLog.createdAt))
      : [];

    res.json({
      versions: chain.map(v => ({
        id: v.id,
        title: v.title,
        status: v.status,
        createdAt: v.createdAt,
        parentQuestionId: v.parentQuestionId,
        answerCount: countByQ.get(v.id) ?? 0,
      })),
      logs,
    });
  },

  listAnswers: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const rows = await db.select({
      a: answers,
      p: participants,
    }).from(answers)
      .leftJoin(participants, eq(answers.participantId, participants.id))
      .where(eq(answers.questionId, id))
      .orderBy(desc(answers.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ cnt }] = await db.select({ cnt: count() }).from(answers).where(eq(answers.questionId, id));
    res.json({
      answers: rows.map(r => ({
        id: r.a.id,
        participantId: r.a.participantId,
        participantName: participantDisplayName(r.p),
        answerData: r.a.answerData,
        questionTextSnapshot: r.a.questionTextSnapshot,
        createdAt: r.a.createdAt,
      })),
      total: Number(cnt),
    });
  },

  listOptions: async (req: AdminRequest, res: Response) => {
    const questionId = Number(req.params.id);
    const opts = await db.select().from(questionOptions)
      .where(eq(questionOptions.questionId, questionId))
      .orderBy(asc(questionOptions.sortOrder), asc(questionOptions.id));
    res.json({ options: opts });
  },

  addOption: async (req: AdminRequest, res: Response) => {
    const questionId = Number(req.params.id);
    const [{ cnt }] = await db.select({ cnt: count() }).from(questionOptions).where(eq(questionOptions.questionId, questionId));
    const [opt] = await db.insert(questionOptions).values({
      questionId,
      label: req.body.label,
      value: req.body.value || req.body.label,
      sortOrder: Number(cnt),
    }).returning();
    res.json({ option: opt });
  },

  deleteOption: async (req: AdminRequest, res: Response) => {
    const optionId = Number(req.params.optionId);
    await db.delete(questionOptions).where(eq(questionOptions.id, optionId));
    res.json({ ok: true });
  },

  reorderOptions: async (req: AdminRequest, res: Response) => {
    const questionId = Number(req.params.id);
    const parsed = parseBody(reorderQuestionOptionsSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    let order = 0;
    for (const optionId of parsed.data.optionIds) {
      await db.update(questionOptions)
        .set({ sortOrder: order++ })
        .where(and(eq(questionOptions.id, optionId), eq(questionOptions.questionId, questionId)));
    }
    const opts = await db.select().from(questionOptions)
      .where(eq(questionOptions.questionId, questionId))
      .orderBy(asc(questionOptions.sortOrder));
    res.json({ options: opts });
  },
  bulkAction: async (req: AdminRequest, res: Response) => {
    const { bulkTasksSchema } = await import('../validation/adminSchemas.js');
    const parsed = bulkTasksSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { ids, action } = parsed.data;

    if (action === 'delete') {
      await db.delete(answers).where(inArray(answers.questionId, ids));
      await db.delete(questionOptions).where(inArray(questionOptions.questionId, ids));
      await db.delete(questions).where(inArray(questions.id, ids));
    } else if (action === 'hide') {
      await db.update(questions).set({ isHidden: true }).where(inArray(questions.id, ids));
    } else if (action === 'unhide') {
      await db.update(questions).set({ isHidden: false }).where(inArray(questions.id, ids));
    } else if (action === 'publish') {
      await db.update(questions).set({ status: 'published', isHidden: false }).where(inArray(questions.id, ids));
    } else if (action === 'draft') {
      await db.update(questions).set({ status: 'draft' }).where(inArray(questions.id, ids));
    }

    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req,
      actionType: 'questions_bulk_action',
      section: 'questions',
      objectId: ids.join(','),
      newValue: { action, count: ids.length },
    });

    res.json({ ok: true });
  },
};

export const copyQuestionsSelected = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(copyQuestionsSelectedSchema, req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const { ids, targetDay, overwrite } = parsed.data;
  const [settings] = await db.select().from(forumSettings).limit(1);
  const startDate = settings?.startDate || new Date();

  if (overwrite) {
    const allOnDay = await db.select().from(questions).where(eq(questions.dayNumber, targetDay));
    for (const t of allOnDay) {
      await db.delete(answers).where(eq(answers.questionId, t.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, t.id));
      await db.delete(questions).where(eq(questions.id, t.id));
    }
  }

  const source = await db.select().from(questions).where(inArray(questions.id, ids));
  const created = [];
  for (const q of source) {
    const fromDay = q.dayNumber ?? 1;
    const { publishTime, closeTime } = shiftQuestionWindows(
      q, fromDay, targetDay, startDate,
      title => slotWindowsForTitle(title, targetDay, startDate),
    );
    const { id: _id, createdAt, ...rest } = q;
    const [row] = await db.insert(questions).values({
      ...rest,
      dayNumber: targetDay,
      dayNumbers: [targetDay],
      publishTime,
      closeTime,
      pushOnPublish: false,
      status: q.status === 'archived' ? 'draft' : q.status,
      parentQuestionId: q.id,
    }).returning();
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
    for (const o of opts) {
      await db.insert(questionOptions).values({
        questionId: row.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
      });
    }
    created.push(row);
  }
  res.json({ created: created.map(r => serializeAdminQuestion(r, 0)), count: created.length });
};

/** Аннулировать баллы всем, кто ответил на этот вопрос (по логам рядом с ответом). */
export const revokeQuestionPoints = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid question id' });
    return;
  }
  const reason = String(req.body?.reason || `Аннулирование баллов за вопрос #${id}`).trim().slice(0, 500);
  const { revokePointsForQuestionAnswers } = await import('../services/pointsService.js');
  const result = await revokePointsForQuestionAnswers(id, reason);
  if (!result.ok) {
    res.status(404).json({ error: result.error });
    return;
  }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'question_points_revoke_all',
    section: 'questions',
    objectId: String(id),
    newValue: result,
    isCritical: true,
  });
  res.json({ ...result, reason });
};

export const getPracticesResults = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [question] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  if (!question) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { normalizePracticesConfig, aggregatePracticeLikes } = await import('../services/practicesVoteConfig.js');
  const config = normalizePracticesConfig(question.practicesConfig);
  const rows = await db.select({ answerData: answers.answerData }).from(answers)
    .where(eq(answers.questionId, id));
  const practices = aggregatePracticeLikes(config, rows).map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    participantName: p.participantName,
    direction: p.direction,
    likes: p.likes,
    resultPlace: p.resultPlace ?? null,
    resultTime: p.resultTime ?? null,
    sortOrder: p.sortOrder,
  }));
  res.json({
    questionId: id,
    preamble: config.preamble,
    likesPerParticipant: config.likesPerParticipant,
    resultsPublished: config.resultsPublished,
    totalVoters: rows.length,
    practices,
  });
};

export const publishPracticesResults = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [question] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  if (!question) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { normalizePracticesConfig } = await import('../services/practicesVoteConfig.js');
  const config = normalizePracticesConfig(question.practicesConfig);
  const updates = Array.isArray(req.body?.practices) ? req.body.practices as Array<{
    id?: string;
    resultPlace?: string | null;
    resultTime?: string | null;
  }> : [];
  const byId = new Map(updates.filter(u => u?.id).map(u => [String(u.id), u]));
  const next = {
    ...config,
    resultsPublished: true,
    practices: config.practices.map(p => {
      const u = byId.get(p.id);
      if (!u) return p;
      return {
        ...p,
        resultPlace: u.resultPlace != null ? String(u.resultPlace).trim() || null : p.resultPlace,
        resultTime: u.resultTime != null ? String(u.resultTime).trim() || null : p.resultTime,
      };
    }),
  };
  const [updated] = await db.update(questions)
    .set({ practicesConfig: next })
    .where(eq(questions.id, id))
    .returning();
  res.json({ ok: true, question: serializeAdminQuestion(updated!, 0), practicesConfig: next });
};

export const unpublishPracticesResults = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [question] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  if (!question) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { normalizePracticesConfig } = await import('../services/practicesVoteConfig.js');
  const config = normalizePracticesConfig(question.practicesConfig);
  const next = { ...config, resultsPublished: false };
  const [updated] = await db.update(questions)
    .set({ practicesConfig: next })
    .where(eq(questions.id, id))
    .returning();
  res.json({ ok: true, question: serializeAdminQuestion(updated!, 0), practicesConfig: next });
};
