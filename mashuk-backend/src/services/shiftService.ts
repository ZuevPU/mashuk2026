import { and, asc, count, eq, inArray } from 'drizzle-orm';
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
  'profileProgressWeights',
  'shiftLabel',
  'pdfTemplate',
  'recommendationTemplates',
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
    profileProgressWeights: shift.profileProgressWeights ?? null,
    shiftLabel: shift.shiftLabel ?? null,
    pdfTemplate: shift.pdfTemplate ?? null,
    recommendationTemplates: shift.recommendationTemplates ?? null,
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
    profileProgressWeights: shift.profileProgressWeights,
    shiftLabel: shift.shiftLabel,
    pdfTemplate: shift.pdfTemplate,
    recommendationTemplates: shift.recommendationTemplates,
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
  if (row?.status === 'active') {
    await mirrorShiftToForumSettings(row);
    clearShiftCaches();
  }
  return row ?? null;
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

export async function copyShiftProgram(opts: {
  sourceId: number;
  code: string;
  name: string;
  startDate?: Date | null;
}): Promise<{ shift: ShiftRow; preview: Awaited<ReturnType<typeof previewCopyShift>> }> {
  const source = await getShiftById(opts.sourceId);
  if (!source) throw new Error('Source shift not found');
  const preview = await previewCopyShift(opts.sourceId);

  const newShift = await createShift({
    code: opts.code,
    name: opts.name,
    startDate: opts.startDate ?? null,
    totalDays: source.totalDays ?? 8,
    isSandbox: false,
  });

  await db.update(shifts).set({
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
    profileProgressWeights: source.profileProgressWeights,
    shiftLabel: opts.name,
    pdfTemplate: source.pdfTemplate,
    recommendationTemplates: source.recommendationTemplates,
    roleDiagnosticsConfig: source.roleDiagnosticsConfig,
    leaderboardScopes: source.leaderboardScopes,
    currentDay: 1,
    updatedAt: new Date(),
  }).where(eq(shifts.id, newShift.id));

  const srcDays = await db.select().from(scheduleDays).where(eq(scheduleDays.shiftId, opts.sourceId));
  for (const d of srcDays) {
    const { id: _id, ...rest } = d;
    await db.insert(scheduleDays).values({ ...rest, shiftId: newShift.id, isPublished: false, publishedAt: null });
  }

  const srcFocus = await db.select().from(dayFocus).where(eq(dayFocus.shiftId, opts.sourceId));
  for (const f of srcFocus) {
    const { id: _id, ...rest } = f;
    await db.insert(dayFocus).values({ ...rest, shiftId: newShift.id });
  }

  const srcExperiments = await db.select().from(dayExperiments).where(eq(dayExperiments.shiftId, opts.sourceId));
  for (const e of srcExperiments) {
    const { id: _id, ...rest } = e;
    await db.insert(dayExperiments).values({ ...rest, shiftId: newShift.id });
  }

  const groupIdMap = new Map<number, number>();
  const srcGroups = await db.select().from(participantGroups).where(eq(participantGroups.shiftId, opts.sourceId));
  for (const g of srcGroups) {
    const { id: oldId, ...rest } = g;
    const [created] = await db.insert(participantGroups).values({ ...rest, shiftId: newShift.id }).returning();
    groupIdMap.set(oldId, created.id);
  }

  const eventIdMap = new Map<number, number>();
  const srcEvents = await db.select().from(events).where(eq(events.shiftId, opts.sourceId)).orderBy(asc(events.id));
  const parents = srcEvents.filter(e => !e.parentEventId);
  const children = srcEvents.filter(e => e.parentEventId);
  for (const e of parents) {
    const { id: oldId, qrToken: _q, ...rest } = e;
    const [created] = await db.insert(events).values({
      ...rest,
      shiftId: newShift.id,
      parentEventId: null,
      qrToken: null,
    }).returning();
    eventIdMap.set(oldId, created.id);
  }
  for (const e of children) {
    const { id: oldId, qrToken: _q, parentEventId, ...rest } = e;
    const [created] = await db.insert(events).values({
      ...rest,
      shiftId: newShift.id,
      parentEventId: parentEventId ? (eventIdMap.get(parentEventId) ?? null) : null,
      qrToken: null,
    }).returning();
    eventIdMap.set(oldId, created.id);
  }

  const srcMats = await db.select().from(materials).where(eq(materials.shiftId, opts.sourceId));
  for (const m of srcMats) {
    const { id: _id, ...rest } = m;
    await db.insert(materials).values({
      ...rest,
      shiftId: newShift.id,
      eventId: rest.eventId ? (eventIdMap.get(rest.eventId) ?? null) : null,
    });
  }

  const questionIdMap = new Map<number, number>();
  const srcQs = await db.select().from(questions).where(eq(questions.shiftId, opts.sourceId)).orderBy(asc(questions.id));
  for (const q of srcQs) {
    const { id: oldId, ...rest } = q;
    const mappedGroup = rest.audienceGroupId && groupIdMap.has(rest.audienceGroupId)
      ? groupIdMap.get(rest.audienceGroupId)!
      : rest.audienceGroupId;
    const [created] = await db.insert(questions).values({
      ...rest,
      shiftId: newShift.id,
      parentQuestionId: null,
      audienceGroupId: mappedGroup ?? null,
    }).returning();
    questionIdMap.set(oldId, created.id);
    const optsRows = await db.select().from(questionOptions).where(eq(questionOptions.questionId, oldId));
    for (const o of optsRows) {
      const { id: _oid, ...oRest } = o;
      await db.insert(questionOptions).values({ ...oRest, questionId: created.id });
    }
  }
  for (const q of srcQs) {
    if (q.parentQuestionId && questionIdMap.has(q.id) && questionIdMap.has(q.parentQuestionId)) {
      await db.update(questions)
        .set({ parentQuestionId: questionIdMap.get(q.parentQuestionId)! })
        .where(eq(questions.id, questionIdMap.get(q.id)!));
    }
  }

  const srcTasks = await db.select().from(tasks).where(eq(tasks.shiftId, opts.sourceId));
  for (const t of srcTasks) {
    const { id: _id, qrToken: _q, ...rest } = t;
    await db.insert(tasks).values({ ...rest, shiftId: newShift.id, qrToken: null });
  }

  const srcPush = await db.select().from(adminPushNotifications).where(eq(adminPushNotifications.shiftId, opts.sourceId));
  for (const p of srcPush) {
    const { id: _id, sentAt: _s, deliveredCount: _d, openedCount: _o, triggerFiredAt: _t, ...rest } = p;
    await db.insert(adminPushNotifications).values({
      ...rest,
      shiftId: newShift.id,
      status: 'draft',
      sentAt: null,
      deliveredCount: 0,
      openedCount: 0,
      triggerFiredAt: null,
    });
  }

  const fresh = (await getShiftById(newShift.id))!;
  return { shift: fresh, preview };
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

export async function findParticipantByVkInActiveShift(vkId: number) {
  const shiftId = await resolveActiveShiftId();
  const [user] = await db.select().from(participants)
    .where(and(eq(participants.vkId, vkId), eq(participants.shiftId, shiftId)))
    .limit(1);
  return user ?? null;
}
