import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/index.js';
import {
  adminPushNotifications,
  answers,
  dayExperiments,
  dayFocus,
  eventAttendance,
  events,
  forumSettings,
  materials,
  participantDayState,
  participantGroups,
  participantPushDeliveries,
  participants,
  piggybank,
  pointsLog,
  pushLog,
  questionOptions,
  questions,
  scheduleDays,
  shifts,
  taskSubmissions,
  tasks,
  userMedals,
} from '../db/schema.js';
import { cache, clearCache } from './cache.js';

export type ShiftRow = typeof shifts.$inferSelect;
export type ShiftStatus = 'draft' | 'ready' | 'active' | 'archived';

const SHIFT_OP_KEYS = [
  'startDate',
  'totalDays',
  'currentDay',
  'recommendationThreshold',
  'sectionsVisibility',
  'groupAssignMode',
  'kbUnlockThreshold',
  'kbUnlockDisabled',
  'kbPastDaysPolicy',
  'pushBlockTypes',
  'pushNightSlotEnabled',
  'teamConfirmHoursDefault',
  'eveningQuestionnaireConfig',
  'eveningQuestionnaireByDay',
  'answerConfirmation',
  'exchangeLimits',
  'profileProgressWeights',
  'shiftLabel',
  'pdfTemplate',
  'recommendationTemplates',
  'programRecEmptyNoMatchText',
  'programRecEmptyNoEventsText',
  'roleDiagnosticsConfig',
  'leaderboardScopes',
] as const;

export type ShiftOpKey = (typeof SHIFT_OP_KEYS)[number];

export async function resolveActiveShift(): Promise<ShiftRow | null> {
  const cached = cache.get('activeShift') as ShiftRow | undefined;
  if (cached) return cached;

  const [byStatus] = await db.select().from(shifts).where(eq(shifts.status, 'active')).limit(1);
  if (byStatus) {
    cache.set('activeShift', byStatus);
    return byStatus;
  }

  const [fs] = await db.select().from(forumSettings).limit(1);
  if (fs?.activeShiftId) {
    const [byId] = await db.select().from(shifts).where(eq(shifts.id, fs.activeShiftId)).limit(1);
    if (byId) {
      cache.set('activeShift', byId);
      return byId;
    }
  }

  const [any] = await db.select().from(shifts).orderBy(asc(shifts.id)).limit(1);
  if (any) cache.set('activeShift', any);
  return any ?? null;
}

export async function resolveActiveShiftId(): Promise<number> {
  const shift = await resolveActiveShift();
  if (!shift) throw new Error('No active shift configured');
  return shift.id;
}

export function clearShiftCaches(): void {
  clearCache('activeShift');
  clearCache('forumSettings');
  clearCache('events_day_');
}

/** Admin editing context: X-Admin-Shift-Id header or ?shiftId=, else active */
export async function resolveAdminShiftId(req: Request): Promise<number> {
  const headerRaw = req.headers['x-admin-shift-id'];
  const headerVal = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const fromHeader = headerVal ? Number(headerVal) : NaN;
  const fromQuery = req.query.shiftId != null ? Number(req.query.shiftId) : NaN;
  const candidate = !Number.isNaN(fromHeader) && fromHeader > 0
    ? fromHeader
    : (!Number.isNaN(fromQuery) && fromQuery > 0 ? fromQuery : null);
  if (candidate != null) {
    const [row] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, candidate)).limit(1);
    if (row) return row.id;
  }
  return resolveActiveShiftId();
}

export function shiftOpsToForumShape(shift: ShiftRow) {
  return {
    currentDay: shift.currentDay ?? 1,
    totalDays: shift.totalDays ?? 8,
    recommendationThreshold: shift.recommendationThreshold ?? 1,
    sectionsVisibility: shift.sectionsVisibility ?? {},
    startDate: shift.startDate ?? null,
    groupAssignMode: shift.groupAssignMode ?? 'list',
    kbUnlockThreshold: shift.kbUnlockThreshold ?? 4,
    kbUnlockDisabled: shift.kbUnlockDisabled === true,
    kbPastDaysPolicy: shift.kbPastDaysPolicy ?? 'locked',
    pushBlockTypes: shift.pushBlockTypes ?? {},
    pushNightSlotEnabled: shift.pushNightSlotEnabled === true,
    teamConfirmHoursDefault: shift.teamConfirmHoursDefault ?? 24,
    eveningQuestionnaireConfig: shift.eveningQuestionnaireConfig ?? null,
    eveningQuestionnaireByDay: shift.eveningQuestionnaireByDay ?? null,
    answerConfirmation: shift.answerConfirmation ?? null,
    exchangeLimits: shift.exchangeLimits ?? null,
    profileProgressWeights: shift.profileProgressWeights ?? null,
    shiftLabel: shift.shiftLabel ?? null,
    pdfTemplate: shift.pdfTemplate ?? null,
    recommendationTemplates: shift.recommendationTemplates ?? null,
    programRecEmptyNoMatchText: shift.programRecEmptyNoMatchText ?? null,
    programRecEmptyNoEventsText: shift.programRecEmptyNoEventsText ?? null,
    roleDiagnosticsConfig: shift.roleDiagnosticsConfig ?? null,
    leaderboardScopes: shift.leaderboardScopes ?? {
      total: true, path: true, experience: true, day: true, shift: true,
    },
    activeShiftId: shift.id,
    shiftId: shift.id,
    shiftCode: shift.code,
    shiftName: shift.name,
    shiftStatus: shift.status,
    isSandbox: shift.isSandbox,
  };
}

export async function mirrorShiftToForumSettings(shift: ShiftRow): Promise<void> {
  const [fs] = await db.select().from(forumSettings).limit(1);
  const patch = {
    currentDay: shift.currentDay,
    totalDays: shift.totalDays,
    recommendationThreshold: shift.recommendationThreshold,
    sectionsVisibility: shift.sectionsVisibility,
    startDate: shift.startDate,
    groupAssignMode: shift.groupAssignMode,
    kbUnlockThreshold: shift.kbUnlockThreshold,
    kbUnlockDisabled: shift.kbUnlockDisabled,
    kbPastDaysPolicy: shift.kbPastDaysPolicy,
    pushBlockTypes: shift.pushBlockTypes,
    pushNightSlotEnabled: shift.pushNightSlotEnabled,
    teamConfirmHoursDefault: shift.teamConfirmHoursDefault,
    eveningQuestionnaireConfig: shift.eveningQuestionnaireConfig,
    eveningQuestionnaireByDay: shift.eveningQuestionnaireByDay,
    answerConfirmation: shift.answerConfirmation,
    exchangeLimits: shift.exchangeLimits,
    profileProgressWeights: shift.profileProgressWeights,
    shiftLabel: shift.shiftLabel,
    pdfTemplate: shift.pdfTemplate,
    recommendationTemplates: shift.recommendationTemplates,
    programRecEmptyNoMatchText: shift.programRecEmptyNoMatchText,
    programRecEmptyNoEventsText: shift.programRecEmptyNoEventsText,
    roleDiagnosticsConfig: shift.roleDiagnosticsConfig,
    leaderboardScopes: shift.leaderboardScopes,
    activeShiftId: shift.id,
    updatedAt: new Date(),
  };
  if (fs) {
    await db.update(forumSettings).set(patch).where(eq(forumSettings.id, fs.id));
  } else {
    await db.insert(forumSettings).values(patch);
  }
}

export function pickShiftOpPatch(body: Record<string, unknown>): Partial<typeof shifts.$inferInsert> {
  const patch: Record<string, unknown> = {};
  for (const key of SHIFT_OP_KEYS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  return patch as Partial<typeof shifts.$inferInsert>;
}

export async function listShifts(): Promise<ShiftRow[]> {
  return db.select().from(shifts).orderBy(asc(shifts.id));
}

export async function getShiftById(id: number): Promise<ShiftRow | null> {
  const [row] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
  return row ?? null;
}

export async function createShift(input: {
  code: string;
  name: string;
  startDate?: Date | null;
  totalDays?: number;
  isSandbox?: boolean;
}): Promise<ShiftRow> {
  const [row] = await db.insert(shifts).values({
    code: input.code,
    name: input.name,
    status: 'draft',
    isSandbox: input.isSandbox ?? false,
    startDate: input.startDate ?? null,
    totalDays: input.totalDays ?? 8,
    currentDay: 1,
    shiftLabel: input.name,
  }).returning();
  return row;
}

export async function updateShift(id: number, patch: Partial<typeof shifts.$inferInsert>): Promise<ShiftRow | null> {
  const [row] = await db.update(shifts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(shifts.id, id))
    .returning();
  if (!row) return null;
  if (row.status === 'active') {
    await mirrorShiftToForumSettings(row);
  }
  // Always invalidate — currentDay / evening flags must reach participants immediately.
  clearShiftCaches();
  return row;
}

/**
 * Exactly one active shift after first activate.
 * Previous active → archived (default) or ready if demoteTo='ready'.
 */
export async function activateShift(
  id: number,
  opts?: { demoteTo?: 'archived' | 'ready' },
): Promise<{ active: ShiftRow; previous: ShiftRow | null }> {
  const demoteTo = opts?.demoteTo ?? 'archived';
  const target = await getShiftById(id);
  if (!target) throw new Error('Shift not found');

  const [previous] = await db.select().from(shifts).where(eq(shifts.status, 'active')).limit(1);

  await db.transaction(async (tx) => {
    if (previous && previous.id !== id) {
      await tx.update(shifts)
        .set({ status: demoteTo, updatedAt: new Date() })
        .where(eq(shifts.id, previous.id));
    }
    await tx.update(shifts)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(shifts.id, id));
  });

  const active = (await getShiftById(id))!;
  await mirrorShiftToForumSettings(active);
  clearShiftCaches();
  return { active, previous: previous && previous.id !== id ? previous : null };
}

export async function archiveShift(id: number): Promise<ShiftRow | null> {
  const row = await getShiftById(id);
  if (!row) return null;
  if (row.status === 'active') {
    throw new Error('Cannot archive the active shift; activate another first');
  }
  return updateShift(id, { status: 'archived' });
}

export async function previewCopyShift(sourceId: number) {
  const [
    [{ c: eventsCount }],
    [{ c: questionsCount }],
    [{ c: tasksCount }],
    [{ c: materialsCount }],
    [{ c: daysCount }],
    [{ c: focusCount }],
    [{ c: groupsCount }],
    [{ c: experimentsCount }],
    [{ c: pushCount }],
  ] = await Promise.all([
    db.select({ c: count() }).from(events).where(eq(events.shiftId, sourceId)),
    db.select({ c: count() }).from(questions).where(eq(questions.shiftId, sourceId)),
    db.select({ c: count() }).from(tasks).where(eq(tasks.shiftId, sourceId)),
    db.select({ c: count() }).from(materials).where(eq(materials.shiftId, sourceId)),
    db.select({ c: count() }).from(scheduleDays).where(eq(scheduleDays.shiftId, sourceId)),
    db.select({ c: count() }).from(dayFocus).where(eq(dayFocus.shiftId, sourceId)),
    db.select({ c: count() }).from(participantGroups).where(eq(participantGroups.shiftId, sourceId)),
    db.select({ c: count() }).from(dayExperiments).where(eq(dayExperiments.shiftId, sourceId)),
    db.select({ c: count() }).from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, sourceId)),
  ]);
  return {
    events: Number(eventsCount),
    questions: Number(questionsCount),
    tasks: Number(tasksCount),
    materials: Number(materialsCount),
    scheduleDays: Number(daysCount),
    dayFocus: Number(focusCount),
    groups: Number(groupsCount),
    dayExperiments: Number(experimentsCount),
    pushCampaigns: Number(pushCount),
  };
}

function rebaseShiftDate(
  value: Date | null,
  sourceStart: Date | null,
  targetStart: Date | null,
): Date | null {
  if (!value || !sourceStart || !targetStart) return null;
  return new Date(value.getTime() + targetStart.getTime() - sourceStart.getTime());
}

export async function copyShiftProgram(opts: {
  sourceId: number;
  code?: string;
  name?: string;
  startDate?: Date | null;
  targetId?: number;
}): Promise<{ shift: ShiftRow; preview: Awaited<ReturnType<typeof previewCopyShift>> }> {
  const source = await getShiftById(opts.sourceId);
  if (!source) throw new Error('Source shift not found');
  const preview = await previewCopyShift(opts.sourceId);

  return db.transaction(async (tx) => {
    let newShift: ShiftRow;
    if (opts.targetId != null) {
      if (opts.targetId === opts.sourceId) throw new Error('Source and target shifts must be different');
      await tx.execute(sql`select ${shifts.id} from ${shifts} where ${shifts.id} = ${opts.targetId} for update`);
      const [target] = await tx.select().from(shifts).where(eq(shifts.id, opts.targetId)).limit(1);
      if (!target) throw new Error('Target shift not found');
      if (target.status === 'active') throw new Error('Нельзя копировать структуру в активную смену');
      const targetCounts = await Promise.all([
        tx.select({ c: count() }).from(events).where(eq(events.shiftId, target.id)),
        tx.select({ c: count() }).from(questions).where(eq(questions.shiftId, target.id)),
        tx.select({ c: count() }).from(tasks).where(eq(tasks.shiftId, target.id)),
        tx.select({ c: count() }).from(materials).where(eq(materials.shiftId, target.id)),
        tx.select({ c: count() }).from(scheduleDays).where(eq(scheduleDays.shiftId, target.id)),
        tx.select({ c: count() }).from(dayFocus).where(eq(dayFocus.shiftId, target.id)),
        tx.select({ c: count() }).from(participantGroups).where(eq(participantGroups.shiftId, target.id)),
        tx.select({ c: count() }).from(dayExperiments).where(eq(dayExperiments.shiftId, target.id)),
        tx.select({ c: count() }).from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, target.id)),
      ]);
      if (targetCounts.some(([row]) => Number(row.c) > 0)) {
        throw new Error('Целевая смена не пустая. Копирование разрешено только в пустую смену');
      }
      newShift = target;
    } else {
      if (!opts.code || !opts.name) throw new Error('code and name required');
      [newShift] = await tx.insert(shifts).values({
        code: opts.code,
        name: opts.name,
        status: 'draft',
        isSandbox: false,
        startDate: opts.startDate ?? null,
        totalDays: source.totalDays ?? 8,
        currentDay: 1,
        shiftLabel: opts.name,
      }).returning();
    }

    await tx.update(shifts).set({
    totalDays: source.totalDays,
    recommendationThreshold: source.recommendationThreshold,
    sectionsVisibility: source.sectionsVisibility,
    groupAssignMode: source.groupAssignMode,
    kbUnlockThreshold: source.kbUnlockThreshold,
    kbUnlockDisabled: source.kbUnlockDisabled,
    kbPastDaysPolicy: source.kbPastDaysPolicy,
    pushBlockTypes: source.pushBlockTypes,
    pushNightSlotEnabled: source.pushNightSlotEnabled,
    teamConfirmHoursDefault: source.teamConfirmHoursDefault,
    eveningQuestionnaireConfig: source.eveningQuestionnaireConfig,
    eveningQuestionnaireByDay: source.eveningQuestionnaireByDay,
    answerConfirmation: source.answerConfirmation,
    exchangeLimits: source.exchangeLimits,
    profileProgressWeights: source.profileProgressWeights,
    shiftLabel: opts.name ?? newShift.name,
    pdfTemplate: source.pdfTemplate,
    recommendationTemplates: source.recommendationTemplates,
    programRecEmptyNoMatchText: source.programRecEmptyNoMatchText,
    programRecEmptyNoEventsText: source.programRecEmptyNoEventsText,
    roleDiagnosticsConfig: source.roleDiagnosticsConfig,
    leaderboardScopes: source.leaderboardScopes,
    currentDay: 1,
    updatedAt: new Date(),
    }).where(eq(shifts.id, newShift.id));

    const srcDays = await tx.select().from(scheduleDays).where(eq(scheduleDays.shiftId, opts.sourceId));
    for (const d of srcDays) {
      const { id: _id, ...rest } = d;
      await tx.insert(scheduleDays).values({
        ...rest,
        shiftId: newShift.id,
        calendarDate: rebaseShiftDate(d.calendarDate, source.startDate, newShift.startDate),
        isPublished: false,
        publishedAt: null,
      });
    }

    const srcFocus = await tx.select().from(dayFocus).where(eq(dayFocus.shiftId, opts.sourceId));
    for (const f of srcFocus) {
      const { id: _id, ...rest } = f;
      await tx.insert(dayFocus).values({ ...rest, shiftId: newShift.id });
    }

    const srcExperiments = await tx.select().from(dayExperiments).where(eq(dayExperiments.shiftId, opts.sourceId));
    for (const e of srcExperiments) {
      const { id: _id, ...rest } = e;
      await tx.insert(dayExperiments).values({ ...rest, shiftId: newShift.id });
    }

    const groupIdMap = new Map<number, number>();
    const srcGroups = await tx.select().from(participantGroups).where(eq(participantGroups.shiftId, opts.sourceId));
    for (const g of srcGroups) {
      const { id: oldId, ...rest } = g;
      const [created] = await tx.insert(participantGroups).values({ ...rest, shiftId: newShift.id }).returning();
      groupIdMap.set(oldId, created.id);
    }

    const eventIdMap = new Map<number, number>();
    const srcEvents = await tx.select().from(events).where(eq(events.shiftId, opts.sourceId)).orderBy(asc(events.id));
  // Multi-pass so nested parents exist before children (depth > 1).
  const pending = [...srcEvents];
  let guard = 0;
  while (pending.length && guard < srcEvents.length + 5) {
    guard += 1;
    const still: typeof pending = [];
    for (const e of pending) {
      if (e.parentEventId && !eventIdMap.has(e.parentEventId)) {
        still.push(e);
        continue;
      }
      const { id: oldId, qrToken: _q, parentEventId, ...rest } = e;
      const [created] = await tx.insert(events).values({
        ...rest,
        shiftId: newShift.id,
        eventDate: rebaseShiftDate(e.eventDate, source.startDate, newShift.startDate),
        startTime: rebaseShiftDate(e.startTime, source.startDate, newShift.startDate),
        endTime: rebaseShiftDate(e.endTime, source.startDate, newShift.startDate),
        parentEventId: parentEventId ? (eventIdMap.get(parentEventId) ?? null) : null,
        qrToken: null,
      }).returning();
      eventIdMap.set(oldId, created.id);
    }
    if (still.length === pending.length) {
      // Orphaned parent refs — insert remaining as roots
      for (const e of still) {
        const { id: oldId, qrToken: _q, parentEventId: _p, ...rest } = e;
        const [created] = await tx.insert(events).values({
          ...rest,
          shiftId: newShift.id,
          eventDate: rebaseShiftDate(e.eventDate, source.startDate, newShift.startDate),
          startTime: rebaseShiftDate(e.startTime, source.startDate, newShift.startDate),
          endTime: rebaseShiftDate(e.endTime, source.startDate, newShift.startDate),
          parentEventId: null,
          qrToken: null,
        }).returning();
        eventIdMap.set(oldId, created.id);
      }
      break;
    }
    pending.length = 0;
    pending.push(...still);
  }

  const srcMats = await tx.select().from(materials).where(eq(materials.shiftId, opts.sourceId));
  for (const m of srcMats) {
    const { id: _id, ...rest } = m;
    await tx.insert(materials).values({
      ...rest,
      shiftId: newShift.id,
      eventId: rest.eventId ? (eventIdMap.get(rest.eventId) ?? null) : null,
    });
  }

  const questionIdMap = new Map<number, number>();
  const srcQs = await tx.select().from(questions).where(eq(questions.shiftId, opts.sourceId)).orderBy(asc(questions.id));
  for (const q of srcQs) {
    const { id: oldId, ...rest } = q;
    const mappedGroup = rest.audienceGroupId && groupIdMap.has(rest.audienceGroupId)
      ? groupIdMap.get(rest.audienceGroupId)!
      : rest.audienceGroupId;
    const [created] = await tx.insert(questions).values({
      ...rest,
      shiftId: newShift.id,
      parentQuestionId: null,
      audienceGroupId: mappedGroup ?? null,
    }).returning();
    questionIdMap.set(oldId, created.id);
    const optsRows = await tx.select().from(questionOptions).where(eq(questionOptions.questionId, oldId));
    for (const o of optsRows) {
      const { id: _oid, ...oRest } = o;
      await tx.insert(questionOptions).values({ ...oRest, questionId: created.id });
    }
  }
  for (const q of srcQs) {
    if (q.parentQuestionId && questionIdMap.has(q.id) && questionIdMap.has(q.parentQuestionId)) {
      await tx.update(questions)
        .set({ parentQuestionId: questionIdMap.get(q.parentQuestionId)! })
        .where(eq(questions.id, questionIdMap.get(q.id)!));
    }
  }

  const srcTasks = await tx.select().from(tasks).where(eq(tasks.shiftId, opts.sourceId));
  for (const t of srcTasks) {
    const { id: _id, qrToken: _q, ...rest } = t;
    await tx.insert(tasks).values({ ...rest, shiftId: newShift.id, qrToken: null });
  }

  const srcPush = await tx.select().from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, opts.sourceId));
  for (const p of srcPush) {
    const { id: _id, sentAt: _s, deliveredCount: _d, openedCount: _o, triggerFiredAt: _t, ...rest } = p;
    await tx.insert(adminPushNotifications).values({
      ...rest,
      shiftId: newShift.id,
      status: 'draft',
      programDate: rebaseShiftDate(p.programDate, source.startDate, newShift.startDate),
      publishAt: rebaseShiftDate(p.publishAt, source.startDate, newShift.startDate),
      visibleUntil: rebaseShiftDate(p.visibleUntil, source.startDate, newShift.startDate),
      sentAt: null,
      deliveredCount: 0,
      openedCount: 0,
      triggerFiredAt: null,
    });
  }

    const [fresh] = await tx.select().from(shifts).where(eq(shifts.id, newShift.id)).limit(1);
    return { shift: fresh, preview };
  });
}

export async function clearSandboxParticipantData(shiftId: number): Promise<{
  participantsCleared: number;
}> {
  const shift = await getShiftById(shiftId);
  if (!shift) throw new Error('Shift not found');
  if (!shift.isSandbox) throw new Error('Only sandbox shifts can be cleared');

  const rows = await db.select({ id: participants.id }).from(participants).where(eq(participants.shiftId, shiftId));
  const ids = rows.map(r => r.id);
  if (!ids.length) return { participantsCleared: 0 };

  await db.delete(answers).where(inArray(answers.participantId, ids));
  await db.delete(taskSubmissions).where(inArray(taskSubmissions.participantId, ids));
  await db.delete(piggybank).where(inArray(piggybank.participantId, ids));
  await db.delete(pointsLog).where(inArray(pointsLog.participantId, ids));
  await db.delete(userMedals).where(inArray(userMedals.participantId, ids));
  await db.delete(participantDayState).where(inArray(participantDayState.participantId, ids));
  await db.delete(eventAttendance).where(inArray(eventAttendance.participantId, ids));
  await db.delete(pushLog).where(inArray(pushLog.participantId, ids));
  await db.delete(participantPushDeliveries).where(inArray(participantPushDeliveries.participantId, ids));
  await db.delete(participants).where(eq(participants.shiftId, shiftId));

  return { participantsCleared: ids.length };
}

export async function copyParticipantsToShift(input: {
  sourceShiftId: number;
  targetShiftId: number;
  participantIds: number[];
}): Promise<{ copied: number; skipped: number; notFound: number }> {
  if (input.sourceShiftId === input.targetShiftId) {
    throw new Error('Исходная и целевая смены должны отличаться');
  }
  const target = await getShiftById(input.targetShiftId);
  if (!target) throw new Error('Target shift not found');

  const uniqueIds = [...new Set(input.participantIds)]
    .filter(id => Number.isInteger(id) && id > 0);
  if (!uniqueIds.length) throw new Error('Выберите хотя бы одного участника');
  if (uniqueIds.length > 5000) throw new Error('За один раз можно перенести не более 5000 участников');

  const sourceRows = await db.select().from(participants).where(and(
    eq(participants.shiftId, input.sourceShiftId),
    inArray(participants.id, uniqueIds),
  ));
  if (!sourceRows.length) {
    return { copied: 0, skipped: 0, notFound: uniqueIds.length };
  }

  const sourceVkIds = sourceRows.map(row => row.vkId);
  const existingRows = await db.select({ vkId: participants.vkId }).from(participants).where(and(
    eq(participants.shiftId, input.targetShiftId),
    inArray(participants.vkId, sourceVkIds),
  ));
  const existingVkIds = new Set(existingRows.map(row => row.vkId));
  const rowsToCopy = sourceRows.filter(row => !existingVkIds.has(row.vkId));

  let copied = 0;
  if (rowsToCopy.length) {
    const inserted = await db.insert(participants).values(rowsToCopy.map(source => ({
      vkId: source.vkId,
      shiftId: input.targetShiftId,
      firstName: source.firstName,
      lastName: source.lastName,
      age: source.age,
      workplace: source.workplace,
      position: source.position,
      region: source.region,
      consentPd: source.consentPd,
      consentAnalytics: source.consentAnalytics,
      consentPdVersion: source.consentPdVersion,
      consentAnalyticsVersion: source.consentAnalyticsVersion,
      pushOptOut: source.pushOptOut,
      avatarUrl: source.avatarUrl,
      avatarSyncedAt: source.avatarSyncedAt,
      qrToken: null,
      onboardingCompletedAt: null,
    }))).onConflictDoNothing().returning({ id: participants.id });
    copied = inserted.length;
  }

  return {
    copied,
    skipped: sourceRows.length - copied,
    notFound: uniqueIds.length - sourceRows.length,
  };
}

export async function findParticipantByVkInActiveShift(vkId: number) {
  const shiftId = await resolveActiveShiftId();
  const [user] = await db.select().from(participants)
    .where(and(eq(participants.vkId, vkId), eq(participants.shiftId, shiftId)))
    .limit(1);
  return user ?? null;
}

/**
 * Auto-activate next draft shift when active shift calendar end has passed.
 * Enable with SHIFT_AUTO_ROTATE=true and set startDate/totalDays on shifts.
 */
export async function autoRotateShiftIfDue(now = new Date()): Promise<{ rotated: boolean; fromId?: number; toId?: number }> {
  if (process.env.SHIFT_AUTO_ROTATE !== 'true') return { rotated: false };

  const active = await resolveActiveShift();
  if (!active?.startDate || !active.totalDays) return { rotated: false };

  const { computeShiftEndDate } = await import('./exports/delayedMeasureService.js');
  const endDate = computeShiftEndDate(active.startDate, active.totalDays);
  if (!endDate) return { rotated: false };

  const endOfShift = new Date(endDate.getTime());
  endOfShift.setUTCDate(endOfShift.getUTCDate() + 1);
  if (now < endOfShift) return { rotated: false };

  const [next] = await db.select().from(shifts)
    .where(and(eq(shifts.status, 'draft'), eq(shifts.isSandbox, false)))
    .orderBy(asc(shifts.startDate), asc(shifts.id))
    .limit(1);
  if (!next || next.id === active.id) return { rotated: false };

  await activateShift(next.id);
  console.log(`[shift] auto-rotated ${active.id} → ${next.id}`);
  return { rotated: true, fromId: active.id, toId: next.id };
}
