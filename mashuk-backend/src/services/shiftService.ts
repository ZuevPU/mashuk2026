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

export const SHIFT_COPY_MODULES = [
  'forum',
  'program',
  'knowledge',
  'tasks',
  'questions',
  'points',
  'medals',
  'groups',
  'pushes',
] as const;
export type ShiftCopyModule = (typeof SHIFT_COPY_MODULES)[number];

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
  'forumWrapQuestionnaireConfig',
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

export function pickLiveShifts<T extends { status?: string | null; isSandbox?: boolean | null }>(
  rows: T[],
): T[] {
  return rows.filter(s => s.status === 'active' && !s.isSandbox);
}

/** Смены в эфире: активные, не песочница. Если таких нет — текущая активная. */
export async function listLiveShifts(): Promise<ShiftRow[]> {
  const rows = await db.select().from(shifts).orderBy(asc(shifts.id));
  const live = pickLiveShifts(rows);
  if (live.length) return live;
  const fallback = await resolveActiveShift();
  return fallback ? [fallback] : [];
}

export function clearShiftCaches(): void {
  clearCache('activeShift');
  clearCache('forumSettings');
  clearCache('events_day_');
}

export function requestedAdminShiftId(req: Request): number | null {
  const headerRaw = req.headers['x-admin-shift-id'];
  const headerVal = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const fromHeader = headerVal ? Number(headerVal) : NaN;
  const fromQuery = req.query.shiftId != null ? Number(req.query.shiftId) : NaN;
  if (!Number.isNaN(fromHeader) && fromHeader > 0) return fromHeader;
  if (!Number.isNaN(fromQuery) && fromQuery > 0) return fromQuery;
  return null;
}

/** Admin editing context: X-Admin-Shift-Id header or ?shiftId=, else active */
export async function resolveAdminShiftId(req: Request): Promise<number> {
  const candidate = requestedAdminShiftId(req);
  if (candidate != null) {
    const [row] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, candidate)).limit(1);
    if (row) return row.id;
  }
  return resolveActiveShiftId();
}

export const SELECT_ADMIN_SHIFT_ERROR = 'Выберите смену';

/** Write paths: no silent fallback to the first active shift. */
export async function requireSelectedAdminShiftId(req: Request): Promise<number | null> {
  const candidate = requestedAdminShiftId(req);
  if (candidate == null) return null;
  const [row] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, candidate)).limit(1);
  return row?.id ?? null;
}

export async function selectedAdminShiftOr400(
  req: Request,
  res: { status(code: number): { json(body: unknown): unknown } },
): Promise<number | null> {
  const shiftId = await requireSelectedAdminShiftId(req);
  if (shiftId == null) {
    res.status(400).json({ error: SELECT_ADMIN_SHIFT_ERROR });
    return null;
  }
  return shiftId;
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
    forumWrapQuestionnaireConfig: shift.forumWrapQuestionnaireConfig ?? null,
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
    isPublished: shift.isPublished === true,
    isSandbox: shift.isSandbox,
    shiftLive: shift.status === 'active',
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
    forumWrapQuestionnaireConfig: shift.forumWrapQuestionnaireConfig,
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

export function isShiftLive(shift: { status?: string | null } | null | undefined): boolean {
  return shift?.status === 'active';
}

export function requestedShiftIdFromReq(req: Request): number | null {
  const raw = req.headers['x-shift-id'];
  const val = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function pickParticipantForVk<T extends {
  shiftId: number | null;
  onboardingCompletedAt: Date | null;
  selfDeletedAt: Date | null;
  lastActiveAt: Date | null;
}>(
  rows: T[],
  preferredShiftId?: number | null,
  opts?: { fallback?: boolean },
): T | null {
  if (!rows.length) return null;
  const fallback = opts?.fallback !== false;
  const completed = rows.filter(r => r.onboardingCompletedAt && !r.selfDeletedAt);
  if (preferredShiftId) {
    const inPreferred = completed.find(r => r.shiftId === preferredShiftId)
      ?? rows.find(r => r.shiftId === preferredShiftId);
    if (inPreferred) return inPreferred;
    if (!fallback) return null;
  }
  const ranked = (completed.length ? completed : rows).slice().sort((a, b) => {
    const ta = a.lastActiveAt?.getTime() ?? a.onboardingCompletedAt?.getTime() ?? 0;
    const tb = b.lastActiveAt?.getTime() ?? b.onboardingCompletedAt?.getTime() ?? 0;
    return tb - ta;
  });
  return ranked[0] ?? null;
}

export async function findParticipantForVk(
  vkId: number,
  preferredShiftId?: number | null,
  opts?: { fallback?: boolean },
) {
  const rows = await db.select().from(participants).where(eq(participants.vkId, vkId));
  return pickParticipantForVk(rows, preferredShiftId, opts);
}

const OTHER_SHIFT_QR_ERROR =
  'Это задание другой смены. Откройте профиль, переключитесь на нужную смену или зарегистрируйтесь на неё.';

/** When a QR belongs to another shift, credit the matching enrollment instead of 404. */
export function pickEnrollmentForTaskShift<T extends {
  shiftId: number | null;
  onboardingCompletedAt: Date | null;
  selfDeletedAt: Date | null;
  isBlocked?: boolean | null;
  blockReason?: string | null;
}>(
  current: T,
  enrollments: T[],
  taskShiftId: number | null | undefined,
): { ok: true; participant: T } | { ok: false; status: number; error: string } {
  if (taskShiftId == null || taskShiftId === current.shiftId) {
    return { ok: true, participant: current };
  }
  const match = enrollments.find(r => r.shiftId === taskShiftId);
  if (!match) {
    return { ok: false, status: 400, error: OTHER_SHIFT_QR_ERROR };
  }
  if (match.selfDeletedAt || !match.onboardingCompletedAt) {
    return {
      ok: false,
      status: 400,
      error: 'Это задание другой смены. Завершите регистрацию на эту смену в профиле.',
    };
  }
  if (match.isBlocked) {
    return {
      ok: false,
      status: 403,
      error: match.blockReason || 'Доступ ограничен организаторами',
    };
  }
  return { ok: true, participant: match };
}

export async function resolveParticipantForTaskShift(
  current: typeof participants.$inferSelect,
  taskShiftId: number | null | undefined,
) {
  if (taskShiftId == null || taskShiftId === current.shiftId) {
    return { ok: true as const, participant: current };
  }
  if (!current.vkId) {
    return pickEnrollmentForTaskShift(current, [current], taskShiftId);
  }
  const rows = await db.select().from(participants).where(eq(participants.vkId, current.vkId));
  return pickEnrollmentForTaskShift(current, rows, taskShiftId);
}

export function publicShiftCard(s: ShiftRow) {
  const days = s.totalDays ?? 8;
  const start = s.startDate;
  const endDate = start
    ? new Date(start.getTime() + Math.max(0, days - 1) * 24 * 60 * 60 * 1000)
    : null;
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    startDate: start,
    endDate,
    totalDays: days,
    isLive: s.status === 'active',
  };
}

export function findPublishedShiftBySlot(
  published: Array<{ id: number; code: string; name: string }>,
  slot: 1 | 2,
): { id: number; code: string; name: string } | null {
  const code = slot === 1 ? 'shift1' : 'shift2';
  const byCode = published.find(s => s.code === code);
  if (byCode) return byCode;
  const nameRe = slot === 1 ? /смена\s*1\b/i : /смена\s*2\b/i;
  return published.find(s => nameRe.test(s.name)) ?? null;
}

export type RegistrationRoute = {
  action: 'enter' | 'register' | 'choose';
  shiftId: number | null;
};

/** Смена 1 — вход; копия в другую смену — выбор; иначе регистрация на смену 2.
 *  Явный X-Shift-Id (переход из профиля) важнее дефолта: регистрируем/входим туда. */
export function resolveRegistrationRoute(
  published: Array<{ id: number; code: string; name: string }>,
  enrollments: Array<{ shiftId: number | null; onboardingCompleted: boolean }>,
  preferredShiftId?: number | null,
): RegistrationRoute {
  const preferred = preferredShiftId
    && published.some(s => s.id === preferredShiftId)
    ? preferredShiftId
    : null;
  if (preferred) {
    const enrollment = enrollments.find(e => e.shiftId === preferred);
    return {
      action: enrollment?.onboardingCompleted ? 'enter' : 'register',
      shiftId: preferred,
    };
  }

  const shift1 = findPublishedShiftBySlot(published, 1);
  const shift2 = findPublishedShiftBySlot(published, 2)
    ?? published.find(s => s.id !== shift1?.id)
    ?? null;
  const shift1Enrollment = shift1
    ? enrollments.find(e => e.shiftId === shift1.id)
    : undefined;
  const incompleteOther = enrollments.some(e =>
    !e.onboardingCompleted
    && e.shiftId != null
    && e.shiftId !== shift1?.id,
  );
  if (shift1 && shift1Enrollment?.onboardingCompleted && incompleteOther) {
    return { action: 'choose', shiftId: null };
  }
  if (shift1 && shift1Enrollment) {
    return {
      action: shift1Enrollment.onboardingCompleted ? 'enter' : 'register',
      shiftId: shift1.id,
    };
  }
  return { action: 'register', shiftId: shift2?.id ?? published[0]?.id ?? null };
}

export async function listVkEnrollments(vkId: number) {
  const rows = await db.select().from(participants).where(eq(participants.vkId, vkId));
  const shiftIds = [...new Set(rows.map(r => r.shiftId).filter((id): id is number => id != null && id > 0))];
  const shiftRows = shiftIds.length
    ? await db.select().from(shifts).where(inArray(shifts.id, shiftIds))
    : [];
  const byId = new Map(shiftRows.map(s => [s.id, s]));
  return rows.map(r => ({
    shiftId: r.shiftId,
    shiftName: byId.get(r.shiftId)?.name ?? `Смена ${r.shiftId}`,
    onboardingCompleted: !!r.onboardingCompletedAt && !r.selfDeletedAt,
  }));
}

export async function listPublishedShiftsForParticipants() {
  const rows = await db.select().from(shifts).orderBy(asc(shifts.startDate), asc(shifts.id));
  return rows.filter(s => s.isPublished && !s.isSandbox && s.status !== 'archived');
}

function slugShiftCode(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return ascii || 'shift';
}

export async function generateUniqueShiftCode(name: string): Promise<string> {
  const base = slugShiftCode(name);
  for (let i = 0; i < 12; i += 1) {
    const suffix = Date.now().toString(36).slice(-4) + (i > 0 ? String(i) : '');
    const code = `${base}-${suffix}`.slice(0, 64);
    const [hit] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.code, code)).limit(1);
    if (!hit) return code;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getShiftById(id: number): Promise<ShiftRow | null> {
  const [row] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
  return row ?? null;
}

export async function createShift(input: {
  code?: string;
  name: string;
  startDate?: Date | null;
  totalDays?: number;
  isSandbox?: boolean;
}): Promise<ShiftRow> {
  const code = (input.code || '').trim() || await generateUniqueShiftCode(input.name);
  const [row] = await db.insert(shifts).values({
    code,
    name: input.name,
    status: 'draft',
    isPublished: false,
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
 * Activate a shift without demoting other active streams.
 * Optionally keep previous active (dual live). demoteTo still supported for explicit handoff.
 */
export async function activateShift(
  id: number,
  opts?: { demoteTo?: 'archived' | 'ready' | null },
): Promise<{ active: ShiftRow; previous: ShiftRow | null }> {
  const target = await getShiftById(id);
  if (!target) throw new Error('Shift not found');

  const [previous] = await db.select().from(shifts).where(eq(shifts.status, 'active')).limit(1);
  const demoteTo = opts?.demoteTo;

  await db.transaction(async (tx) => {
    if (demoteTo && previous && previous.id !== id) {
      await tx.update(shifts)
        .set({ status: demoteTo, updatedAt: new Date() })
        .where(eq(shifts.id, previous.id));
    }
    await tx.update(shifts)
      .set({ status: 'active', isPublished: true, updatedAt: new Date() })
      .where(eq(shifts.id, id));
  });

  const active = (await getShiftById(id))!;
  await mirrorShiftToForumSettings(active);
  clearShiftCaches();
  return { active, previous: previous && previous.id !== id ? previous : null };
}

export async function publishShift(id: number): Promise<ShiftRow> {
  const target = await getShiftById(id);
  if (!target) throw new Error('Shift not found');
  if (target.status === 'archived') throw new Error('Нельзя опубликовать архивную смену');
  const row = await updateShift(id, { isPublished: true });
  if (!row) throw new Error('Shift not found');
  return row;
}

export async function unpublishShift(id: number): Promise<ShiftRow> {
  const target = await getShiftById(id);
  if (!target) throw new Error('Shift not found');
  if (target.status === 'active') {
    throw new Error('Сначала снимите активность смены, затем публикацию');
  }
  const row = await updateShift(id, { isPublished: false });
  if (!row) throw new Error('Shift not found');
  return row;
}

export async function deactivateShift(id: number): Promise<ShiftRow> {
  const target = await getShiftById(id);
  if (!target) throw new Error('Shift not found');
  if (target.status !== 'active') return target;
  const row = await updateShift(id, { status: 'draft' });
  if (!row) throw new Error('Shift not found');
  return row;
}

export async function archiveShift(id: number): Promise<ShiftRow | null> {
  const row = await getShiftById(id);
  if (!row) return null;
  if (row.status === 'active') {
    throw new Error('Cannot archive an active shift; deactivate it first');
  }
  return updateShift(id, { status: 'archived', isPublished: false });
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
  code?: string;
  name?: string;
  startDate?: Date | null;
  targetId?: number;
  modules?: ShiftCopyModule[];
  confirmReplace?: boolean;
  adminId?: number | null;
}): Promise<{ shift: ShiftRow; preview: Awaited<ReturnType<typeof previewCopyShift>>; copied?: ShiftCopyModule[]; skipped?: ShiftCopyModule[]; replaced?: ShiftCopyModule[] }> {
  const { copyShiftModules } = await import('./shiftCopy.js');
  const result = await copyShiftModules({
    sourceId: opts.sourceId,
    targetId: opts.targetId,
    code: opts.code,
    name: opts.name,
    startDate: opts.startDate,
    modules: opts.modules?.length ? opts.modules : [...SHIFT_COPY_MODULES],
    confirmReplace: opts.confirmReplace === true || opts.targetId == null,
    adminId: opts.adminId,
  });
  const preview = await previewCopyShift(opts.sourceId);
  return { shift: result.shift, preview, copied: result.copied, skipped: result.skipped, replaced: result.replaced };
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
  return findParticipantForVk(vkId, null);
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
