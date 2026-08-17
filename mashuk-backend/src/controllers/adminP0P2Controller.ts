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
import { inferForumDayFromTimestamp } from '../services/timePhase.js';
import { deactivateOtherConsents } from './consentsController.js';
import { evaluateAllMedals, getMedalRuleProgress, parseMedalRule } from '../services/medalEvaluator.js';
import { clubMatchNightly, synthesizeOutcomes } from '../services/gigachatService.js';
import {
  persistTaskQrToken,
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
    const { listShiftGroupsWithSeats } = await import('../services/groupDirectionSync.js');
    const withCounts = await listShiftGroupsWithSeats(shiftId);
    res.json({ groups: withCounts });
  },
  create: async (req: AdminRequest, res: Response) => {
    const { name, directionId, capacity } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
    const { findDuplicateGroupOnShift, normalizeGroupName } = await import('../services/groupDirectionSync.js');
    const shiftId = await selectedAdminShiftOr400(req, res);
    if (shiftId == null) return;
    const groupName = normalizeGroupName(name);
    const dup = await findDuplicateGroupOnShift(shiftId, groupName);
    if (dup) {
      res.status(400).json({ error: `Группа «${dup.name}» уже есть на этой смене` });
      return;
    }
    let nextDirectionId = directionId ? Number(directionId) : null;
    if (nextDirectionId) {
      const { getDirectionInShift } = await import('../services/shiftCatalogs.js');
      const dir = await getDirectionInShift(nextDirectionId, shiftId);
      if (!dir) { res.status(400).json({ error: 'Направление не найдено на этой смене' }); return; }
      nextDirectionId = dir.id;
    }
    const [g] = await db.insert(participantGroups).values({
      name: groupName,
      directionId: nextDirectionId,
      capacity: capacity != null ? Number(capacity) : 30,
      shiftId,
    }).returning();
    res.json({ group: g });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const patch: Partial<typeof participantGroups.$inferInsert> = {};
    const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
    const selectedShiftId = await selectedAdminShiftOr400(req, res);
    if (selectedShiftId == null) return;
    if (req.body.name !== undefined) {
      const { findDuplicateGroupOnShift, normalizeGroupName } = await import('../services/groupDirectionSync.js');
      const shiftIdForName = selectedShiftId;
      patch.name = normalizeGroupName(String(req.body.name));
      const dup = await findDuplicateGroupOnShift(shiftIdForName, patch.name, id);
      if (dup) {
        res.status(400).json({ error: `Группа «${dup.name}» уже есть на этой смене` });
        return;
      }
    }
    if (req.body.capacity !== undefined) patch.capacity = Math.max(1, Number(req.body.capacity) || 1);
    if (req.body.directionId !== undefined) {
      const raw = req.body.directionId;
      patch.directionId = raw === null || raw === '' ? null : Number(raw);
      if (patch.directionId != null && (!Number.isFinite(patch.directionId) || patch.directionId <= 0)) {
        res.status(400).json({ error: 'Invalid directionId' });
        return;
      }
      if (patch.directionId != null) {
        const { getDirectionInShift } = await import('../services/shiftCatalogs.js');
        const dir = await getDirectionInShift(patch.directionId, selectedShiftId);
        if (!dir) { res.status(400).json({ error: 'Направление не найдено на этой смене' }); return; }
      }
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }
    const shiftId = selectedShiftId;
    const [before] = await db.select({
      directionId: participantGroups.directionId,
      shiftId: participantGroups.shiftId,
    }).from(participantGroups).where(and(
      eq(participantGroups.id, id),
      eq(participantGroups.shiftId, shiftId),
    )).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }
    const [updated] = await db.update(participantGroups).set(patch).where(and(
      eq(participantGroups.id, id),
      eq(participantGroups.shiftId, shiftId),
    )).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    // sync group_name on participants
    await db.update(participants).set({ groupName: updated.name }).where(eq(participants.groupId, id));
    let synced = 0;
    const directionChanged = patch.directionId !== undefined && patch.directionId !== before.directionId;
    if (directionChanged) {
      const { applyGroupDirectionToMembers } = await import('../services/groupDirectionSync.js');
      synced = await applyGroupDirectionToMembers(id);
    }
    res.json({ group: updated, directionSynced: synced });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
    const shiftId = await selectedAdminShiftOr400(req, res);
    if (shiftId == null) return;
    const [owned] = await db.select({ id: participantGroups.id }).from(participantGroups).where(and(
      eq(participantGroups.id, id),
      eq(participantGroups.shiftId, shiftId),
    )).limit(1);
    if (!owned) { res.status(404).json({ error: 'Not found' }); return; }
    await db.update(participants).set({ groupId: null, groupName: null }).where(eq(participants.groupId, id));
    const [deleted] = await db.delete(participantGroups).where(and(
      eq(participantGroups.id, id),
      eq(participantGroups.shiftId, shiftId),
    )).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
  syncDirections: async (req: AdminRequest, res: Response) => {
    const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
    const shiftId = await selectedAdminShiftOr400(req, res);
    if (shiftId == null) return;
    const { applyAllGroupDirections } = await import('../services/groupDirectionSync.js');
    const synced = await applyAllGroupDirections(shiftId);
    res.json({ ok: true, synced });
  },
};

// ─── Schedule publish ────────────────────────────────────────

export const publishScheduleDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const dayNumber = Number(req.body.dayNumber ?? req.params.dayNumber);
  if (!dayNumber) { res.status(400).json({ error: 'dayNumber required' }); return; }
  const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
  const shiftId = await selectedAdminShiftOr400(req, res);
  if (shiftId == null) return;

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
  // day focus / schedule («Далее») / Program open on that day without a second click.
  const {
    getShiftById, updateShift, shiftOpsToForumShape, clearShiftCaches,
  } = await import('../services/shiftService.js');
  const shift = await getShiftById(shiftId);
  const prevCurrentDay = shift?.currentDay ?? 1;
  let advancedCurrentDay: number | null = null;
  const shiftPatch: { currentDay?: number; eveningQuestionnaireByDay?: Record<string, unknown> } = {};
  // Always sync participant "today" to the published day when it moves forward
  // (focus, touchpoints, state checks). Re-publish of an older day does not roll back.
  if (shift && dayNumber > prevCurrentDay) {
    shiftPatch.currentDay = dayNumber;
    advancedCurrentDay = dayNumber;
  } else if (shift && dayNumber === prevCurrentDay) {
    // Same day re-publish: still touch currentDay so mirror/cache refresh is guaranteed.
    shiftPatch.currentDay = dayNumber;
  }

  // Re-publishing a day clears evening «снята с публикации» from a prior hide,
  // so the questionnaire can follow opensAtMsk / «Опубликовать сейчас» again.
  if (shift && dayNumber >= 1 && dayNumber <= 7) {
    const { resolveEveningConfigForDay } = await import('../services/eveningQuestionnaireConfig.js');
    const byDay = {
      ...((shift.eveningQuestionnaireByDay as Record<string, Record<string, unknown>> | null) || {}),
    };
    const resolved = resolveEveningConfigForDay(shiftOpsToForumShape(shift) as never, dayNumber);
    if (resolved.forceUnpublished) {
      const { forceUnpublished: _fu, ...rest } = resolved;
      byDay[String(dayNumber)] = rest;
      shiftPatch.eveningQuestionnaireByDay = byDay;
    }
  }

  let updatedCurrentDay = prevCurrentDay;
  if (Object.keys(shiftPatch).length) {
    const updated = await updateShift(shiftId, shiftPatch);
    updatedCurrentDay = updated?.currentDay ?? shiftPatch.currentDay ?? prevCurrentDay;
  }

  // Always bust settings/active-shift caches so Home day focus switches immediately
  // (updateShift clears only when status=active; publish must be authoritative).
  clearShiftCaches();
  const { clearCache } = await import('../services/cache.js');
  clearCache(`events_day_${shiftId}_${dayNumber}`);

  await logAdminAction({
    req, actionType: 'schedule_publish', section: 'events', objectId: dayNumber,
    newValue: {
      version: nextVersion,
      events: dayEvents.length,
      currentDayAdvancedTo: advancedCurrentDay,
      eveningPublishFlagsCleared: !!shiftPatch.eveningQuestionnaireByDay,
    },
    isCritical: true,
  });

  res.json({
    ok: true,
    version: snap,
    eventsCount: dayEvents.length,
    currentDay: updatedCurrentDay,
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
    const { selectedAdminShiftOr400, updateShift } = await import('../services/shiftService.js');
    const shiftId = await selectedAdminShiftOr400(req, res);
    if (shiftId == null) return;
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
    const settings = await getForumSettings(shiftId);
    if (dayNumber > (settings.totalDays ?? 8)) {
      await updateShift(shiftId, { totalDays: dayNumber });
    }
    res.json({ day });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const { selectedAdminShiftOr400 } = await import('../services/shiftService.js');
    const selectedShiftId = await selectedAdminShiftOr400(req, res);
    if (selectedShiftId == null) return;
    const [existing] = await db.select().from(scheduleDays).where(eq(scheduleDays.id, id)).limit(1);
    if (!existing || existing.shiftId !== selectedShiftId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const patch: Partial<typeof scheduleDays.$inferInsert> = {};
    if (req.body.displayLabel != null) patch.displayLabel = String(req.body.displayLabel);
    if (req.body.shiftNumber != null) patch.shiftNumber = Number(req.body.shiftNumber);
    if (req.body.calendarDate != null) patch.calendarDate = new Date(req.body.calendarDate);
    const [updated] = await db.update(scheduleDays).set(patch).where(and(
      eq(scheduleDays.id, id),
      eq(scheduleDays.shiftId, selectedShiftId),
    )).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ day: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const force = req.query.force === '1' || req.query.force === 'true';
    const { selectedAdminShiftOr400, updateShift } = await import('../services/shiftService.js');
    const shiftId = await selectedAdminShiftOr400(req, res);
    if (shiftId == null) return;
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
    const settings = await getForumSettings(shiftId);
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
  const {
    resolveAdminShiftId, getShiftById, updateShift, shiftOpsToForumShape, clearShiftCaches,
  } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  // Hide day from participants; keep event drafts ready for re-publish
  await db.update(events).set({ dayPublished: false })
    .where(and(eq(events.dayNumber, dayNumber), eq(events.shiftId, shiftId)));
  await db.update(scheduleDays).set({ isPublished: false })
    .where(and(eq(scheduleDays.dayNumber, dayNumber), eq(scheduleDays.shiftId, shiftId)));

  // Evening survey is independent of schedule flags — also hide it for this day
  // so «Скрыть» / снятие дня с публикации не оставляет итоговую анкету висеть.
  let eveningUnpublished = false;
  if (dayNumber >= 1 && dayNumber <= 7) {
    const shift = await getShiftById(shiftId);
    if (shift) {
      const { resolveEveningConfigForDay } = await import('../services/eveningQuestionnaireConfig.js');
      const byDay = {
        ...((shift.eveningQuestionnaireByDay as Record<string, Record<string, unknown>> | null) || {}),
      };
      const resolved = resolveEveningConfigForDay(shiftOpsToForumShape(shift) as never, dayNumber);
      byDay[String(dayNumber)] = { ...resolved, forceUnpublished: true };
      await updateShift(shiftId, { eveningQuestionnaireByDay: byDay });
      eveningUnpublished = true;
    }
  }

  clearShiftCaches();
  const { clearCache } = await import('../services/cache.js');
  clearCache(`events_day_${shiftId}_${dayNumber}`);
  await logAdminAction({
    req, actionType: 'schedule_draft', section: 'events', objectId: dayNumber,
    newValue: { shiftId, eveningUnpublished }, isCritical: true,
  });
  res.json({ ok: true, eveningUnpublished });
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

  const { enrichPointsLogRows } = await import('../services/pointsLogSource.js');
  const enrichedPts = await enrichPointsLogRows(pts);

  const plainTaskDesc = (t: typeof tasks.$inferSelect | null | undefined) => {
    if (!t) return null;
    const fromHtml = (t.descriptionHtml || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return fromHtml || (t.description || '').trim() || (t.shortDescription || '').trim() || null;
  };

  type Item = {
    at: Date | null;
    kind: string;
    title: string;
    detail?: string;
    description?: string | null;
    sourceKind?: string | null;
    sourceTitle?: string | null;
    sourceDescription?: string | null;
  };
  const items: Item[] = [];
  for (const r of ans) {
    const qDesc = [r.q?.subtitle, r.q?.text].filter(Boolean).join('\n').trim() || null;
    items.push({
      at: r.a.createdAt,
      kind: 'answer',
      title: r.q?.title || 'Ответ',
      description: qDesc,
      detail: typeof r.a.answerData === 'string' ? r.a.answerData : JSON.stringify(r.a.answerData),
      sourceKind: 'question',
      sourceTitle: r.q?.title || null,
      sourceDescription: qDesc,
    });
  }
  for (const r of subs) {
    const desc = plainTaskDesc(r.t);
    items.push({
      at: r.s.submittedAt,
      kind: 'task',
      title: r.t?.title || 'Задание',
      description: desc,
      detail: r.s.status ?? undefined,
      sourceKind: 'task',
      sourceTitle: r.t?.title || null,
      sourceDescription: desc,
    });
  }
  for (const pl of enrichedPts) {
    items.push({
      at: pl.createdAt,
      kind: 'points',
      title: pl.sourceTitle
        ? `${pl.actionType || 'Баллы'} · ${pl.sourceTitle}`
        : (pl.actionType || 'Баллы'),
      description: pl.sourceDescription,
      detail: `${pl.points > 0 ? '+' : ''}${pl.points}`,
      sourceKind: pl.sourceKind,
      sourceTitle: pl.sourceTitle,
      sourceDescription: pl.sourceDescription,
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
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const [row] = await db.insert(pushQueue).values({
    templateId: templateId ? Number(templateId) : null,
    text: body.trim(),
    scheduledAt: when,
    status: 'pending',
    target: target || 'all',
    participantIds: participantIds || null,
    createdByAdminId: req.adminId ?? null,
    shiftId: await resolveAdminShiftId(req),
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
    db.select().from(pointsLog).where(eq(pointsLog.participantId, id)).orderBy(desc(pointsLog.createdAt)).limit(300),
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
      actionType: pointsLog.actionType,
      createdAt: pointsLog.createdAt,
    }).from(pointsLog).where(eq(pointsLog.participantId, id)),
    db.select().from(medals).where(and(
      eq(medals.isActive, true),
      eq(medals.shiftId, p.shiftId ?? -1),
    )).orderBy(asc(medals.name)),
  ]);

  const filteredAnswers = userAnswers.filter(r => {
    if (answerBlock && (r.q?.block || '') !== answerBlock) return false;
    if (answerDay != null && !Number.isNaN(answerDay) && r.q?.dayNumber !== answerDay) return false;
    return true;
  });

  const settings = await getForumSettings(p.shiftId);
  const byDay: Record<string, number> = {};
  for (const row of allPointsRows) {
    if (row.revokedAt) continue;
    if ((row.actionType || '').endsWith('_revoke')) continue;
    const inferred = row.forumDay
      ?? inferForumDayFromTimestamp(
        row.createdAt ?? new Date(),
        settings.startDate ?? null,
        settings.totalDays ?? 8,
      )
      ?? 0;
    const key = String(inferred);
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
  const { enrichPointsLogRows } = await import('../services/pointsLogSource.js');
  const { auditParticipantPoints } = await import('../services/participantPointsAudit.js');
  const [enrichedPoints, pointsAudit] = await Promise.all([
    enrichPointsLogRows(userPoints),
    auditParticipantPoints(id),
  ]);

  res.json({
    participant: { ...p, avatarUrl },
    avatarUrl,
    pointsAudit,
    answers: filteredAnswers.map(r => ({
      id: r.a.id,
      questionTitle: r.q?.title,
      questionText: r.q?.text,
      questionSubtitle: r.q?.subtitle,
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
    points: enrichedPoints.map(pl => ({
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
  const [logRow] = await db.select().from(pointsLog).where(eq(pointsLog.id, logId)).limit(1);
  const result = await revokePointsLogEntry(logId, participantId, reason);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  if (logRow) {
    const { releaseTaskAfterPointsRevoke } = await import('../services/adminManualTaskService.js');
    await releaseTaskAfterPointsRevoke({
      participantId,
      actionType: logRow.actionType,
      submissionId: logRow.submissionId,
      pointsLogId: logId,
    });
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

/** Rebuild path/experience/bonus from points_log and return a fresh audit. */
export const recalculateParticipantPointsCard = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.id);
  if (!Number.isFinite(participantId) || participantId <= 0) {
    res.status(400).json({ error: 'Invalid participant id' });
    return;
  }
  const [exists] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!exists) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { backfillRatingBonusesForParticipant } = await import('../services/ratingBonusesService.js');
  const { auditParticipantPoints } = await import('../services/participantPointsAudit.js');
  const bonuses = await backfillRatingBonusesForParticipant(participantId);
  const audit = await auditParticipantPoints(participantId);
  await logAdminAction({
    req,
    actionType: 'points_recalculate',
    section: 'participants',
    objectId: String(participantId),
    newValue: {
      participantId,
      bonuses,
      audit: { ok: audit.ok, stored: audit.stored, fromLog: audit.fromLog },
    },
    isCritical: false,
  });
  res.json({ ok: true, audit, bonuses });
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
  const { releaseTaskAfterPointsRevoke } = await import('../services/adminManualTaskService.js');
  let revoked = 0;
  for (const row of toRevoke) {
    const result = await revokePointsLogEntry(row.id, participantId, reason);
    if (result.ok) {
      revoked += 1;
      await releaseTaskAfterPointsRevoke({
        participantId,
        actionType: row.actionType,
        submissionId: row.submissionId,
        pointsLogId: row.id,
      });
    }
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
    or(
      eq(tasks.dayNumber, day),
      sql`${tasks.dayNumbers} @> ${JSON.stringify([day])}::jsonb`,
    ),
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
    const token = await persistTaskQrToken(t.id, t.qrToken);
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
    const { resolveAdminShiftId } = await import('../services/shiftService.js');
    const shiftId = await resolveAdminShiftId(req);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task || task.shiftId !== shiftId) {
      res.status(404).json({ error: 'Задание не найдено в выбранной смене' });
      return;
    }
    const regenerate = (req.body as { regenerate?: boolean })?.regenerate === true;
    token = await persistTaskQrToken(task.id, task.qrToken, { regenerate });
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
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);

  const allP = await db.select().from(participants).where(eq(participants.shiftId, shiftId));
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

  const pids = allP.map(p => p.id);
  const ans = pids.length
    ? await db.select().from(answers).where(inArray(answers.participantId, pids))
    : [];
  const { isPublishedStatus } = await import('../services/publishStatus.js');
  const depths: Record<string, number> = {};
  const energySeries: { day: number; avg: number; n: number }[] = [];
  const dayQsAll = await db.select().from(questions).where(eq(questions.shiftId, shiftId));
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

  const pig = pids.length
    ? await db.select().from(piggybank).where(inArray(piggybank.participantId, pids))
    : [];
  const pigTags: Record<string, number> = {};
  for (const e of pig) {
    const t = e.tag || 'прочее';
    pigTags[t] = (pigTags[t] || 0) + 1;
  }

  const approvedTasks = pids.length
    ? await db.select().from(taskSubmissions).where(and(eq(taskSubmissions.status, 'approved'), inArray(taskSubmissions.participantId, pids)))
    : [];
  const pendingModeration = pids.length
    ? await db.select().from(taskSubmissions).where(and(eq(taskSubmissions.status, 'pending'), inArray(taskSubmissions.participantId, pids)))
    : [];
  const pendingTeam = pids.length
    ? await db.select().from(taskSubmissions).where(and(eq(taskSubmissions.status, 'pending_team'), inArray(taskSubmissions.participantId, pids)))
    : [];
  const revokedPointsRows = pids.length
    ? await db.select().from(pointsLog).where(and(isNotNull(pointsLog.revokedAt), inArray(pointsLog.participantId, pids)))
    : [];
  const programEvents = await db.select().from(events).where(eq(events.shiftId, shiftId));
  const allMats = await db.select().from(materials).where(eq(materials.shiftId, shiftId));
  const { published: matsInAnalytics, excludedCount: materialsExcludedFromAnalytics } = (await import('../services/publishStatus.js')).materialCountsForAnalytics(allMats);
  const attendance = pids.length
    ? await db.select().from(eventAttendance).where(inArray(eventAttendance.participantId, pids))
    : [];
  const dayStates = pids.length
    ? await db.select().from(participantDayState).where(inArray(participantDayState.participantId, pids))
    : [];

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

  const forumSettingsResolved = await getForumSettings(shiftId);
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

export const getDeparturePortrait = async (req: AdminRequest, res: Response): Promise<void> => {
  const { resolveAdminShiftId } = await import('../services/shiftService.js');
  const shiftId = await resolveAdminShiftId(req);
  const allP = await db.select().from(participants).where(and(
    isNotNull(participants.onboardingCompletedAt),
    eq(participants.shiftId, shiftId),
  ));
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
  const force = req.body?.force === true || req.query.force === '1';
  const result = await adminCompleteParticipantTask(participantId, taskId, comment, { force });
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
