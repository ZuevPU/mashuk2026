import { Response } from 'express';
import { eq, desc, and, inArray, count, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  participants, directions, thematicTags, programPlaces, forumSettings, dayFocus,
  events, tasks, questions, questionOptions, taskSubmissions, taskTeamConfirmations, exchangeQuestions,
  exchangeAnswers, eventAttendance, materials, kbDayUnlocks,
  levelsConfig, piggybank, answers, dailyStats, pushLog, pointsLog,
  participantDayState, pedagogicalRoles, dayExperiments,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { notifyAllParticipants, sendPushNotification } from '../services/pushService.js';
import { recalculateDailyStats } from '../services/analyticsService.js';
import { clearCache } from '../services/cache.js';
import { normalizeOnboardingConfig } from '../services/roleService.js';
import { entryTags, formatTagsForExport } from '../services/piggybankDict.js';
import {
  eventCreateSchema, eventUpdateSchema,
  taskCreateSchema, taskUpdateSchema,
  questionCreateSchema, questionUpdateSchema,
  copyQuestionsDaySchema, seedTouchpointsSchema,
  parseBody,
} from '../validation/adminSchemas.js';
import { ROLE_KEYS } from '../services/roleService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  resolveEveningConfigForDay,
  type EveningQuestionnaireConfig,
} from '../services/eveningQuestionnaireConfig.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../services/touchpointTemplates.js';
import { getForumSettings as loadForumSettings } from '../services/helpers.js';
import { enrichEventTimestamps } from '../services/eventSchedule.js';

export const listParticipants = async (req: AdminRequest, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const [total] = await db.select({ count: count() }).from(participants);
  const list = await db.select().from(participants)
    .orderBy(desc(participants.createdAt))
    .limit(limit).offset(offset);

  res.json({ participants: list, totalCount: total.count });
};

export const updateParticipantDirection = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { directionId } = req.body;
  const [dir] = await db.select().from(directions).where(eq(directions.id, directionId)).limit(1);
  if (!dir) { res.status(400).json({ error: 'Invalid direction' }); return; }
  const [updated] = await db.update(participants)
    .set({ directionId: dir.id, direction: dir.name })
    .where(eq(participants.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Participant not found' }); return; }
  res.json({ participant: updated });
};

export const updateParticipantRole = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { pedagogicalRole, strongRole, growthRole, outcomesEdited, nextStepsEdited } = req.body;
  const patch: Partial<typeof participants.$inferInsert> = {};
  if (pedagogicalRole !== undefined) {
    if (pedagogicalRole && !(ROLE_KEYS as readonly string[]).includes(pedagogicalRole)) {
      res.status(400).json({ error: 'Invalid pedagogicalRole' });
      return;
    }
    patch.pedagogicalRole = pedagogicalRole || null;
  }
  if (strongRole !== undefined) patch.strongRole = strongRole || null;
  if (growthRole !== undefined) patch.growthRole = growthRole || null;
  if (outcomesEdited !== undefined) patch.outcomesEdited = outcomesEdited;
  if (nextStepsEdited !== undefined) patch.nextStepsEdited = nextStepsEdited;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }
  const [updated] = await db.update(participants)
    .set(patch)
    .where(eq(participants.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Participant not found' }); return; }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'role_change', section: 'participants', objectId: id,
    newValue: patch, isCritical: true,
  });
  res.json({ participant: updated });
};

/** Снять самоудаление — участник снова получает доступ к приложению */
export const restoreParticipantAccount = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }
  if (!existing.selfDeletedAt) {
    res.status(400).json({ error: 'Participant is not self-deleted' });
    return;
  }
  if (!existing.onboardingCompletedAt) {
    res.status(400).json({ error: 'Participant has no completed registration' });
    return;
  }
  const [updated] = await db.update(participants)
    .set({ selfDeletedAt: null })
    .where(eq(participants.id, id))
    .returning();
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'participant_restore',
    section: 'participants',
    objectId: id,
    newValue: { selfDeletedAt: null },
    isCritical: true,
  });
  res.json({ participant: updated });
};

export const crudRoles = {
  list: async (_req: AdminRequest, res: Response) => {
    const roles = await db.select().from(pedagogicalRoles).orderBy(asc(pedagogicalRoles.sortOrder));
    res.json({ roles });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(pedagogicalRoles)
      .set({
        name: req.body.name,
        quadrant: req.body.quadrant,
        essence: req.body.essence,
        inClass: req.body.inClass,
        keywords: req.body.keywords,
        sortOrder: req.body.sortOrder,
      })
      .where(eq(pedagogicalRoles.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ role: updated });
  },
};

export const crudDayExperiments = {
  list: async (req: AdminRequest, res: Response) => {
    const day = req.query.day ? Number(req.query.day) : null;
    const roleKey = req.query.roleKey as string | undefined;
    let list = await db.select().from(dayExperiments);
    if (day) list = list.filter(e => e.dayNumber === day);
    if (roleKey) list = list.filter(e => e.roleKey === roleKey);
    res.json({ experiments: list });
  },
  upsert: async (req: AdminRequest, res: Response) => {
    const { dayNumber, roleKey, title, body, hint } = req.body;
    if (!dayNumber || !roleKey || !title) {
      res.status(400).json({ error: 'dayNumber, roleKey, title required' });
      return;
    }
    if (!(ROLE_KEYS as readonly string[]).includes(roleKey)) {
      res.status(400).json({ error: 'Invalid roleKey' });
      return;
    }
    const [existing] = await db.select().from(dayExperiments)
      .where(and(eq(dayExperiments.dayNumber, dayNumber), eq(dayExperiments.roleKey, roleKey)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(dayExperiments)
        .set({ title, body, hint })
        .where(eq(dayExperiments.id, existing.id)).returning();
      res.json({ experiment: updated });
      return;
    }
    const [created] = await db.insert(dayExperiments).values({
      dayNumber, roleKey, title, body, hint,
    }).returning();
    res.json({ experiment: created });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(dayExperiments).where(eq(dayExperiments.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const resetRegistration = async (req: AdminRequest, res: Response): Promise<void> => {
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
    await tx.delete(participantDayState).where(eq(participantDayState.participantId, id));
    await tx.delete(participants).where(eq(participants.id, id));
  });

  res.json({ ok: true });
};

export const createParticipant = async (req: AdminRequest, res: Response): Promise<void> => {
  const { vkId, firstName, lastName, directionId } = req.body;
  if (!vkId) {
    res.status(400).json({ error: 'vkId required' });
    return;
  }
  let directionName: string | undefined;
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
    consentPd: true,
    consentAnalytics: true,
    onboardingCompletedAt: new Date(),
  }).returning();
  res.json({ participant: created });
};

export const crudDirections = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ directions: await db.select().from(directions) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const [d] = await db.insert(directions).values({ name: req.body.name }).returning();
    res.json({ direction: d });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(directions)
      .set({ name: req.body.name, isHidden: req.body.isHidden })
      .where(eq(directions.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ direction: updated });
  },
};

export const crudThematicTags = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ tags: await db.select().from(thematicTags) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const [t] = await db.insert(thematicTags).values({ name: req.body.name }).returning();
    res.json({ tag: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(thematicTags)
      .set({ name: req.body.name })
      .where(eq(thematicTags.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ tag: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(thematicTags).where(eq(thematicTags.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
  /** Объединить fromId → toId: перепривязать события/материалы/интересы, удалить from */
  merge: async (req: AdminRequest, res: Response) => {
    const fromId = Number(req.body.fromId);
    const toId = Number(req.body.toId);
    if (!fromId || !toId || fromId === toId) {
      res.status(400).json({ error: 'fromId and toId required and must differ' });
      return;
    }
    const [from] = await db.select().from(thematicTags).where(eq(thematicTags.id, fromId)).limit(1);
    const [to] = await db.select().from(thematicTags).where(eq(thematicTags.id, toId)).limit(1);
    if (!from || !to) { res.status(404).json({ error: 'Tag not found' }); return; }

    const allEvents = await db.select().from(events);
    let eventsUpdated = 0;
    for (const ev of allEvents) {
      const tags = Array.isArray(ev.tags) ? (ev.tags as string[]) : [];
      if (!tags.includes(from.name)) continue;
      const next = [...new Set(tags.map(t => (t === from.name ? to.name : t)))];
      await db.update(events).set({ tags: next }).where(eq(events.id, ev.id));
      eventsUpdated++;
    }

    const allMats = await db.select().from(materials);
    let matsUpdated = 0;
    for (const m of allMats) {
      const tags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
      if (!tags.includes(from.name)) continue;
      const next = [...new Set(tags.map(t => (t === from.name ? to.name : t)))];
      await db.update(materials).set({ tags: next }).where(eq(materials.id, m.id));
      matsUpdated++;
    }

    await db.delete(thematicTags).where(eq(thematicTags.id, fromId));
    res.json({
      ok: true,
      kept: to,
      removed: from.name,
      eventsUpdated,
      materialsUpdated: matsUpdated,
    });
  },
};

export const crudProgramPlaces = {
  list: async (_req: AdminRequest, res: Response) => {
    const places = await db.select().from(programPlaces).orderBy(asc(programPlaces.name));
    res.json({ places });
  },
  create: async (req: AdminRequest, res: Response) => {
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const [place] = await db.insert(programPlaces).values({ name }).returning();
    res.json({ place });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const [prev] = await db.select().from(programPlaces).where(eq(programPlaces.id, id)).limit(1);
    if (!prev) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const [updated] = await db.update(programPlaces)
      .set({ name })
      .where(eq(programPlaces.id, id))
      .returning();
    if (prev.name !== name) {
      await db.update(events).set({ place: name }).where(eq(events.place, prev.name));
    }
    res.json({ place: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(programPlaces).where(eq(programPlaces.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await db.update(events).set({ place: null }).where(eq(events.place, deleted.name));
    res.json({ ok: true });
  },
};

export const updateForumSettings = async (req: AdminRequest, res: Response): Promise<void> => {
  const [existing] = await db.select().from(forumSettings).limit(1);
  const body = { ...req.body } as Record<string, unknown>;
  if (body.roleDiagnosticsConfig != null && existing) {
    const merged = normalizeOnboardingConfig({
      ...(existing.roleDiagnosticsConfig as Record<string, unknown> | null),
      ...(body.roleDiagnosticsConfig as Record<string, unknown>),
    });
    body.roleDiagnosticsConfig = merged;
  } else if (body.roleDiagnosticsConfig != null) {
    body.roleDiagnosticsConfig = normalizeOnboardingConfig(body.roleDiagnosticsConfig);
  }
  if (existing) {
    const [updated] = await db.update(forumSettings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(forumSettings.id, existing.id)).returning();
    clearCache('forumSettings');
    res.json({ settings: updated });
  } else {
    const [created] = await db.insert(forumSettings).values(req.body).returning();
    clearCache('forumSettings');
    res.json({ settings: created });
  }
};

export const getAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const [settings] = await db.select().from(forumSettings).limit(1);
  res.json({
    day,
    config: resolveEveningConfigForDay(settings ?? null, day),
    defaultConfig: DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  });
};

export const patchAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const config = req.body.config as EveningQuestionnaireConfig;
  if (!config?.steps?.length) {
    res.status(400).json({ error: 'config.steps required' });
    return;
  }
  const [settings] = await db.select().from(forumSettings).limit(1);
  if (!settings) {
    res.status(404).json({ error: 'forum_settings missing' });
    return;
  }
  const byDay = (settings.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {};
  byDay[String(day)] = config;
  const [updated] = await db.update(forumSettings)
    .set({ eveningQuestionnaireByDay: byDay, updatedAt: new Date() })
    .where(eq(forumSettings.id, settings.id))
    .returning();
  clearCache('forumSettings');
  res.json({ settings: updated, config: resolveEveningConfigForDay(updated, day) });
};

export const copyAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const fromDay = Math.max(1, Math.min(7, Number(req.body.fromDay) || 1));
  const toDay = Math.max(1, Math.min(7, Number(req.body.toDay) || 1));
  const [settings] = await db.select().from(forumSettings).limit(1);
  if (!settings) {
    res.status(404).json({ error: 'forum_settings missing' });
    return;
  }
  const src = resolveEveningConfigForDay(settings, fromDay);
  const byDay = (settings.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {};
  byDay[String(toDay)] = src;
  const [updated] = await db.update(forumSettings)
    .set({ eveningQuestionnaireByDay: byDay, updatedAt: new Date() })
    .where(eq(forumSettings.id, settings.id))
    .returning();
  clearCache('forumSettings');
  res.json({ ok: true, toDay, config: resolveEveningConfigForDay(updated, toDay) });
};

export const resetAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const [settings] = await db.select().from(forumSettings).limit(1);
  if (!settings) {
    res.status(404).json({ error: 'forum_settings missing' });
    return;
  }
  const byDay = { ...(settings.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) };
  delete byDay[String(day)];
  const [updated] = await db.update(forumSettings)
    .set({
      eveningQuestionnaireByDay: Object.keys(byDay).length ? byDay : null,
      updatedAt: new Date(),
    })
    .where(eq(forumSettings.id, settings.id))
    .returning();
  clearCache('forumSettings');
  res.json({ config: resolveEveningConfigForDay(updated, day) });
};

export const upsertDayFocus = async (req: AdminRequest, res: Response): Promise<void> => {
  const { dayNumber, title, text, keyQuestion } = req.body;
  const [existing] = await db.select().from(dayFocus).where(eq(dayFocus.dayNumber, dayNumber)).limit(1);
  if (existing) {
    const [updated] = await db.update(dayFocus)
      .set({ title, text, keyQuestion }).where(eq(dayFocus.id, existing.id)).returning();
    res.json({ focus: updated });
  } else {
    const [created] = await db.insert(dayFocus).values({ dayNumber, title, text, keyQuestion }).returning();
    res.json({ focus: created });
  }
};

export const listDayFocus = async (_req: AdminRequest, res: Response): Promise<void> => {
  const list = await db.select().from(dayFocus).orderBy(dayFocus.dayNumber);
  res.json({ focus: list });
};

export const crudEvents = {
  list: async (_req: AdminRequest, res: Response) => res.json({ events: await db.select().from(events) }),
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(eventCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const settings = await loadForumSettings();
    const values = enrichEventTimestamps(parsed.data, settings);
    const [e] = await db.insert(events).values(values).returning();
    clearCache('events_day_');
    res.json({ event: e });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(eventUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const settings = await loadForumSettings();
    const values = enrichEventTimestamps(parsed.data, settings, existing);
    const [updated] = await db.update(events).set(values).where(eq(events.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    clearCache('events_day_');
    res.json({ event: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await db.delete(eventAttendance).where(eq(eventAttendance.eventId, id));
    await db.update(materials).set({ eventId: null }).where(eq(materials.eventId, id));
    await db.delete(events).where(eq(events.id, id));
    clearCache('events_day_');
    res.json({ ok: true });
  },
};

export const crudTasks = {
  list: async (_req: AdminRequest, res: Response) => res.json({ tasks: await db.select().from(tasks) }),
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(taskCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [t] = await db.insert(tasks).values(parsed.data).returning();
    if (t.pushOnPublish) {
      await notifyAllParticipants(`Новое задание: ${t.title}`, 'task_publish');
    }
    res.json({ task: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(taskUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }
    const [updated] = await db.update(tasks).set(parsed.data).where(eq(tasks.id, id)).returning();
    const now = new Date();
    const wasLive = before?.publishTime && before.publishTime <= now;
    const isLive = updated?.publishTime && updated.publishTime <= now;
    if (updated?.pushOnPublish && isLive && !wasLive) {
      await notifyAllParticipants(`Новое задание: ${updated.title}`, 'task_publish');
    }
    res.json({ task: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await db.delete(taskSubmissions).where(eq(taskSubmissions.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    res.json({ ok: true });
  },
};

export const crudQuestions = {
  list: async (_req: AdminRequest, res: Response) => res.json({ questions: await db.select().from(questions) }),
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(questionCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const textBody = (parsed.data.text?.trim() || parsed.data.title.trim());
    const [q] = await db.insert(questions).values({
      type: 'open',
      status: 'draft',
      ...parsed.data,
      text: textBody,
    }).returning();
    if (q.pushOnPublish && q.status === 'published') {
      await notifyAllParticipants(`Новый вопрос: ${q.title}`, 'question_publish');
    }
    res.json({ question: q });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(questionUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [before] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }

    const [{ count: answerCount }] = await db.select({ count: count() }).from(answers).where(eq(answers.questionId, id));
    const textChanging = (parsed.data.text && parsed.data.text !== before.text)
      || (parsed.data.title && parsed.data.title !== before.title);

    // Если уже есть ответы и меняется формулировка — архивируем старый, создаём новую версию
    if (answerCount > 0 && textChanging) {
      await db.update(questions).set({ status: 'archived' }).where(eq(questions.id, id));
      const [created] = await db.insert(questions).values({
        title: parsed.data.title ?? before.title,
        text: parsed.data.text ?? before.text,
        type: parsed.data.type ?? before.type,
        block: parsed.data.block ?? before.block,
        reflectionKind: parsed.data.reflectionKind ?? before.reflectionKind,
        status: parsed.data.status ?? 'published',
        publishTime: before.publishTime,
        closeTime: before.closeTime,
        points: parsed.data.points ?? before.points,
        timePoint: parsed.data.timePoint ?? before.timePoint,
        dayNumber: parsed.data.dayNumber ?? before.dayNumber,
        direction: before.direction,
        allowRetry: parsed.data.allowRetry ?? before.allowRetry,
        pushOnPublish: parsed.data.pushOnPublish ?? before.pushOnPublish,
        parentQuestionId: id,
      }).returning();
      const { logAdminAction } = await import('../services/adminActionsLog.js');
      await logAdminAction({
        req, actionType: 'question_update', section: 'questions', objectId: created.id,
        oldValue: { id, title: before.title }, newValue: { id: created.id, parentQuestionId: id, answerCount },
        comment: `Новая версия: уже было ${answerCount} ответов`, isCritical: true,
      });
      res.json({ question: created, versioned: true, archivedId: id, previousAnswerCount: answerCount });
      return;
    }

    const patch = { ...parsed.data };
    if (patch.text === null) delete patch.text;
    const [updated] = await db.update(questions).set(patch as Partial<typeof questions.$inferInsert>).where(eq(questions.id, id)).returning();
    const wasPublished = before?.status === 'published';
    const isPublished = updated?.status === 'published';
    if (updated?.pushOnPublish && isPublished && !wasPublished) {
      await notifyAllParticipants(`Новый вопрос: ${updated.title}`, 'question_publish');
    }
    res.json({ question: updated, versioned: false });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await db.delete(answers).where(eq(answers.questionId, id));
    await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
    await db.delete(questions).where(eq(questions.id, id));
    res.json({ ok: true });
  },
  listOptions: async (req: AdminRequest, res: Response) => {
    const questionId = Number(req.params.id);
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, questionId));
    res.json({ options: opts });
  },
  addOption: async (req: AdminRequest, res: Response) => {
    const questionId = Number(req.params.id);
    const [opt] = await db.insert(questionOptions).values({
      questionId,
      label: req.body.label,
      value: req.body.value || req.body.label,
    }).returning();
    res.json({ option: opt });
  },
  deleteOption: async (req: AdminRequest, res: Response) => {
    const optionId = Number(req.params.optionId);
    await db.delete(questionOptions).where(eq(questionOptions.id, optionId));
    res.json({ ok: true });
  },
};

/** Скопировать вопросы с дня fromDay на toDay */
export const copyQuestionsDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(copyQuestionsDaySchema, req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const { fromDay, toDay, overwrite } = parsed.data;
  if (fromDay === toDay) { res.status(400).json({ error: 'fromDay and toDay must differ' }); return; }

  const source = await db.select().from(questions).where(eq(questions.dayNumber, fromDay));
  if (source.length === 0) { res.status(404).json({ error: 'No questions on fromDay' }); return; }

  if (overwrite) {
    const targets = await db.select().from(questions).where(eq(questions.dayNumber, toDay));
    for (const t of targets) {
      await db.delete(answers).where(eq(answers.questionId, t.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, t.id));
      await db.delete(questions).where(eq(questions.id, t.id));
    }
  }

  const [settings] = await db.select().from(forumSettings).limit(1);
  const startDate = settings?.startDate || new Date();
  const created = [];
  for (const q of source) {
    const slot = TOUCHPOINT_SLOTS.find(s => s.title === q.title);
    let publishTime = q.publishTime;
    let closeTime = q.closeTime;
    if (slot) {
      const w = windowsForDay(startDate, toDay, slot);
      publishTime = w.publishTime;
      closeTime = w.closeTime;
    } else if (q.publishTime && q.closeTime) {
      const delta = (toDay - fromDay) * 86_400_000;
      publishTime = new Date(q.publishTime.getTime() + delta);
      closeTime = new Date(q.closeTime.getTime() + delta);
    }
    const [row] = await db.insert(questions).values({
      title: q.title,
      text: q.text,
      type: q.type,
      block: q.block,
      status: q.status,
      publishTime,
      closeTime,
      points: q.points,
      timePoint: q.timePoint,
      dayNumber: toDay,
      direction: q.direction,
      allowRetry: q.allowRetry,
      pushOnPublish: false,
      parentQuestionId: q.id,
    }).returning();
    created.push(row);
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
    for (const o of opts) {
      await db.insert(questionOptions).values({
        questionId: row.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
      });
    }
  }
  res.json({ ok: true, created: created.length, questions: created });
};

/** Развернуть шаблон 7 точек на выбранные дни */
export const seedTouchpointsTemplate = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(seedTouchpointsSchema, req.body ?? {});
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const days = parsed.data.days ?? [1, 2, 3, 4, 5, 6, 7];
  const overwrite = parsed.data.overwrite;

  const [settings] = await db.select().from(forumSettings).limit(1);
  const startDate = settings?.startDate || new Date('2026-08-12T00:00:00');
  let created = 0;

  for (const day of days) {
    if (overwrite) {
      const existing = await db.select().from(questions).where(eq(questions.dayNumber, day));
      for (const q of existing) {
        if (!TOUCHPOINT_SLOTS.some(s => s.title === q.title)) continue;
        await db.delete(answers).where(eq(answers.questionId, q.id));
        await db.delete(questionOptions).where(eq(questionOptions.questionId, q.id));
        await db.delete(questions).where(eq(questions.id, q.id));
      }
    }
    const existing = await db.select().from(questions).where(eq(questions.dayNumber, day));
    for (const slot of TOUCHPOINT_SLOTS) {
      if (existing.some(q => q.title === slot.title) && !overwrite) continue;
      const { publishTime, closeTime } = windowsForDay(startDate, day, slot);
      await db.insert(questions).values({
        title: slot.title,
        text: slot.text,
        type: slot.type,
        block: slot.block,
        status: 'published',
        publishTime,
        closeTime,
        points: slot.points,
        dayNumber: day,
        timePoint: slot.timePoint,
      });
      created++;
    }
  }
  res.json({ ok: true, created, days });
};

export const moderateTask = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { status, moderatorComment } = req.body;

  const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }

  const [task] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId)).limit(1);

  if (status === 'approved' && task?.confirmationType === 'team') {
    const confRows = await db.select().from(taskTeamConfirmations)
      .where(eq(taskTeamConfirmations.submissionId, id));
    if (confRows.length > 0 && !confRows.every(r => r.status === 'confirmed')) {
      res.status(400).json({ error: 'Командное задание: не все участники подтвердили участие' });
      return;
    }
  }

  const [updated] = await db.update(taskSubmissions)
    .set({ status, moderatorComment, checkedAt: new Date() })
    .where(eq(taskSubmissions.id, id)).returning();

  if (status === 'approved' && updated && !(existing.pointsAwarded ?? 0) && task) {
    const { awardTeamOnModeratorApprove } = await import('../services/teamTaskService.js');
    const { effectiveTaskPoints } = await import('../services/taskPoints.js');
    const pts = effectiveTaskPoints(task);
    await awardTeamOnModeratorApprove(updated, task);
    await db.update(taskSubmissions)
      .set({ pointsAwarded: pts })
      .where(eq(taskSubmissions.id, id));
    updated.pointsAwarded = pts;
  }

  try {
    const { sendPushNotification } = await import('../services/pushService.js');
    const title = task?.title || 'Задание';
    if (status === 'approved') {
      await sendPushNotification(
        [existing.participantId],
        `Задание «${title}» принято${task?.points ? ` · +${task.points} ⚡` : ''}`,
        'transactional_task_approved',
      );
    } else if (status === 'rejected') {
      await sendPushNotification(
        [existing.participantId],
        `Задание «${title}» не принято${moderatorComment ? `: ${moderatorComment}` : ''}`,
        'transactional_task_rejected',
      );
    }
  } catch {
    // push optional
  }

  res.json({ submission: updated });
};

export const moderateExchange = async (req: AdminRequest, res: Response): Promise<void> => {
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

export const listPendingExchange = async (_req: AdminRequest, res: Response): Promise<void> => {
  const list = await db.select().from(exchangeQuestions)
    .where(eq(exchangeQuestions.moderationStatus, 'pending'));
  res.json({ questions: list });
};

export const listAllExchange = async (req: AdminRequest, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
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
    baseQuery = baseQuery.where(eq(exchangeQuestions.moderationStatus, status)) as any;
    countQuery = countQuery.where(eq(exchangeQuestions.moderationStatus, status)) as any;
  }

  const [total] = await countQuery;
  const rows = await baseQuery.orderBy(desc(exchangeQuestions.createdAt)).limit(limit).offset(offset);

  const qIds = rows.map(r => r.q.id);
  let answersByQ = new Map<number, any[]>();

  if (qIds.length > 0) {
    const allAnswers = await db.select({
      a: exchangeAnswers,
      author: participants,
    }).from(exchangeAnswers)
      .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
      .where(inArray(exchangeAnswers.questionId, qIds));

    for (const row of allAnswers) {
      const qid = row.a.questionId;
      if (!answersByQ.has(qid)) answersByQ.set(qid, []);
      answersByQ.get(qid)!.push(row);
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

export const listExchangeAnswers = async (_req: AdminRequest, res: Response): Promise<void> => {
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
  list: async (_req: AdminRequest, res: Response) => res.json({ config: await db.select().from(levelsConfig) }),
  upsert: async (req: AdminRequest, res: Response) => {
    const { actionType, pointsPerUnit, maxAccruals, levelThresholds } = req.body;
    const [existing] = await db.select().from(levelsConfig)
      .where(eq(levelsConfig.actionType, actionType)).limit(1);
    if (existing) {
      const [updated] = await db.update(levelsConfig)
        .set({ pointsPerUnit, maxAccruals, levelThresholds })
        .where(eq(levelsConfig.id, existing.id)).returning();
      res.json({ config: updated });
    } else {
      const [created] = await db.insert(levelsConfig).values(req.body).returning();
      res.json({ config: created });
    }
  },
};

export const crudMaterials = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ materials: await db.select().from(materials) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const [m] = await db.insert(materials).values({
      ...req.body,
      isNew: req.body.isNew !== false,
    }).returning();
    res.json({ material: m });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(materials).set(req.body).where(eq(materials.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ material: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(materials).where(eq(materials.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const exportParticipants = async (_req: AdminRequest, res: Response): Promise<void> => {
  const list = await db.select().from(participants);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=participants.csv');
  const header = 'id,vk_id,first_name,last_name,age,workplace,position,direction,pedagogical_role,interests,path_points,experience_points,onboarding_completed_at,created_at\n';
  const rows = list.map(p =>
    [
      p.id, p.vkId, p.firstName, p.lastName, p.age, JSON.stringify(p.workplace || ''),
      JSON.stringify(p.position || ''), p.direction, p.pedagogicalRole,
      JSON.stringify(p.interests || []), p.pathPoints, p.experiencePoints,
      p.onboardingCompletedAt, p.createdAt,
    ].join(',')
  ).join('\n');
  res.send('\uFEFF' + header + rows);
};

export const exportAnswers = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = req.query.day ? Number(req.query.day) : null;
  const type = (req.query.type as string | undefined)?.toLowerCase() || null;
  // type: checkin | direction | lessons | evening | point_a | point_b | all

  let rows = await db.select({ a: answers, p: participants, q: questions })
    .from(answers)
    .leftJoin(participants, eq(answers.participantId, participants.id))
    .leftJoin(questions, eq(answers.questionId, questions.id));

  if (day) {
    rows = rows.filter(r => r.q?.dayNumber === day);
  }
  if (type && type !== 'all') {
    rows = rows.filter(r => {
      const block = (r.q?.block || '').toLowerCase();
      const t = (r.q?.type || '').toLowerCase();
      if (type === 'checkin' || type === 'проверка') {
        return block.includes('проверка') || t === 'checkin';
      }
      if (type === 'direction' || type === 'направление') {
        return block.includes('направлен') || block.includes('осмыслен');
      }
      if (type === 'lessons' || type === 'уроки') {
        return block.includes('урок');
      }
      if (type === 'evening' || type === 'итоги') {
        return block.includes('итог') || block.includes('вечер');
      }
      if (type === 'point_a' || type === 'точка_а') {
        return block.includes('целеполагание') || block.includes('точка а');
      }
      if (type === 'point_b' || type === 'точка_б') {
        return block.includes('точка б');
      }
      return true;
    });
  }

  const includeDepth = req.query.depth === '1' || req.query.depth === 'true';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const filename = day ? `answers_day${day}.csv` : 'answers.csv';
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  const header = includeDepth
    ? 'participant_id,name,direction,group_name,day,block,question_title,question_type,time_point,answer,word_count,depth_orientir,points,created_at\n'
    : 'participant_id,name,direction,group_name,day,block,question_title,question_type,time_point,answer,word_count,points,created_at\n';
  const csv = rows.map(r => {
    const answerText = typeof r.a.answerData === 'string'
      ? r.a.answerData
      : JSON.stringify(r.a.answerData ?? '');
    const cells: Array<string | number | null | undefined> = [
      r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction, r.p?.groupName ?? '',
      r.q?.dayNumber ?? '', r.q?.block, r.q?.title, r.q?.type, r.q?.timePoint || '',
      `"${answerText.replace(/"/g, '""')}"`,
      r.a.wordCount,
    ];
    if (includeDepth) {
      cells.push(inferReflectionDepth(answerText) || '');
    }
    cells.push(r.a.pointsAwarded, r.a.createdAt ? new Date(r.a.createdAt).toISOString() : '');
    return cells.join(',');
  }).join('\n');
  res.send('\uFEFF' + header + csv);
};

export const exportPiggybank = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select({ e: piggybank, p: participants })
    .from(piggybank)
    .leftJoin(participants, eq(piggybank.participantId, participants.id));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=piggybank.csv');
  const header = 'participant_id,name,direction,tag,source,text,created_at\n';
  const csv = rows.map(r => [
    r.p?.id, `${r.p?.firstName} ${r.p?.lastName}`, r.p?.direction,
    r.e.id, r.p?.firstName, r.p?.lastName, formatTagsForExport(r.e), r.e.source, `"${(r.e.text || '').replace(/"/g, '""')}"`, r.e.forumDay ?? '', r.e.createdAt,
  ].join(',')).join('\n');
  res.send('\uFEFF' + header + csv);
};

export const exportTaskSubmissions = async (_req: AdminRequest, res: Response): Promise<void> => {
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

export const exportExchange = async (_req: AdminRequest, res: Response): Promise<void> => {
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

export const exportAttendance = async (_req: AdminRequest, res: Response): Promise<void> => {
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

export const exportPointsLog = async (_req: AdminRequest, res: Response): Promise<void> => {
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

export const getAnalyticsSummary = async (_req: AdminRequest, res: Response): Promise<void> => {
  const participantCount = (await db.select().from(participants)).length;
  const answerCount = (await db.select().from(answers)).length;
  const stats = await db.select().from(dailyStats).limit(1);
  const tagStats: Record<string, number> = {};
  for (const e of await db.select().from(piggybank)) {
    for (const tag of entryTags(e)) {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
    }
  }
  res.json({
    participantCount,
    answerCount,
    completionPercent: stats[0]?.completionPercent ?? 0,
    avgEnergy: stats[0]?.avgEnergy ?? 0,
    emotionsDistribution: stats[0]?.emotionsDistribution ?? {},
    emotionZonesDistribution: stats[0]?.emotionZonesDistribution ?? {},
    redFlag: stats[0]?.redFlag ?? false,
    piggybankTags: tagStats,
  });
};

export const getAnalyticsCharts = async (_req: AdminRequest, res: Response): Promise<void> => {
  const stats = await db.select().from(dailyStats);
  const allAnswers = await db.select().from(answers);
  const checkins = allAnswers.filter(a => {
    const d = a.answerData as { energy?: number; emotion?: string } | null;
    return d && typeof d.energy === 'number';
  });
  const energyByDay: Record<string, number[]> = {};
  for (const a of checkins) {
    const day = a.createdAt ? new Date(a.createdAt).toLocaleDateString('ru-RU') : 'unknown';
    const energy = (a.answerData as { energy: number }).energy;
    if (!energyByDay[day]) energyByDay[day] = [];
    energyByDay[day].push(energy);
  }
  const energyTrend = Object.entries(energyByDay).map(([day, vals]) => ({
    day,
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
  }));
  const tagStats: Record<string, number> = {};
  for (const e of await db.select().from(piggybank)) {
    for (const tag of entryTags(e)) {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
    }
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

export const sendManualPush = async (req: AdminRequest, res: Response): Promise<void> => {
  const { text, participantId } = req.body;
  if (!text?.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (participantId) {
    await sendPushNotification([Number(participantId)], text, 'manual');
  } else {
    await notifyAllParticipants(text, 'manual');
  }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'push_send', section: 'push',
    newValue: { participantId: participantId || 'all', text: String(text).slice(0, 200) },
    isCritical: true,
  });
  res.json({ ok: true });
};

export const listPushLog = async (_req: AdminRequest, res: Response): Promise<void> => {
  const log = await db.select().from(pushLog).orderBy(desc(pushLog.sentAt)).limit(50);
  res.json({ log });
};

export const listPointsLog = async (_req: AdminRequest, res: Response): Promise<void> => {
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

export const triggerAnalyticsRecalc = async (_req: AdminRequest, res: Response): Promise<void> => {
  await recalculateDailyStats();
  res.json({ ok: true });
};

export const listPendingSubmissions = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select({
    s: taskSubmissions,
    p: participants,
    t: tasks,
  }).from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
    .where(eq(taskSubmissions.status, 'pending'));

  const subIds = rows.map(r => r.s.id);
  const confRows = subIds.length
    ? await db.select({
      c: taskTeamConfirmations,
      p: participants,
    }).from(taskTeamConfirmations)
      .leftJoin(participants, eq(taskTeamConfirmations.participantId, participants.id))
      .where(inArray(taskTeamConfirmations.submissionId, subIds))
    : [];
  const confBySub = new Map<number, { participantId: number; name: string; status: string }[]>();
  for (const { c, p } of confRows) {
    const list = confBySub.get(c.submissionId) || [];
    list.push({
      participantId: c.participantId,
      name: `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim() || `#${c.participantId}`,
      status: c.status ?? 'pending',
    });
    confBySub.set(c.submissionId, list);
  }

  res.json({
    submissions: rows.map(r => ({
      ...r.s,
      participantName: `${r.p?.firstName} ${r.p?.lastName}`,
      taskTitle: r.t?.title,
      confirmationType: r.t?.confirmationType,
      teamConfirmations: confBySub.get(r.s.id) || [],
    })),
  });
};

export const listAllSubmissions = async (req: AdminRequest, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  const taskIdRaw = req.query.taskId as string | undefined;
  const participantIdRaw = req.query.participantId as string | undefined;
  const taskId = taskIdRaw ? Number(taskIdRaw) : undefined;
  const participantId = participantIdRaw ? Number(participantIdRaw) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const sortBy = String(req.query.sortBy || 'submittedAt');
  const sortDirFn = req.query.sortDir === 'asc' ? asc : desc;

  const conditions = [];
  if (status) conditions.push(eq(taskSubmissions.status, status));
  if (taskId && !Number.isNaN(taskId)) conditions.push(eq(taskSubmissions.taskId, taskId));
  if (participantId && !Number.isNaN(participantId)) {
    conditions.push(eq(taskSubmissions.participantId, participantId));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  let countQuery = db.select({ count: count() }).from(taskSubmissions);
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [total] = await countQuery;

  let orderExpr;
  if (sortBy === 'participant') orderExpr = sortDirFn(participants.firstName);
  else if (sortBy === 'status') orderExpr = sortDirFn(taskSubmissions.status);
  else if (sortBy === 'points') orderExpr = sortDirFn(taskSubmissions.pointsAwarded);
  else orderExpr = sortDirFn(taskSubmissions.submittedAt);

  let baseQuery = db.select({
    s: taskSubmissions,
    p: participants,
    t: tasks,
  }).from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  if (where) baseQuery = baseQuery.where(where) as typeof baseQuery;

  const rows = await baseQuery.orderBy(orderExpr).limit(limit).offset(offset);

  const subIds = rows.map(r => r.s.id);
  const confRows = subIds.length
    ? await db.select({
      c: taskTeamConfirmations,
      p: participants,
    }).from(taskTeamConfirmations)
      .leftJoin(participants, eq(taskTeamConfirmations.participantId, participants.id))
      .where(inArray(taskTeamConfirmations.submissionId, subIds))
    : [];
  const confBySub = new Map<number, { participantId: number; name: string; status: string }[]>();
  for (const { c, p } of confRows) {
    const list = confBySub.get(c.submissionId) || [];
    list.push({
      participantId: c.participantId,
      name: `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim() || `#${c.participantId}`,
      status: c.status ?? 'pending',
    });
    confBySub.set(c.submissionId, list);
  }

  res.json({
    submissions: rows.map(r => ({
      ...r.s,
      participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
      participantId: r.p?.id ?? r.s.participantId,
      taskTitle: r.t?.title,
      taskDay: r.t?.dayNumber,
      confirmationType: r.t?.confirmationType,
      teamConfirmations: confBySub.get(r.s.id) || [],
    })),
    totalCount: total.count,
    page,
    limit,
  });
};

export const listEventAttendance = async (req: AdminRequest, res: Response): Promise<void> => {
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

export const getForumSettings = async (_req: AdminRequest, res: Response): Promise<void> => {
  const [settings] = await db.select().from(forumSettings).limit(1);
  res.json({ settings: settings ?? null });
};

export const listKbDayUnlocks = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select().from(kbDayUnlocks).orderBy(desc(kbDayUnlocks.unlockedAt));
  res.json({ unlocks: rows });
};

export const createKbDayUnlock = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.body.participantId);
  const dayNumber = Number(req.body.dayNumber);
  if (!participantId || !dayNumber) {
    res.status(400).json({ error: 'participantId and dayNumber required' });
    return;
  }
  const [row] = await db.insert(kbDayUnlocks).values({
    participantId,
    dayNumber,
    unlockedByAdminId: req.adminId ?? null,
  }).onConflictDoUpdate({
    target: [kbDayUnlocks.participantId, kbDayUnlocks.dayNumber],
    set: { unlockedAt: new Date(), unlockedByAdminId: req.adminId ?? null },
  }).returning();
  res.json({ unlock: row });
};

export const deleteKbDayUnlock = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.participantId);
  const dayNumber = Number(req.params.dayNumber);
  await db.delete(kbDayUnlocks).where(
    and(eq(kbDayUnlocks.participantId, participantId), eq(kbDayUnlocks.dayNumber, dayNumber)),
  );
  res.json({ ok: true });
};
