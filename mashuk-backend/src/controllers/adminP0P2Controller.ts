import { Response } from 'express';
import { asc, count, desc, eq, inArray, isNotNull, and, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, clubMatches, consentTexts, dailyStats, eventAttendance, events, materials,
  participantDayState, participantGroups, participants, piggybank, pointsLog, pushQueue, pushTemplates,
  questions, scheduleDayVersions, scheduleDays, taskSubmissions, tasks, taskTeamConfirmations,
  userMedals, medals, adminActionsLog, forumSettings,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { getForumSettings } from '../services/helpers.js';
import { deactivateOtherConsents } from './consentsController.js';
import { evaluateAllMedals, getMedalRuleProgress, parseMedalRule } from '../services/medalEvaluator.js';
import { clubMatchNightly, synthesizeOutcomes } from '../services/gigachatService.js';
import {
  allocateTaskQrCode,
  generateQrToken,
  buildTaskQrUrl,
  buildEventQrUrl,
  buildParticipantQrUrl,
  buildQrDataUrl,
  formatTaskQrDisplayCode,
  resolveParticipantAppBase,
} from '../services/qrService.js';
import { logAdminAction } from '../services/adminActionsLog.js';
import { env } from '../config/env.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { EVENING_SCALE_KEYS } from '../services/touchpointTemplates.js';
import { emptyZoneDistribution } from '../services/emotionZones.js';
import { taskMethodsForParticipant } from '../services/taskAdminHelpers.js';
import { resolveParticipantAvatarUrl } from '../services/participantAvatarSync.js';

// ─── Consents CRUD ───────────────────────────────────────────

export const crudConsents = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ consents: await db.select().from(consentTexts).orderBy(desc(consentTexts.createdAt)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { kind, version, title, body, isActive } = req.body;
    if (!kind || !version || !title || !body) {
      res.status(400).json({ error: 'kind, version, title, body required' });
      return;
    }
    const [row] = await db.insert(consentTexts).values({
      kind,
      version: Number(version),
      title,
      body,
      isActive: !!isActive,
    }).returning();
    if (row.isActive) await deactivateOtherConsents(kind, row.id);
    await logAdminAction({ req, actionType: 'consent_create', section: 'consents', objectId: row.id, newValue: row });
    res.json({ consent: row });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(consentTexts).set(req.body).where(eq(consentTexts.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    if (updated.isActive) await deactivateOtherConsents(updated.kind, updated.id);
    res.json({ consent: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(consentTexts).where(eq(consentTexts.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

// ─── Groups CRUD ─────────────────────────────────────────────

export const crudGroups = {
  list: async (req: AdminRequest, res: Response) => {
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const groups = await db.select().from(participantGroups)
      .where(eq(participantGroups.shiftId, shiftId))
      .orderBy(asc(participantGroups.id));
    const withCounts = await Promise.all(groups.map(async (g) => {
      const [c] = await db.select({ c: count() }).from(participants).where(and(
        eq(participants.groupId, g.id),
        eq(participants.shiftId, shiftId),
      ));
      return { ...g, membersCount: Number(c?.c ?? 0) };
    }));
    res.json({ groups: withCounts });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { name, directionId, capacity } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const [g] = await db.insert(participantGroups).values({
      name: name.trim(),
      directionId: directionId ? Number(directionId) : null,
      capacity: capacity != null ? Number(capacity) : 30,
      shiftId,
    }).returning();
    res.json({ group: g });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(participantGroups).set(req.body).where(eq(participantGroups.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    // sync group_name on participants
    await db.update(participants).set({ groupName: updated.name }).where(eq(participants.groupId, id));
    res.json({ group: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    await db.update(participants).set({ groupId: null, groupName: null }).where(eq(participants.groupId, id));
    const [deleted] = await db.delete(participantGroups).where(eq(participantGroups.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

// ─── Schedule publish ────────────────────────────────────────

export const publishScheduleDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const dayNumber = Number(req.body.dayNumber ?? req.params.dayNumber);
  if (!dayNumber) { res.status(400).json({ error: 'dayNumber required' }); return; }
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);

  const dayEvents = await db.select().from(events).where(and(
    eq(events.dayNumber, dayNumber),
    eq(events.shiftId, shiftId),
  ));
  const versions = await db.select().from(scheduleDayVersions)
    .where(eq(scheduleDayVersions.dayNumber, dayNumber))
    .orderBy(desc(scheduleDayVersions.version));
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  const [snap] = await db.insert(scheduleDayVersions).values({
    dayNumber,
    version: nextVersion,
    eventsSnapshot: dayEvents,
    publishedByAdminId: req.adminId ?? null,
  }).returning();

  const [existingDay] = await db.select().from(scheduleDays).where(and(
    eq(scheduleDays.dayNumber, dayNumber),
    eq(scheduleDays.shiftId, shiftId),
  )).limit(1);
  if (existingDay) {
    await db.update(scheduleDays).set({ isPublished: true, publishedAt: new Date() })
      .where(eq(scheduleDays.id, existingDay.id));
  } else {
    await db.insert(scheduleDays).values({ dayNumber, shiftId, isPublished: true, publishedAt: new Date() });
  }

  await db.update(events).set({ dayPublished: true, isPublished: true })
    .where(and(eq(events.dayNumber, dayNumber), eq(events.shiftId, shiftId)));

  // Publishing a newer day advances "current day for participants" so Home
  // schedule («Далее») and Program open on that day without a second click.
  const { getShiftById, updateShift } = await import('../services/shiftService.js');
  const shift = await getShiftById(shiftId);
  let advancedCurrentDay: number | null = null;
  if (shift && dayNumber > (shift.currentDay ?? 1)) {
    await updateShift(shiftId, { currentDay: dayNumber });
    advancedCurrentDay = dayNumber;
  }

  const { clearCache } = await import('../services/cache.js');
  clearCache(`events_day_${shiftId}_${dayNumber}`);
  clearCache('forumSettings');

  await logAdminAction({
    req, actionType: 'schedule_publish', section: 'events', objectId: dayNumber,
    newValue: {
      version: nextVersion,
      events: dayEvents.length,
      currentDayAdvancedTo: advancedCurrentDay,
    },
    isCritical: true,
  });

  res.json({
    ok: true,
    version: snap,
    eventsCount: dayEvents.length,
    currentDay: advancedCurrentDay ?? shift?.currentDay ?? dayNumber,
  });
};

export const listScheduleVersions = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = req.query.day ? Number(req.query.day) : null;
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  let rows = await db.select().from(scheduleDayVersions).orderBy(desc(scheduleDayVersions.publishedAt));
  if (day) rows = rows.filter(r => r.dayNumber === day);
  const days = await db.select().from(scheduleDays)
    .where(eq(scheduleDays.shiftId, shiftId))
    .orderBy(asc(scheduleDays.dayNumber));
  res.json({ versions: rows.slice(0, 20), days });
};

export const crudScheduleDays = {
  list: async (req: AdminRequest, res: Response) => {
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const days = await db.select().from(scheduleDays)
      .where(eq(scheduleDays.shiftId, shiftId))
      .orderBy(asc(scheduleDays.dayNumber));
    res.json({ days });
  },
  create: async (req: AdminRequest, res: Response) => {
    const dayNumber = Number(req.body.dayNumber);
    if (!dayNumber) { res.status(400).json({ error: 'dayNumber required' }); return; }
    const { resolveAdminShiftId, updateShift } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const [existing] = await db.select().from(scheduleDays).where(and(
      eq(scheduleDays.dayNumber, dayNumber),
      eq(scheduleDays.shiftId, shiftId),
    )).limit(1);
    if (existing) { res.status(400).json({ error: 'Day already exists' }); return; }
    const calendarDate = req.body.calendarDate ? new Date(req.body.calendarDate) : null;
    const [day] = await db.insert(scheduleDays).values({
      dayNumber,
      shiftId,
      displayLabel: req.body.displayLabel ? String(req.body.displayLabel) : `День ${dayNumber}`,
      shiftNumber: req.body.shiftNumber != null ? Number(req.body.shiftNumber) : null,
      calendarDate,
      isPublished: false,
    }).returning();
    const settings = await getForumSettings();
    if (dayNumber > (settings.totalDays ?? 8)) {
      await updateShift(shiftId, { totalDays: dayNumber });
    }
    res.json({ day });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const patch: Partial<typeof scheduleDays.$inferInsert> = {};
    if (req.body.displayLabel != null) patch.displayLabel = String(req.body.displayLabel);
    if (req.body.shiftNumber != null) patch.shiftNumber = Number(req.body.shiftNumber);
    if (req.body.calendarDate != null) patch.calendarDate = new Date(req.body.calendarDate);
    const [updated] = await db.update(scheduleDays).set(patch).where(eq(scheduleDays.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ day: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const force = req.query.force === '1' || req.query.force === 'true';
    const { resolveAdminShiftId, updateShift } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const [day] = await db.select().from(scheduleDays).where(and(
      eq(scheduleDays.id, id),
      eq(scheduleDays.shiftId, shiftId),
    )).limit(1);
    if (!day) { res.status(404).json({ error: 'Not found' }); return; }

    const eventRows = await db.select({ id: events.id }).from(events).where(and(
      eq(events.dayNumber, day.dayNumber),
      eq(events.shiftId, shiftId),
    ));
    if (eventRows.length > 0 && !force) {
      res.status(409).json({
        error: 'Day has events',
        eventCount: eventRows.length,
        hint: 'Add ?force=1 to delete day and all its events',
      });
      return;
    }

    if (force && eventRows.length > 0) {
      const eventIds = eventRows.map(e => e.id);
      await db.delete(eventAttendance).where(inArray(eventAttendance.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }

    await db.delete(scheduleDays).where(eq(scheduleDays.id, id));

    const remaining = await db.select({ dayNumber: scheduleDays.dayNumber })
      .from(scheduleDays)
      .where(eq(scheduleDays.shiftId, shiftId))
      .orderBy(asc(scheduleDays.dayNumber));
    const maxDay = remaining.length ? Math.max(...remaining.map(d => d.dayNumber)) : 0;
    const settings = await getForumSettings();
    if ((settings.totalDays ?? 8) > maxDay && maxDay > 0) {
      await updateShift(shiftId, { totalDays: maxDay });
    }

    await logAdminAction({
      req,
      actionType: 'schedule_day_delete',
      section: 'program',
      objectId: id,
      comment: JSON.stringify({ dayNumber: day.dayNumber, force, eventsRemoved: eventRows.length }),
      isCritical: force && eventRows.length > 0,
    });

    res.json({ ok: true, dayNumber: day.dayNumber, eventsRemoved: force ? eventRows.length : 0 });
  },
};

export const draftScheduleDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const dayNumber = Number(req.body.dayNumber);
  if (!dayNumber) { res.status(400).json({ error: 'dayNumber required' }); return; }
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  // Hide day from participants; keep event drafts ready for re-publish
  await db.update(events).set({ dayPublished: false })
    .where(and(eq(events.dayNumber, dayNumber), eq(events.shiftId, shiftId)));
  await db.update(scheduleDays).set({ isPublished: false })
    .where(and(eq(scheduleDays.dayNumber, dayNumber), eq(scheduleDays.shiftId, shiftId)));
  const { clearCache } = await import('../services/cache.js');
  clearCache(`events_day_${shiftId}_${dayNumber}`);
  await logAdminAction({
    req, actionType: 'schedule_draft', section: 'events', objectId: dayNumber,
    newValue: { shiftId }, isCritical: true,
  });
  res.json({ ok: true });
};

export const getParticipantActivity = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }

  const [ans, subs, pts, att, pig] = await Promise.all([
    db.select({ a: answers, q: questions }).from(answers)
      .leftJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(answers.participantId, id)).orderBy(desc(answers.createdAt)).limit(40),
    db.select({ s: taskSubmissions, t: tasks }).from(taskSubmissions)
      .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(eq(taskSubmissions.participantId, id)).orderBy(desc(taskSubmissions.submittedAt)).limit(40),
    db.select().from(pointsLog).where(eq(pointsLog.participantId, id)).orderBy(desc(pointsLog.createdAt)).limit(40),
    db.select({ a: eventAttendance, e: events }).from(eventAttendance)
      .leftJoin(events, eq(eventAttendance.eventId, events.id))
      .where(eq(eventAttendance.participantId, id)).orderBy(desc(eventAttendance.createdAt)).limit(40),
    db.select().from(piggybank).where(and(
      eq(piggybank.participantId, id),
      isNull(piggybank.deletedAt),
    )).orderBy(desc(piggybank.createdAt)).limit(40),
  ]);

  type Item = { at: Date | null; kind: string; title: string; detail?: string };
  const items: Item[] = [];
  for (const r of ans) {
    items.push({
      at: r.a.createdAt,
      kind: 'answer',
      title: r.q?.title || 'Ответ',
      detail: typeof r.a.answerData === 'string' ? r.a.answerData : JSON.stringify(r.a.answerData),
    });
  }
  for (const r of subs) {
    items.push({
      at: r.s.submittedAt,
      kind: 'task',
      title: r.t?.title || 'Задание',
      detail: r.s.status ?? undefined,
    });
  }
  for (const pl of pts) {
    items.push({
      at: pl.createdAt,
      kind: 'points',
      title: pl.actionType || 'Баллы',
      detail: `${pl.points > 0 ? '+' : ''}${pl.points}`,
    });
  }
  for (const r of att) {
    items.push({
      at: r.a.createdAt,
      kind: 'attendance',
      title: r.e?.title || 'Посещение',
    });
  }
  for (const pg of pig) {
    items.push({
      at: pg.createdAt,
      kind: 'piggybank',
      title: 'Копилка',
      detail: pg.text?.slice(0, 120),
    });
  }
  items.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));

  res.json({ items: items.slice(0, 100) });
};

export const getParticipantAdminActions = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const sid = String(id);

  const subs = await db.select({ id: taskSubmissions.id })
    .from(taskSubmissions)
    .where(eq(taskSubmissions.participantId, id));
  const subIds = subs.map(s => String(s.id));

  const conditions = [
    eq(adminActionsLog.objectId, sid),
    sql`${adminActionsLog.newValue}->>'participantId' = ${sid}`,
  ];
  if (subIds.length) {
    conditions.push(inArray(adminActionsLog.objectId, subIds));
  }

  const rows = await db.select().from(adminActionsLog)
    .where(or(...conditions))
    .orderBy(desc(adminActionsLog.createdAt))
    .limit(150);
  res.json({ actions: rows });
};

// ─── Push templates + queue ───────────────────────────────────

export const crudPushTemplates = {
  list: async (req: AdminRequest, res: Response) => {
    const kind = req.query.kind as string | undefined;
    let q = db.select().from(pushTemplates).orderBy(asc(pushTemplates.key));
    if (kind === 'preset') {
      q = q.where(eq(pushTemplates.kind, 'preset')) as typeof q;
    } else if (kind === 'auto_slot') {
      q = q.where(eq(pushTemplates.kind, 'auto_slot')) as typeof q;
    }
    res.json({ templates: await q });
  },
  create: async (req: AdminRequest, res: Response) => {
    const {
      key, title, body, slotKey, isActive, kind, presetCategory, pushTitle, icon, notificationType,
    } = req.body;
    if (!key || !body) { res.status(400).json({ error: 'key and body required' }); return; }
    const [t] = await db.insert(pushTemplates).values({
      key,
      title,
      body,
      slotKey,
      isActive: isActive !== false,
      kind: kind ?? (slotKey ? 'auto_slot' : 'preset'),
      presetCategory,
      pushTitle,
      icon,
      notificationType,
    }).returning();
    res.json({ template: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const allowed = [
      'title', 'body', 'slotKey', 'isActive', 'kind', 'presetCategory',
      'pushTitle', 'icon', 'notificationType',
    ];
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    const [updated] = await db.update(pushTemplates)
      .set(patch)
      .where(eq(pushTemplates.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ template: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(pushTemplates).where(eq(pushTemplates.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const enqueuePush = async (req: AdminRequest, res: Response): Promise<void> => {
  const { text, templateId, scheduledAt, target, participantIds } = req.body;
  let body = text;
  if (templateId) {
    const [t] = await db.select().from(pushTemplates).where(eq(pushTemplates.id, Number(templateId))).limit(1);
    if (t) body = t.body;
  }
  if (!body?.trim()) { res.status(400).json({ error: 'text or templateId required' }); return; }
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  const [row] = await db.insert(pushQueue).values({
    templateId: templateId ? Number(templateId) : null,
    text: body.trim(),
    scheduledAt: when,
    status: 'pending',
    target: target || 'all',
    participantIds: participantIds || null,
    createdByAdminId: req.adminId ?? null,
  }).returning();
  res.json({ item: row });
};

export const listPushQueue = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ queue: await db.select().from(pushQueue).orderBy(desc(pushQueue.createdAt)).limit(100) });
};

// ─── Day export XLSX / multi-CSV ─────────────────────────────

function toCsvSection(name: string, header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [
    `### SHEET: ${name}`,
    header.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
    '',
  ].join('\n');
}

function filterAnswersByType(
  rows: { q: typeof questions.$inferSelect | null }[],
  type: string | null,
) {
  if (!type || type === 'all') return rows;
  return rows.filter(r => {
    const block = (r.q?.block || '').toLowerCase();
    const t = (r.q?.type || '').toLowerCase();
    const title = (r.q?.title || '').toLowerCase();
    if (type === 'checkin' || type === 'проверка') {
      return block.includes('проверка') || t === 'checkin';
    }
    if (type === 'direction' || type === 'направление') {
      return block.includes('направлен') || (block.includes('осмыслен') && !title.includes('урока'));
    }
    if (type === 'lessons' || type === 'уроки') {
      return title.includes('урока') || block.includes('урок');
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

export const exportDayWorkbook = async (req: AdminRequest, res: Response): Promise<void> => {
  const { writeDayWorkbook } = await import('../services/exports/dayExport.js');
  const day = Number(req.query.day) || 1;
  const type = req.query.type as string | undefined;
  await writeDayWorkbook(res, day, type);
};

export const getParticipantCard = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const answerBlock = typeof req.query.answerBlock === 'string' ? req.query.answerBlock : undefined;
  const answerDayRaw = req.query.answerDay;
  const answerDay = answerDayRaw != null && answerDayRaw !== '' ? Number(answerDayRaw) : undefined;

  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const [userAnswers, userSubs, userPoints, userMedalsRows, dayStates, userPiggy, allPointsRows, allActiveMedals] = await Promise.all([
    db.select({ a: answers, q: questions })
      .from(answers)
      .leftJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(answers.participantId, id))
      .orderBy(desc(answers.createdAt))
      .limit(200),
    db.select({ s: taskSubmissions, t: tasks })
      .from(taskSubmissions)
      .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(eq(taskSubmissions.participantId, id)),
    db.select().from(pointsLog).where(eq(pointsLog.participantId, id)).orderBy(desc(pointsLog.createdAt)).limit(50),
    db.select({ um: userMedals, m: medals })
      .from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(eq(userMedals.participantId, id)),
    db.select().from(participantDayState).where(eq(participantDayState.participantId, id)),
    db.select().from(piggybank).where(and(
      eq(piggybank.participantId, id),
      isNull(piggybank.deletedAt),
    )).orderBy(desc(piggybank.createdAt)).limit(100),
    db.select({
      forumDay: pointsLog.forumDay,
      points: pointsLog.points,
      revokedAt: pointsLog.revokedAt,
    }).from(pointsLog).where(eq(pointsLog.participantId, id)),
    db.select().from(medals).where(eq(medals.isActive, true)).orderBy(asc(medals.name)),
  ]);

  const filteredAnswers = userAnswers.filter(r => {
    if (answerBlock && (r.q?.block || '') !== answerBlock) return false;
    if (answerDay != null && !Number.isNaN(answerDay) && r.q?.dayNumber !== answerDay) return false;
    return true;
  });

  const byDay: Record<string, number> = {};
  for (const row of allPointsRows) {
    if (row.revokedAt) continue;
    const key = String(row.forumDay ?? 0);
    byDay[key] = (byDay[key] || 0) + (row.points ?? 0);
  }
  const pointsSummary = {
    path: p.pathPoints ?? 0,
    experience: p.experiencePoints ?? 0,
    bonus: p.bonusPoints ?? 0,
    total: (p.pathPoints ?? 0) + (p.experiencePoints ?? 0) + (p.bonusPoints ?? 0),
    byDay,
  };

  const earnedMap = new Map(userMedalsRows.map(r => [r.um.medalId, r.um.awardedAt]));
  const medalProgress = await Promise.all(allActiveMedals.map(async m => {
    const earned = earnedMap.has(m.id);
    const base = {
      id: m.id,
      name: m.name,
      level: m.level,
      earned,
      awardedAt: earnedMap.get(m.id) ?? null,
    };
    if (earned || m.awardType !== 'auto' || m.visibility !== 'open') {
      return base;
    }
    const parsed = parseMedalRule(m.conditionRule);
    if (!parsed) return base;
    const prog = await getMedalRuleProgress(id, parsed);
    return {
      ...base,
      current: prog.current,
      target: prog.target,
      conditionLabel: prog.conditionLabel,
    };
  }));

  const subIds = userSubs.map(r => r.s.id);
  const confRows = subIds.length > 0
    ? await db.select().from(taskTeamConfirmations).where(inArray(taskTeamConfirmations.submissionId, subIds))
    : [];
  const confBySub = new Map<number, typeof confRows>();
  for (const c of confRows) {
    if (!confBySub.has(c.submissionId)) confBySub.set(c.submissionId, []);
    confBySub.get(c.submissionId)!.push(c);
  }

  const avatarUrl = await resolveParticipantAvatarUrl(p, { preferVkPhoto: true });

  res.json({
    participant: { ...p, avatarUrl },
    avatarUrl,
    answers: filteredAnswers.map(r => ({
      id: r.a.id,
      questionTitle: r.q?.title,
      block: r.q?.block,
      reflectionKind: r.q?.reflectionKind,
      dayNumber: r.q?.dayNumber,
      answerData: r.a.answerData,
      createdAt: r.a.createdAt,
    })),
    submissions: userSubs.map(r => ({
      id: r.s.id,
      taskId: r.s.taskId,
      taskTitle: r.t?.title,
      status: r.s.status,
      answerText: r.s.answerText,
      pointsAwarded: r.s.pointsAwarded,
      photoUrl: r.s.photoUrl,
      postUrl: r.s.postUrl,
      teamMemberIds: r.s.teamMemberIds,
      moderatorComment: r.s.moderatorComment,
      teamConfirmations: (confBySub.get(r.s.id) || []).map(c => ({
        participantId: c.participantId,
        status: c.status,
        respondedAt: c.respondedAt,
      })),
      createdAt: r.s.submittedAt,
    })),
    points: userPoints.map(pl => ({
      ...pl,
      canRevoke: !pl.revokedAt && pl.points > 0 && !(pl.actionType || '').endsWith('_revoke'),
    })),
    piggybank: userPiggy,
    medals: userMedalsRows.map(r => ({
      id: r.um.id,
      medalId: r.um.medalId,
      name: r.m?.name,
      level: r.m?.level,
      awardedAt: r.um.awardedAt,
    })),
    medalProgress,
    pointsSummary,
    dayStates,
  });
};

// ─── Real PDF ────────────────────────────────────────────────

export const buildParticipantPdf = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { pdfWhitelist } = await import('../db/schema.js');
  const [wl] = await db.select().from(pdfWhitelist).where(eq(pdfWhitelist.participantId, id)).limit(1);
  if (!wl?.enabled) {
    res.status(403).json({ error: 'Participant not on PDF whitelist' });
    return;
  }
  const { gatherProfileBundle, streamProfilePdf } = await import('../services/profilePdfBuilder.js');
  const bundle = await gatherProfileBundle(id);
  if (!bundle) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const blocks = (bundle.pdf.draftBlocks ?? {}) as Record<string, unknown>;
  try {
    await streamProfilePdf(bundle, res, blocks);
  } catch {
    res.status(500).json({ error: 'PDF generation failed' });
  }
};

// ─── QR download helper ──────────────────────────────────────

export const revokeParticipantPoints = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.id);
  const logId = Number(req.params.logId);
  const reason = String(req.body?.reason || 'Аннулировано модератором').slice(0, 500);
  const { revokePointsLogEntry } = await import('../services/pointsService.js');
  const { sendPushNotification } = await import('../services/pushService.js');
  const result = await revokePointsLogEntry(logId, participantId, reason);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const { pushCopy } = await import('../services/pushCopy.js');
  await sendPushNotification(
    [participantId],
    pushCopy.pointsRevoked(reason),
    `points_revoke_${logId}`,
  );
  await logAdminAction({
    req,
    actionType: 'points_revoke',
    section: 'participants',
    objectId: String(logId),
    newValue: { participantId, logId, reason },
    isCritical: true,
  });
  res.json({ ok: true, reversalId: result.reversalId });
};

export const revokeSuspiciousParticipantPoints = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.id);
  const reason = String(req.body?.reason || 'Подозрительные начисления аннулированы').trim().slice(0, 500);
  if (!reason) {
    res.status(400).json({ error: 'reason required' });
    return;
  }
  const forumDay = req.body?.forumDay != null ? Number(req.body.forumDay) : undefined;
  const actionTypeFilter = req.body?.actionType ? String(req.body.actionType) : undefined;
  const notify = req.body?.notify !== false;

  const conditions = [
    eq(pointsLog.participantId, participantId),
    isNull(pointsLog.revokedAt),
  ];
  if (forumDay != null && Number.isFinite(forumDay)) {
    conditions.push(eq(pointsLog.forumDay, forumDay));
  }
  if (actionTypeFilter) {
    conditions.push(eq(pointsLog.actionType, actionTypeFilter));
  }

  const rows = await db.select().from(pointsLog).where(and(...conditions));
  const toRevoke = rows.filter(r => (r.points ?? 0) > 0 && !(r.actionType || '').endsWith('_revoke'));
  if (toRevoke.length === 0) {
    res.status(400).json({ error: 'No matching accruals to revoke' });
    return;
  }

  const { revokePointsLogEntry } = await import('../services/pointsService.js');
  const { sendPushNotification } = await import('../services/pushService.js');
  let revoked = 0;
  for (const row of toRevoke) {
    const result = await revokePointsLogEntry(row.id, participantId, reason);
    if (result.ok) revoked += 1;
  }

  if (notify && revoked > 0) {
    const { pushCopy } = await import('../services/pushCopy.js');
    await sendPushNotification(
      [participantId],
      pushCopy.pointsBulkRevoked(revoked, reason),
      `points_bulk_revoke_${participantId}_${Date.now()}`,
    );
  }

  await logAdminAction({
    req,
    actionType: 'points_bulk_revoke',
    section: 'participants',
    objectId: String(participantId),
    newValue: { participantId, forumDay, actionTypeFilter, revoked, reason, notify },
    isCritical: true,
  });

  res.json({ ok: true, revoked, totalMatched: toRevoke.length });
};

export const getQrPack = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Number(req.query.day) || 1;
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  const base = resolveParticipantAppBase();
  const dayTasks = await db.select().from(tasks).where(and(
    eq(tasks.shiftId, shiftId),
    eq(tasks.dayNumber, day),
    eq(tasks.status, 'published'),
    or(
      sql`${tasks.confirmationMethods} @> ${JSON.stringify(['qr'])}::jsonb`,
      eq(tasks.confirmationType, 'qr'),
    ),
  ));

  const items: { title: string; url: string; qrImageUrl: string; displayCode: string }[] = [];
  for (const t of dayTasks) {
    const methods = taskMethodsForParticipant(t);
    if (!methods.includes('qr') && t.confirmationType !== 'qr') continue;
    let token = t.qrToken;
    // Prefer short codes for print packs (legacy 32-hex still works until regenerated)
    if (!token || /^[a-f0-9]{32}$/i.test(token)) {
      token = await allocateTaskQrCode();
      await db.update(tasks).set({ qrToken: token }).where(eq(tasks.id, t.id));
    }
    const url = buildTaskQrUrl(base, t.id, token);
    items.push({
      title: t.title,
      url,
      displayCode: formatTaskQrDisplayCode(token),
      qrImageUrl: await buildQrDataUrl(url, 200),
    });
  }

  if (items.length === 0) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR День ${day}</title>
<style>body{font-family:-apple-system,sans-serif;padding:24px;background:#E8E2D8;color:#1A1714;}
.box{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08);}</style></head>
<body><div class="box"><h1>QR задания · День ${day}</h1>
<p>Нет опубликованных QR-заданий на этот день. Проверьте вкладку «Задания»: тип подтверждения QR и статус «Опубликовано».</p></div></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    return;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR День ${day}</title>
<style>body{font-family:-apple-system,sans-serif;padding:24px;background:#E8E2D8;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:20px;}
.cell{background:#fff;border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08);}
.cell img{width:160px;height:160px;display:block;margin:0 auto 8px;} h1{font-size:18px;color:#1A1714;}
.cell-title{font-size:12px;font-weight:700;line-height:1.35;word-break:break-word;}
.cell-code{font-size:18px;font-weight:800;letter-spacing:.06em;margin-top:8px;color:#1A1714;}
.cell-hint{font-size:10px;color:#666;margin-top:4px;}</style></head>
<body><h1>QR задания · День ${day}</h1>
<p style="font-size:13px;color:#444;max-width:640px;">Отсканируйте камерой телефона. Не сканируется? Введите код в разделе «Задания».</p>
<div class="grid">${items.map(i =>
    `<div class="cell"><img src="${i.qrImageUrl}" alt="QR ${i.title.replace(/"/g, '')}"/><div class="cell-title">${i.title.replace(/</g, '')}</div><div class="cell-code">${i.displayCode.replace(/</g, '')}</div><div class="cell-hint">Не сканируется? Введи код в «Задания»</div></div>`,
  ).join('')}</div><script>window.onload=()=>window.print()</script></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

export const generateAndDownloadQr = async (req: AdminRequest, res: Response): Promise<void> => {
  const { type, id } = req.body as { type: 'task' | 'event' | 'participant'; id: number };
  const base = resolveParticipantAppBase();
  let url = '';
  let token = '';
  let displayCode: string | undefined;
  if (type === 'task') {
    token = await allocateTaskQrCode();
    await db.update(tasks).set({ qrToken: token }).where(eq(tasks.id, id));
    url = buildTaskQrUrl(base, id, token);
    displayCode = formatTaskQrDisplayCode(token);
  } else if (type === 'event') {
    token = generateQrToken();
    await db.update(events).set({ qrToken: token }).where(eq(events.id, id));
    url = buildEventQrUrl(base, id, token);
  } else if (type === 'participant') {
    token = generateQrToken();
    await db.update(participants).set({ qrToken: token }).where(eq(participants.id, id));
    url = buildParticipantQrUrl(base, id, token);
  } else {
    res.status(400).json({ error: 'type must be task|event|participant' });
    return;
  }
  const qrImageUrl = await buildQrDataUrl(url, 300);
  res.json({
    token,
    displayCode,
    url,
    downloadHint: 'QR встроен в data URL — можно сохранить картинку или распечатать.',
    qrImageUrl,
  });
};

// ─── Expanded analytics dashboards ───────────────────────────

export const getExpandedDashboards = async (req: AdminRequest, res: Response): Promise<void> => {
  const mode = (req.query.mode as string) || 'today';
  const day = req.query.day ? Number(req.query.day) : null;

  const allP = await db.select().from(participants);
  const registered = allP.filter(p => p.onboardingCompletedAt).length;
  const roleDist: Record<string, number> = {};
  const directionDist: Record<string, number> = {};
  const groupDist: Record<string, number> = {};
  for (const p of allP) {
    const k = p.pedagogicalRole || 'none';
    roleDist[k] = (roleDist[k] || 0) + 1;
    const d = p.direction || '—';
    directionDist[d] = (directionDist[d] || 0) + 1;
    const g = p.groupName || 'без группы';
    groupDist[g] = (groupDist[g] || 0) + 1;
  }

  const ans = await db.select().from(answers);
  const { isPublishedStatus } = await import('../services/publishStatus.js');
  const depths: Record<string, number> = {};
  const energySeries: { day: number; avg: number; n: number }[] = [];
  const dayQsAll = await db.select().from(questions);
  const dayQs = dayQsAll.filter(q => isPublishedStatus(q.status));
  const publishedQuestionIds = new Set(dayQs.map(q => q.id));
  for (const a of ans) {
    if (!publishedQuestionIds.has(a.questionId)) continue;
    const text = typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData || '');
    const d = inferReflectionDepth(text) || '—';
    depths[d] = (depths[d] || 0) + 1;
  }

  for (let d = 1; d <= 8; d++) {
    const qIds = new Set(dayQs.filter(q => q.dayNumber === d).map(q => q.id));
    const dayAns = ans.filter(a => qIds.has(a.questionId));
    let sum = 0; let n = 0;
    for (const a of dayAns) {
      const data = a.answerData as { energy?: number } | null;
      if (data && typeof data === 'object' && typeof data.energy === 'number') {
        sum += data.energy;
        n += 1;
      }
    }
    energySeries.push({ day: d, avg: n ? Math.round((sum / n) * 10) / 10 : 0, n });
  }

  const pig = await db.select().from(piggybank);
  const pigTags: Record<string, number> = {};
  for (const e of pig) {
    const t = e.tag || 'прочее';
    pigTags[t] = (pigTags[t] || 0) + 1;
  }

  const approvedTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.status, 'approved'));
  const pendingModeration = await db.select().from(taskSubmissions).where(eq(taskSubmissions.status, 'pending'));
  const pendingTeam = await db.select().from(taskSubmissions).where(eq(taskSubmissions.status, 'pending_team'));
  const revokedPointsRows = await db.select().from(pointsLog).where(isNotNull(pointsLog.revokedAt));
  const programEvents = await db.select().from(events);
  const allMats = await db.select().from(materials);
  const { published: matsInAnalytics, excludedCount: materialsExcludedFromAnalytics } = (await import('../services/publishStatus.js')).materialCountsForAnalytics(allMats);
  const attendance = await db.select().from(eventAttendance);
  const dayStates = await db.select().from(participantDayState);

  const SCALE_LABELS: Record<string, string> = {
    direction: 'Направление',
    lessonsImportant: 'Уроки о важном',
    openLessons: 'Открытые уроки',
    morningHealth: 'Утренняя программа',
    workshops: 'Мастер-классы',
    eveningAtmosphere: 'Вечерняя программа',
    food: 'Питание',
    housing: 'Проживание',
    curator: 'Куратор',
  };

  const scaleSums: Record<string, { sum: number; n: number }> = {};
  for (const key of EVENING_SCALE_KEYS) scaleSums[key] = { sum: 0, n: 0 };
  for (const st of dayStates) {
    const ratings = st.eveningRatings as Record<string, unknown> | null;
    if (!ratings || typeof ratings !== 'object') continue;
    for (const key of EVENING_SCALE_KEYS) {
      const v = ratings[key];
      if (typeof v === 'number' && v >= 1 && v <= 5) {
        scaleSums[key].sum += v;
        scaleSums[key].n += 1;
      }
    }
  }
  const scaleAverages = EVENING_SCALE_KEYS.map(key => ({
    key,
    label: SCALE_LABELS[key] || key,
    avg: scaleSums[key].n ? Math.round((scaleSums[key].sum / scaleSums[key].n) * 10) / 10 : 0,
    responses: scaleSums[key].n,
  }));

  const attendanceByEvent = new Map<number, number>();
  for (const a of attendance) {
    attendanceByEvent.set(a.eventId, (attendanceByEvent.get(a.eventId) || 0) + 1);
  }

  const eventsByAttendance = programEvents
    .map(e => {
      const tags = Array.isArray(e.tags) ? (e.tags as string[]) : [];
      return {
        id: e.id,
        title: e.title,
        dayNumber: e.dayNumber,
        timeSlot: e.timeSlot,
        tags,
        attendance: attendanceByEvent.get(e.id) || 0,
      };
    })
    .sort((a, b) => b.attendance - a.attendance);

  const byTag: Record<string, { events: number; attendance: number }> = {};
  for (const e of eventsByAttendance) {
    const tagList = e.tags.length > 0 ? e.tags : ['без тега'];
    for (const tag of tagList) {
      if (!byTag[tag]) byTag[tag] = { events: 0, attendance: 0 };
      byTag[tag].events += 1;
      byTag[tag].attendance += e.attendance;
    }
  }
  const tagSeries = Object.entries(byTag)
    .map(([tag, v]) => ({ tag, events: v.events, attendance: v.attendance }))
    .sort((a, b) => b.attendance - a.attendance)
    .slice(0, 12);

  const byDaySlot: { day: number; slot: string; events: number; attendance: number }[] = [];
  for (let d = 1; d <= 8; d++) {
    const dayEv = eventsByAttendance.filter(e => e.dayNumber === d);
    const slots = [...new Set(dayEv.map(e => e.timeSlot || 'другое'))];
    for (const slot of slots) {
      const slotted = dayEv.filter(e => (e.timeSlot || 'другое') === slot);
      byDaySlot.push({
        day: d,
        slot,
        events: slotted.length,
        attendance: slotted.reduce((s, e) => s + e.attendance, 0),
      });
    }
  }

  const sampleTexts = ans
    .map(a => (typeof a.answerData === 'string' ? a.answerData : (a.answerData as { text?: string })?.text || ''))
    .filter(t => typeof t === 'string' && t.trim().length > 20)
    .slice(0, 30) as string[];

  const { synthesizeSemanticLayers } = await import('../services/gigachatService.js');
  const semantic = await synthesizeSemanticLayers({ depths, sampleTexts, day });

  const forumSettingsResolved = await getForumSettings();
  const kbThreshold = forumSettingsResolved.kbUnlockThreshold ?? 4;
  const kbDisabled = forumSettingsResolved.kbUnlockDisabled === true;
  const schedulePublishCount = (await db.select().from(scheduleDayVersions)).length;
  let kbUnlockedParticipants = 0;
  if (!kbDisabled) {
    const onboarded = allP.filter(p => p.onboardingCompletedAt);
    const { evaluateKbDayAccess } = await import('./programController.js');
    for (const p of onboarded) {
      const d = day ?? forumSettingsResolved.currentDay ?? 1;
      const access = await evaluateKbDayAccess(p.id, d, forumSettingsResolved);
      if (access.unlocked) kbUnlockedParticipants += 1;
    }
  } else {
    kbUnlockedParticipants = allP.filter(p => p.onboardingCompletedAt).length;
  }

  const eveningDrafts = dayStates.filter(s => s.eveningDraft && !s.eveningRatings).length;
  const eveningCompletedForDay = dayStates.filter(s => s.eveningRatings && s.dayNumber === day).length;
  const allDaily = await db.select().from(dailyStats);
  const emotionZonesRow = allDaily.find(s => s.direction === 'all')?.emotionZonesDistribution;
  const emotionZones = (emotionZonesRow as Record<string, number> | null | undefined)
    ?? emptyZoneDistribution();

  res.json({
    mode,
    day,
    pulse: {
      registered,
      totalAnswers: ans.length,
      energySeries,
      completionByDay: energySeries.map(e => ({
        day: e.day,
        answers: ans.filter(a => dayQs.some(q => q.id === a.questionId && q.dayNumber === e.day)).length,
      })),
    },
    portrait: {
      roleDistribution: roleDist,
      directionDistribution: directionDist,
      groupDistribution: groupDist,
    },
    program: {
      eventsCount: programEvents.length,
      publishedDays: (await db.select().from(scheduleDays).where(eq(scheduleDays.isPublished, true))).length,
      schedulePublishEvents: schedulePublishCount,
      kbUnlockThreshold: kbThreshold,
      kbUnlockDisabled: kbDisabled,
      kbUnlockedParticipants,
      kbEligibleParticipants: allP.filter(p => p.onboardingCompletedAt).length,
      materialsCount: matsInAnalytics.length,
      materialsExcludedFromAnalytics,
      totalAttendance: attendance.length,
      scaleAverages,
      topEvents: eventsByAttendance.slice(0, 10),
      tagSeries,
      byDaySlot,
    },
    education: {
      scaleAverages,
      topEvents: eventsByAttendance.slice(0, 10),
      tagSeries,
      byDaySlot,
      totalAttendance: attendance.length,
    },
    activity: {
      pathLeaders: allP
        .map(p => ({ name: `${p.firstName} ${p.lastName}`, path: p.pathPoints, exp: p.experiencePoints }))
        .sort((a, b) => (b.path ?? 0) - (a.path ?? 0))
        .slice(0, 10),
      tasksApproved: approvedTasks.length,
      tasksPendingModeration: pendingModeration.length,
      teamPendingConfirm: pendingTeam.length,
      pointsRevokedTotal: revokedPointsRows.length,
      eveningDrafts,
      eveningCompletedForDay,
      emotionZones,
      reflectionDepth: depths,
    },
    piggybank: {
      total: pig.length,
      byTag: pigTags,
      series: Object.entries(pigTags).map(([tag, value]) => ({ tag, value })),
    },
    semantic: {
      layers: semantic.layers,
      summary: semantic.summary,
      source: semantic.source,
    },
  });
};

// ─── Club matching + medals eval ─────────────────────────────

export const getDeparturePortrait = async (_req: AdminRequest, res: Response): Promise<void> => {
  const allP = await db.select().from(participants).where(isNotNull(participants.onboardingCompletedAt));
  const rows = allP.map(p => {
    const goal = p.goalAnswers;
    const pointB = p.pointBAnswers;
    const hasA = !!(goal && (Array.isArray(goal) ? goal.length : Object.keys(goal as object).length));
    const hasB = !!(pointB && (Array.isArray(pointB) ? pointB.length : Object.keys(pointB as object).length));
    return {
      id: p.id,
      name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
      direction: p.direction,
      groupName: p.groupName,
      pointA: goal,
      pointB: pointB,
      strongRole: p.strongRole,
      growthRole: p.growthRole,
      hasPointA: hasA,
      hasPointB: hasB,
    };
  });
  res.json({ participants: rows, completedBoth: rows.filter(r => r.hasPointA && r.hasPointB).length });
};

export const runClubMatching = async (req: AdminRequest, res: Response): Promise<void> => {
  const result = await clubMatchNightly();
  await logAdminAction({
    req, actionType: 'club_match', section: 'ai', newValue: result, isCritical: false,
  });
  res.json(result);
};

export const runMedalEvaluation = async (req: AdminRequest, res: Response): Promise<void> => {
  const result = await evaluateAllMedals();
  await logAdminAction({
    req, actionType: 'medal_eval', section: 'medals', newValue: result,
  });
  res.json(result);
};

export const listClubMatches = async (_req: AdminRequest, res: Response): Promise<void> => {
  res.json({ matches: await db.select().from(clubMatches).orderBy(desc(clubMatches.createdAt)).limit(200) });
};

export const adminCompleteParticipantTaskHandler = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const comment = typeof req.body?.comment === 'string' ? req.body.comment : undefined;
  const { adminCompleteParticipantTask } = await import('../services/adminManualTaskService.js');
  const result = await adminCompleteParticipantTask(participantId, taskId, comment);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  await logAdminAction({
    req,
    actionType: 'admin_manual_task',
    section: 'participants',
    objectId: String(result.submission.id),
    newValue: { participantId, taskId, submissionId: result.submission.id },
    isCritical: true,
  });
  res.json({ submission: result.submission });
};

export const adminRevokeTaskSubmissionHandler = async (req: AdminRequest, res: Response): Promise<void> => {
  const submissionId = Number(req.params.submissionId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
  const { adminRevokeTaskSubmission } = await import('../services/adminManualTaskService.js');
  const result = await adminRevokeTaskSubmission(submissionId, reason);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  await logAdminAction({
    req,
    actionType: 'task_submission_revoke',
    section: 'moderation',
    objectId: String(submissionId),
    newValue: {
      participantId: result.participantId,
      taskId: result.taskId,
      submissionId: result.submissionId,
      revokedLogIds: result.revokedLogIds,
      deleted: true,
      reason,
    },
    isCritical: true,
  });
  res.json({
    deleted: true,
    participantId: result.participantId,
    taskId: result.taskId,
    submissionId: result.submissionId,
    revokedLogIds: result.revokedLogIds,
  });
};
