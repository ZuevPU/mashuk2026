import { Response } from 'express';
import { eq, desc, and, inArray, count, asc, isNull, isNotNull, sql, gte, lte, or, ilike, like } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  participants, directions, participantGroups, thematicTags, programPlaces, programBlockTypes, programSpeakers,
  forumSettings, dayFocus, scheduleDays,
  events, tasks, taskCategories, questions, questionOptions, taskSubmissions, taskTeamConfirmations, exchangeQuestions,
  exchangeAnswers, eventAttendance, materials, materialTypes, kbDayUnlocks,
  levelsConfig, piggybank, answers, dailyStats, pushLog, pointsLog,
  participantDayState, pedagogicalRoles, dayExperiments, adminActionsLog,
  ratingRecalcRuns, ratingBonusRules,
} from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { notifyAllParticipants, sendPushNotification } from '../services/pushService.js';
import { recalculateDailyStats } from '../services/analyticsService.js';
import { clearCache } from '../services/cache.js';
import { normalizeOnboardingConfig } from '../services/roleService.js';
import { participantAnswerSummary } from '../services/participantAnswerFormat.js';
import { enrichSubmissionRow } from '../services/submissionLifecycle.js';
import { entryTags, formatTagsForExport } from '../services/piggybankDict.js';
import {
  eventCreateSchema, eventUpdateSchema,
  taskCreateSchema, taskUpdateSchema,
  questionCreateSchema, questionUpdateSchema,
  copyQuestionsDaySchema, seedTouchpointsSchema,
  dayAdviceUpsertSchema, pedagogicalRoleUpdateSchema, dayAdviceImportSchema,
  parseBody,
} from '../validation/adminSchemas.js';
import { ROLE_KEYS } from '../services/roleService.js';
import {
  adviceCsvTemplate,
  importAdviceCsv,
  listDayAdviceFromDb,
  upsertDayAdvice,
  validateAdvicePayload,
} from '../services/dayAdviceAdminService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import {
  enrichTaskWritePayload,
  methodsFromLegacy,
  normalizeConfirmationMethods,
  normalizeDayNumbers,
  taskMethodsForParticipant,
} from '../services/taskAdminHelpers.js';
import { allocateTaskQrCode, generateQrToken } from '../services/qrService.js';
import { audienceWriteFields } from '../services/eventAudience.js';
import {
  DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
  getEveningOpensAtMsk,
  isEveningOpenForConfig,
  normalizeOpensAtMsk,
  resolveEveningConfigForDay,
  stripPointBFromEveningConfig,
  type EveningQuestionnaireConfig,
} from '../services/eveningQuestionnaireConfig.js';
import { TOUCHPOINT_SLOTS, windowsForDay } from '../services/touchpointTemplates.js';
import { getForumSettings as loadForumSettings } from '../services/helpers.js';
import {
  MAX_EVENT_DEPTH,
  attachEventChildren,
  childDepthOfParent,
  collectDescendantIds,
  wouldCreateCycle,
} from '../services/eventTree.js';
import { enrichEventTimestamps } from '../services/eventSchedule.js';
import { resolveDayPublishedForEvent } from '../services/eventPublishFlags.js';
import { parseParticipantListQuery, queryParticipants } from '../services/participantsList.js';
import { enrichParticipantsWithAvatarUrls } from '../services/participantAvatarSync.js';
import {
  getShiftById,
  pickShiftOpPatch,
  resolveAdminShiftId,
  shiftOpsToForumShape,
  updateShift,
  clearShiftCaches,
} from '../services/shiftService.js';

export const listParticipants = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseParticipantListQuery(req);
  if (parsed.shiftId == null || Number.isNaN(parsed.shiftId)) {
    parsed.shiftId = await resolveAdminShiftId(req);
  }
  const result = await queryParticipants(parsed);
  const participants = await enrichParticipantsWithAvatarUrls(result.participants, { preferStored: false });
  res.json({ ...result, participants, shiftId: parsed.shiftId });
};

export const listParticipantGroups = async (req: AdminRequest, res: Response): Promise<void> => {
  const shiftId = await resolveAdminShiftId(req);
  const rows = await db.select({
    groupId: participants.groupId,
    groupName: participants.groupName,
  }).from(participants).where(and(
    eq(participants.shiftId, shiftId),
    isNull(participants.selfDeletedAt),
    isNotNull(participants.groupId),
  ));
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.groupId != null) map.set(r.groupId, r.groupName || `Группа ${r.groupId}`);
  }
  res.json({
    groups: [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  });
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

/** Admin override: assign / clear registration group (capacity not enforced). */
export const updateParticipantGroup = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid participant id' });
    return;
  }
  const [existing] = await db.select({
    id: participants.id,
    shiftId: participants.shiftId,
    groupId: participants.groupId,
    groupName: participants.groupName,
  }).from(participants).where(eq(participants.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }

  const raw = req.body?.groupId;
  if (raw === null || raw === '' || raw === undefined) {
    const [updated] = await db.update(participants)
      .set({ groupId: null, groupName: null })
      .where(eq(participants.id, id))
      .returning();
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req,
      actionType: 'participant_group_clear',
      section: 'participants',
      objectId: id,
      oldValue: { groupId: existing.groupId, groupName: existing.groupName },
      newValue: { groupId: null, groupName: null },
      isCritical: true,
    });
    res.json({ participant: updated });
    return;
  }

  const groupId = Number(raw);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    res.status(400).json({ error: 'Invalid groupId' });
    return;
  }
  const shiftId = existing.shiftId ?? await resolveAdminShiftId(req);
  const [group] = await db.select().from(participantGroups).where(and(
    eq(participantGroups.id, groupId),
    eq(participantGroups.shiftId, shiftId),
  )).limit(1);
  if (!group) {
    res.status(400).json({ error: 'Группа не найдена на этой смене' });
    return;
  }

  const { resolveDirectionFromGroup } = await import('../services/groupDirectionSync.js');
  const dirPatch = group.directionId
    ? await resolveDirectionFromGroup(group.id, { id: 0, name: '' })
    : null;
  const memberPatch: Partial<typeof participants.$inferInsert> = {
    groupId: group.id,
    groupName: group.name,
  };
  if (dirPatch?.fromGroup) {
    memberPatch.directionId = dirPatch.id;
    memberPatch.direction = dirPatch.name;
  }

  const [updated] = await db.update(participants)
    .set(memberPatch)
    .where(eq(participants.id, id))
    .returning();
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'participant_group_set',
    section: 'participants',
    objectId: id,
    oldValue: { groupId: existing.groupId, groupName: existing.groupName },
    newValue: {
      groupId: group.id,
      groupName: group.name,
      ...(dirPatch?.fromGroup ? { directionId: dirPatch.id, direction: dirPatch.name } : {}),
    },
    isCritical: true,
  });
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

export const blockParticipant = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || 'Заблокирован модератором').slice(0, 500);
  const [updated] = await db.update(participants)
    .set({ isBlocked: true, blockedAt: new Date(), blockReason: reason })
    .where(eq(participants.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'participant_block', section: 'participants', objectId: String(id),
    newValue: { reason }, isCritical: true,
  });
  res.json({ participant: updated });
};

export const unblockParticipant = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [updated] = await db.update(participants)
    .set({ isBlocked: false, blockedAt: null, blockReason: null })
    .where(eq(participants.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'participant_unblock', section: 'participants', objectId: String(id),
    isCritical: true,
  });
  res.json({ participant: updated });
};

/** Исключить из программы (как самоудаление участника, данные сохраняются) */
export const removeParticipantFromProgram = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }
  if (!existing.onboardingCompletedAt) {
    res.status(400).json({ error: 'Participant has not completed registration' });
    return;
  }
  if (existing.selfDeletedAt) {
    res.status(400).json({ error: 'Participant is already removed from program' });
    return;
  }
  const [updated] = await db.update(participants)
    .set({
      selfDeletedAt: new Date(),
      isBlocked: false,
      blockedAt: null,
      blockReason: null,
    })
    .where(eq(participants.id, id))
    .returning();
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'participant_remove_from_program',
    section: 'participants',
    objectId: id,
    isCritical: true,
  });
  res.json({ participant: updated });
};

export const pushParticipant = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const text = String(req.body?.text || '').trim();
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  const { describeDeliveryStatus } = await import('../services/pushDeliveryStatus.js');
  const deliveryStatus = await sendPushNotification([id], text, `admin_manual_${Date.now()}`) ?? 'unknown';
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'participant_push', section: 'participants', objectId: String(id),
    newValue: { text: text.slice(0, 200), deliveryStatus },
  });
  res.json({
    ok: true,
    deliveryStatus,
    deliveryStatusHint: describeDeliveryStatus(deliveryStatus),
  });
};

export const bulkPushParticipants = async (req: AdminRequest, res: Response): Promise<void> => {
  const text = String(req.body?.text || '').trim();
  const ids = Array.isArray(req.body?.participantIds)
    ? req.body.participantIds.map((x: unknown) => Number(x)).filter((n: number) => !Number.isNaN(n))
    : [];
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  if (ids.length === 0) { res.status(400).json({ error: 'participantIds required' }); return; }
  const { describeDeliveryStatus } = await import('../services/pushDeliveryStatus.js');
  const chunk = 100;
  let lastStatus: string | undefined;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const status = await sendPushNotification(slice, text, `admin_bulk_${Date.now()}_${i}`);
    if (slice.length === 1 && status) lastStatus = status;
  }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'participants_bulk_push', section: 'participants',
    newValue: { count: ids.length, text: text.slice(0, 200) },
  });
  const deliveryStatus = ids.length === 1
    ? (lastStatus ?? 'unknown')
    : `batch:${ids.length}`;
  const deliveryStatusHint = ids.length === 1
    ? describeDeliveryStatus(deliveryStatus)
    : `Рассылка запущена для ${ids.length} участников (активная доставка в журнал пушей)`;
  res.json({
    ok: true,
    count: ids.length,
    deliveryStatus,
    deliveryStatusHint,
  });
};

export const adjustParticipantPoints = async (req: AdminRequest, res: Response): Promise<void> => {
  const participantId = Number(req.params.id);
  const points = Number(req.body?.points);
  const track = req.body?.track === 'experience' ? 'experience' : 'path';
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) {
    res.status(400).json({ error: 'reason required' });
    return;
  }
  if (!Number.isFinite(points) || points === 0) {
    res.status(400).json({ error: 'points must be non-zero number' });
    return;
  }
  const abs = Math.abs(points);
  let effectiveAt: Date | undefined;
  const rawAt = req.body?.effectiveAt ?? req.body?.createdAt;
  if (typeof rawAt === 'string' && rawAt.trim()) {
    const d = new Date(rawAt);
    if (!Number.isNaN(d.getTime())) {
      const now = Date.now();
      const min = now - 366 * 24 * 60 * 60 * 1000;
      const max = now + 24 * 60 * 60 * 1000;
      if (d.getTime() >= min && d.getTime() <= max) effectiveAt = d;
    }
  }
  const logValues = (actionType: string, pts: number) => ({
    participantId,
    actionType,
    points: pts,
    ...(effectiveAt ? { createdAt: effectiveAt } : {}),
  });
  if (points > 0) {
    const actionType = track === 'experience' ? 'admin_manual_experience' : 'admin_manual_path';
    await db.insert(pointsLog).values(logValues(actionType, abs));
    if (track === 'experience') {
      await db.update(participants)
        .set({ experiencePoints: sql`${participants.experiencePoints} + ${abs}` })
        .where(eq(participants.id, participantId));
    } else {
      await db.update(participants)
        .set({ pathPoints: sql`${participants.pathPoints} + ${abs}` })
        .where(eq(participants.id, participantId));
    }
  } else {
    const actionType = track === 'experience' ? 'admin_manual_deduct_experience' : 'admin_manual_deduct_path';
    await db.insert(pointsLog).values(logValues(actionType, -abs));
    if (track === 'experience') {
      await db.update(participants)
        .set({ experiencePoints: sql`GREATEST(0, ${participants.experiencePoints} - ${abs})` })
        .where(eq(participants.id, participantId));
    } else {
      await db.update(participants)
        .set({ pathPoints: sql`GREATEST(0, ${participants.pathPoints} - ${abs})` })
        .where(eq(participants.id, participantId));
    }
  }
  const { syncForumPoints } = await import('../services/pointsService.js');
  try {
    await syncForumPoints(participantId);
  } catch (err) {
    console.warn('syncForumPoints after adjust failed:', err);
  }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'points_adjust', section: 'participants', objectId: String(participantId),
    newValue: { points, track, reason }, isCritical: true,
  });
  res.json({ ok: true });
};

export const crudRoles = {
  list: async (_req: AdminRequest, res: Response) => {
    const roles = await db.select().from(pedagogicalRoles).orderBy(asc(pedagogicalRoles.sortOrder));
    res.json({ roles });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(pedagogicalRoleUpdateSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const patch = parsed.data;
    const [updated] = await db.update(pedagogicalRoles)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.quadrant !== undefined ? { quadrant: patch.quadrant } : {}),
        ...(patch.essence !== undefined ? { essence: patch.essence } : {}),
        ...(patch.inClass !== undefined ? { inClass: patch.inClass } : {}),
        ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
        ...(patch.iconKey !== undefined ? { iconKey: patch.iconKey } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      })
      .where(eq(pedagogicalRoles.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ role: updated });
  },
};

export const crudDayExperiments = {
  csvTemplate: async (_req: AdminRequest, res: Response) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="advice-template.csv"');
    res.send('\uFEFF' + adviceCsvTemplate());
  },
  importCsv: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(dayAdviceImportSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const result = await importAdviceCsv(parsed.data.csv);
    res.json(result);
  },
  list: async (req: AdminRequest, res: Response) => {
    const day = req.query.day ? Number(req.query.day) : null;
    const roleKey = typeof req.query.roleKey === 'string' ? req.query.roleKey : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const list = await listDayAdviceFromDb({
      day: day && !Number.isNaN(day) ? day : null,
      roleKey,
      status,
      q,
    });
    res.json({ experiments: list });
  },
  upsert: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(dayAdviceUpsertSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const validated = validateAdvicePayload(parsed.data);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const { row, created } = await upsertDayAdvice(validated.data);
    res.json({ experiment: row, created });
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

  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'participant_delete',
    section: 'participants',
    objectId: String(id),
    oldValue: { vkId: participant.vkId, firstName: participant.firstName, lastName: participant.lastName },
    isCritical: true,
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
  const shiftId = await resolveAdminShiftId(req);
  const [created] = await db.insert(participants).values({
    vkId: Number(vkId),
    shiftId,
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
    // Keep denormalized participants.direction in sync with directions.name
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      await db.update(participants)
        .set({ direction: updated.name })
        .where(eq(participants.directionId, id));
    }
    res.json({ direction: updated });
  },
};

function slugifyTagName(name: string): string {
  const s = name.trim().toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || `tag-${Date.now()}`;
}

async function tagUsageCounts(tag: { id: number; name: string }) {
  const allEvents = await db.select({ tags: events.tags }).from(events);
  const allMats = await db.select({ tags: materials.tags }).from(materials);
  const allP = await db.select({ interests: participants.interests }).from(participants);
  const qCount = [{ count: 0 }];

  let eventsN = 0;
  for (const ev of allEvents) {
    const tags = Array.isArray(ev.tags) ? (ev.tags as string[]) : [];
    if (tags.includes(tag.name)) eventsN += 1;
  }
  let materialsN = 0;
  for (const m of allMats) {
    const tags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
    if (tags.includes(tag.name)) materialsN += 1;
  }
  let participantsN = 0;
  for (const p of allP) {
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    if (ints.includes(tag.name)) participantsN += 1;
  }
  return {
    events: eventsN,
    materials: materialsN,
    participants: participantsN,
    questions: qCount[0]?.count ?? 0,
  };
}

async function countTagNameLinks(tagName: string) {
  const allEvents = await db.select({ tags: events.tags }).from(events);
  const allMats = await db.select({ tags: materials.tags }).from(materials);
  const allP = await db.select({ interests: participants.interests }).from(participants);
  let eventsUpdated = 0;
  for (const ev of allEvents) {
    const tags = Array.isArray(ev.tags) ? (ev.tags as string[]) : [];
    if (tags.includes(tagName)) eventsUpdated += 1;
  }
  let materialsUpdated = 0;
  for (const m of allMats) {
    const tags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
    if (tags.includes(tagName)) materialsUpdated += 1;
  }
  let participantsUpdated = 0;
  for (const p of allP) {
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    if (ints.includes(tagName)) participantsUpdated += 1;
  }
  return { eventsUpdated, materialsUpdated, participantsUpdated };
}

async function rebindTagName(fromName: string, toName: string) {
  const allEvents = await db.select().from(events);
  let eventsUpdated = 0;
  for (const ev of allEvents) {
    const tags = Array.isArray(ev.tags) ? (ev.tags as string[]) : [];
    if (!tags.includes(fromName)) continue;
    const next = [...new Set(tags.map(t => (t === fromName ? toName : t)).filter(Boolean))];
    await db.update(events).set({ tags: next }).where(eq(events.id, ev.id));
    eventsUpdated++;
  }
  const allMats = await db.select().from(materials);
  let matsUpdated = 0;
  for (const m of allMats) {
    const tags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
    if (!tags.includes(fromName)) continue;
    const next = [...new Set(tags.map(t => (t === fromName ? toName : t)).filter(Boolean))];
    await db.update(materials).set({ tags: next }).where(eq(materials.id, m.id));
    matsUpdated++;
  }
  const allP = await db.select().from(participants);
  let participantsUpdated = 0;
  for (const p of allP) {
    const ints = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    if (!ints.includes(fromName)) continue;
    const next = [...new Set(ints.map(t => (t === fromName ? toName : t)).filter(Boolean))];
    await db.update(participants).set({ interests: next }).where(eq(participants.id, p.id));
    participantsUpdated++;
  }
  return { eventsUpdated, materialsUpdated: matsUpdated, participantsUpdated };
}

/** Убрать тег из событий / материалов / интересов участников. */
async function unlinkTagName(tagName: string) {
  return rebindTagName(tagName, '');
}

export const crudThematicTags = {
  list: async (req: AdminRequest, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const applicationType = typeof req.query.applicationType === 'string' ? req.query.applicationType : '';
    let tags = await db.select().from(thematicTags).orderBy(asc(thematicTags.sortOrder), asc(thematicTags.name));
    if (search) tags = tags.filter(t => t.name.toLowerCase().includes(search) || (t.slug ?? '').includes(search));
    if (applicationType) {
      tags = tags.filter(t => {
        const types = Array.isArray(t.applicationTypes) ? (t.applicationTypes as string[]) : [];
        return types.includes(applicationType);
      });
    }
    const withUsage = await Promise.all(tags.map(async t => ({
      ...t,
      usage: await tagUsageCounts(t),
    })));
    res.json({ tags: withUsage, total: withUsage.length });
  },
  create: async (req: AdminRequest, res: Response) => {
    const name = String(req.body.name || '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const slug = String(req.body.slug || slugifyTagName(name)).trim();
    const [t] = await db.insert(thematicTags).values({
      name,
      slug,
      description: req.body.description ?? null,
      color: req.body.color ?? null,
      isActive: req.body.isActive !== false,
      sortOrder: Number(req.body.sortOrder) || 0,
      applicationTypes: Array.isArray(req.body.applicationTypes) ? req.body.applicationTypes : ['events', 'interests'],
    }).returning();
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({ req, actionType: 'tag_create', section: 'recommendation-tags', objectId: t.id, newValue: t });
    res.json({ tag: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(thematicTags).where(eq(thematicTags.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }
    const patch: Partial<typeof thematicTags.$inferInsert> = {};
    const newName = req.body.name != null ? String(req.body.name).trim() : null;
    if (newName != null) {
      if (!newName) { res.status(400).json({ error: 'name required' }); return; }
      const dup = await db.select({ id: thematicTags.id }).from(thematicTags)
        .where(and(eq(thematicTags.name, newName), sql`${thematicTags.id} <> ${id}`)).limit(1);
      if (dup.length) {
        res.status(400).json({ error: 'Тег с таким названием уже есть' });
        return;
      }
      patch.name = newName;
      if (req.body.slug == null && newName !== before.name) {
        const nextSlug = slugifyTagName(newName);
        const slugTaken = await db.select({ id: thematicTags.id }).from(thematicTags)
          .where(and(eq(thematicTags.slug, nextSlug), sql`${thematicTags.id} <> ${id}`)).limit(1);
        if (!slugTaken.length) patch.slug = nextSlug;
      }
    }
    if (req.body.slug != null) patch.slug = String(req.body.slug).trim();
    if (req.body.description !== undefined) patch.description = req.body.description;
    if (req.body.color !== undefined) patch.color = req.body.color;
    if (req.body.isActive !== undefined) patch.isActive = !!req.body.isActive;
    if (req.body.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder);
    if (Array.isArray(req.body.applicationTypes)) patch.applicationTypes = req.body.applicationTypes;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const [updated] = await db.update(thematicTags).set(patch).where(eq(thematicTags.id, id)).returning();
    let rebind: Awaited<ReturnType<typeof rebindTagName>> | undefined;
    if (newName && newName !== before.name) {
      rebind = await rebindTagName(before.name, newName);
    }
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'tag_update', section: 'recommendation-tags', objectId: id,
      oldValue: before, newValue: { ...updated, rebind },
    });
    res.json({ tag: updated, rebind });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [tag] = await db.select().from(thematicTags).where(eq(thematicTags.id, id)).limit(1);
    if (!tag) { res.status(404).json({ error: 'Not found' }); return; }
    const usage = await tagUsageCounts(tag);
    const totalLinks = usage.events + usage.materials + usage.participants + Number(usage.questions);
    const force = req.query.force === '1' || req.query.force === 'true'
      || req.body?.force === true || req.body?.force === 1 || req.body?.force === '1';
    if (totalLinks > 0 && !force) {
      res.status(409).json({
        error: 'Tag has links',
        message: 'Тег используется. Удалите с force=1, чтобы снять его со всех связей.',
        usage,
      });
      return;
    }
    if (totalLinks > 0) {
      await unlinkTagName(tag.name);
    }
    const [deleted] = await db.delete(thematicTags).where(eq(thematicTags.id, id)).returning();
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'tag_delete', section: 'recommendation-tags', objectId: id,
      oldValue: { ...deleted, usage }, isCritical: true,
    });
    res.json({ ok: true, unlinked: totalLinks > 0, usage });
  },
  reorder: async (req: AdminRequest, res: Response) => {
    const order = Array.isArray(req.body.order) ? req.body.order as Array<{ id: number; sortOrder: number }> : [];
    for (const item of order) {
      await db.update(thematicTags).set({ sortOrder: item.sortOrder }).where(eq(thematicTags.id, item.id));
    }
    res.json({ ok: true });
  },
  mergePreview: async (req: AdminRequest, res: Response) => {
    const fromId = Number(req.body.fromId);
    const toId = Number(req.body.toId);
    const [from] = await db.select().from(thematicTags).where(eq(thematicTags.id, fromId)).limit(1);
    const [to] = await db.select().from(thematicTags).where(eq(thematicTags.id, toId)).limit(1);
    if (!from || !to) { res.status(404).json({ error: 'Tag not found' }); return; }
    const preview = await countTagNameLinks(from.name);
    res.json({ from, to, preview });
  },
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

    const preview = await rebindTagName(from.name, to.name);
    await db.delete(thematicTags).where(eq(thematicTags.id, fromId));
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'tag_merge', section: 'recommendation-tags', objectId: fromId,
      oldValue: { from: from.name, to: to.name }, newValue: preview, isCritical: true,
    });
    res.json({ ok: true, kept: to, removed: from.name, ...preview });
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

export const crudProgramBlockTypes = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ blockTypes: await db.select().from(programBlockTypes).orderBy(asc(programBlockTypes.sortOrder)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const key = String(req.body.key || '').trim();
    const name = String(req.body.name || '').trim();
    if (!key || !name) { res.status(400).json({ error: 'key and name required' }); return; }
    const [row] = await db.insert(programBlockTypes).values({
      key, name, sortOrder: Number(req.body.sortOrder) || 0,
    }).returning();
    res.json({ blockType: row });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const patch: Partial<typeof programBlockTypes.$inferInsert> = {};
    if (req.body.name != null) patch.name = String(req.body.name).trim();
    if (req.body.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder);
    const [updated] = await db.update(programBlockTypes).set(patch).where(eq(programBlockTypes.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ blockType: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(programBlockTypes).where(eq(programBlockTypes.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const crudProgramSpeakers = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ speakers: await db.select().from(programSpeakers).orderBy(asc(programSpeakers.name)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const name = String(req.body.name || '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const credentials = req.body.credentials != null ? String(req.body.credentials).trim() || null : null;
    const initialsRaw = req.body.initials ? String(req.body.initials).slice(0, 10) : null;
    const initials = initialsRaw || name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || null;
    const [row] = await db.insert(programSpeakers).values({
      name,
      credentials,
      initials,
    }).returning();
    res.json({ speaker: row });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const patch: { name?: string; credentials?: string | null; initials?: string | null } = {};
    if (req.body.name != null) patch.name = String(req.body.name).trim();
    if (req.body.credentials !== undefined) {
      patch.credentials = String(req.body.credentials || '').trim() || null;
    }
    if (req.body.initials !== undefined) {
      patch.initials = req.body.initials ? String(req.body.initials).slice(0, 10) : null;
    }
    const [updated] = await db.update(programSpeakers).set(patch).where(eq(programSpeakers.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ speaker: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(programSpeakers).where(eq(programSpeakers.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const updateForumSettings = async (req: AdminRequest, res: Response): Promise<void> => {
  const body = { ...req.body } as Record<string, unknown>;
  const shiftId = await resolveAdminShiftId(req);
  const current = await getShiftById(shiftId);
  if (!current) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  if (body.roleDiagnosticsConfig != null) {
    body.roleDiagnosticsConfig = normalizeOnboardingConfig({
      ...(current.roleDiagnosticsConfig as Record<string, unknown> | null),
      ...(body.roleDiagnosticsConfig as Record<string, unknown>),
    });
  }
  if (body.exchangeLimits !== undefined) {
    const {
      normalizeExchangeLimitsInput,
      syncExchangePointsToLevelsConfig,
    } = await import('../services/exchangeLimits.js');
    const normalized = normalizeExchangeLimitsInput(body.exchangeLimits);
    if (!normalized) {
      res.status(400).json({
        error: 'exchangeLimits: maxQuestionsTotal, maxAnswersForPoints, pointsPerQuestion, pointsPerAnswer required (0…10000)',
      });
      return;
    }
    body.exchangeLimits = normalized;
    await syncExchangePointsToLevelsConfig(normalized);
  }
  const shiftPatch = pickShiftOpPatch(body);
  const updated = Object.keys(shiftPatch).length
    ? await updateShift(shiftId, shiftPatch)
    : current;
  clearShiftCaches();
  const settings = updated ? shiftOpsToForumShape(updated) : shiftOpsToForumShape(current);
  res.json({ settings: { ...settings, shiftId } });
};

export const getAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const shiftId = await resolveAdminShiftId(req);
  const shift = await getShiftById(shiftId);
  const settings = shift ? shiftOpsToForumShape(shift) : null;
  const config = resolveEveningConfigForDay(settings as never, day);
  const opensAtMsk = getEveningOpensAtMsk(config);
  res.json({
    day,
    shiftId,
    config,
    defaultConfig: DEFAULT_EVENING_QUESTIONNAIRE_CONFIG,
    opensAtMsk,
    forcePublished: !!config.forcePublished,
    forceUnpublished: !!config.forceUnpublished,
    isOpenNow: isEveningOpenForConfig(config),
  });
};

export const patchAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const shiftId = await resolveAdminShiftId(req);
  const current = await getShiftById(shiftId);
  if (!current) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }

  const bodyConfig = req.body.config as EveningQuestionnaireConfig | undefined;
  const forcePublishedRaw = req.body.forcePublished;
  const forceUnpublishedRaw = req.body.forceUnpublished;
  const opensAtRaw = req.body.opensAtMsk;

  const byDay = {
    ...((current.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {}),
  };
  const existing = resolveEveningConfigForDay(shiftOpsToForumShape(current) as never, day);

  let next: EveningQuestionnaireConfig = bodyConfig?.steps?.length
    ? (day >= 1 && day <= 7 ? stripPointBFromEveningConfig(bodyConfig) : bodyConfig)
    : { ...existing };

  if (opensAtRaw !== undefined) {
    const normalized = normalizeOpensAtMsk(opensAtRaw === null || opensAtRaw === '' ? null : String(opensAtRaw));
    if (opensAtRaw && !normalized) {
      res.status(400).json({ error: 'opensAtMsk must be HH:MM' });
      return;
    }
    if (normalized) next = { ...next, opensAtMsk: normalized };
    else {
      const { opensAtMsk: _drop, ...rest } = next;
      next = rest;
    }
  } else if (bodyConfig && 'opensAtMsk' in bodyConfig) {
    const normalized = normalizeOpensAtMsk(bodyConfig.opensAtMsk);
    if (normalized) next = { ...next, opensAtMsk: normalized };
  } else if (existing.opensAtMsk) {
    next = { ...next, opensAtMsk: existing.opensAtMsk };
  }

  const hasForcePub = forcePublishedRaw === true || forcePublishedRaw === false;
  const hasForceUnpub = forceUnpublishedRaw === true || forceUnpublishedRaw === false;

  if (hasForcePub || hasForceUnpub) {
    // Explicit publish controls from admin toolbar — mutually exclusive.
    let forcePublished = hasForcePub ? forcePublishedRaw === true : !!existing.forcePublished;
    let forceUnpublished = hasForceUnpub ? forceUnpublishedRaw === true : !!existing.forceUnpublished;
    if (forcePublishedRaw === true) forceUnpublished = false;
    if (forceUnpublishedRaw === true) forcePublished = false;
    if (forcePublishedRaw === false && forceUnpublishedRaw === false) {
      forcePublished = false;
      forceUnpublished = false;
    }
    const { forcePublished: _fp, forceUnpublished: _fu, ...rest } = next;
    next = {
      ...rest,
      ...(forcePublished ? { forcePublished: true } : {}),
      ...(forceUnpublished ? { forceUnpublished: true } : {}),
    };
  } else {
    if (bodyConfig?.forcePublished) next = { ...next, forcePublished: true };
    else if (existing.forcePublished) next = { ...next, forcePublished: true };
    if (bodyConfig?.forceUnpublished) {
      const { forcePublished: _fp, ...rest } = { ...next, forceUnpublished: true as const };
      next = rest;
    } else if (existing.forceUnpublished && !next.forcePublished) {
      next = { ...next, forceUnpublished: true };
    }
  }

  if (!next.steps?.length) {
    res.status(400).json({ error: 'config.steps required' });
    return;
  }

  byDay[String(day)] = next;
  const updated = await updateShift(shiftId, { eveningQuestionnaireByDay: byDay });
  clearShiftCaches();
  const shape = updated ? shiftOpsToForumShape(updated) : shiftOpsToForumShape(current);
  const resolved = resolveEveningConfigForDay(shape as never, day);
  res.json({
    ok: true,
    shiftId,
    config: resolved,
    opensAtMsk: getEveningOpensAtMsk(resolved),
    forcePublished: !!resolved.forcePublished,
    forceUnpublished: !!resolved.forceUnpublished,
    isOpenNow: isEveningOpenForConfig(resolved),
  });
};

export const copyAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const fromDay = Math.max(1, Math.min(7, Number(req.body.fromDay) || 1));
  const toDay = Math.max(1, Math.min(7, Number(req.body.toDay) || 1));
  const shiftId = await resolveAdminShiftId(req);
  const current = await getShiftById(shiftId);
  if (!current) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  const shape = shiftOpsToForumShape(current);
  const src = resolveEveningConfigForDay(shape as never, fromDay);
  const byDay = {
    ...((current.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {}),
  };
  byDay[String(toDay)] = src;
  const updated = await updateShift(shiftId, { eveningQuestionnaireByDay: byDay });
  clearShiftCaches();
  const nextShape = updated ? shiftOpsToForumShape(updated) : shape;
  res.json({
    ok: true,
    toDay,
    config: resolveEveningConfigForDay(nextShape as never, toDay),
  });
};

export const resetAdminEveningQuestionnaire = async (req: AdminRequest, res: Response): Promise<void> => {
  const day = Math.max(1, Math.min(7, Number(req.query.day) || 1));
  const shiftId = await resolveAdminShiftId(req);
  const current = await getShiftById(shiftId);
  if (!current) {
    res.status(404).json({ error: 'Shift not found' });
    return;
  }
  const byDay = {
    ...((current.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {}),
  };
  delete byDay[String(day)];
  const updated = await updateShift(shiftId, {
    eveningQuestionnaireByDay: Object.keys(byDay).length ? byDay : null,
  });
  clearShiftCaches();
  const shape = updated ? shiftOpsToForumShape(updated) : shiftOpsToForumShape(current);
  res.json({ config: resolveEveningConfigForDay(shape as never, day) });
};

export const upsertDayFocus = async (req: AdminRequest, res: Response): Promise<void> => {
  const { dayNumber, title, text, textHtml, keyQuestion } = req.body;
  const shiftId = await resolveAdminShiftId(req);
  const html = typeof textHtml === 'string' ? textHtml : null;
  const plain = typeof text === 'string'
    ? text
    : (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null);
  const [existing] = await db.select().from(dayFocus).where(and(
    eq(dayFocus.dayNumber, dayNumber),
    eq(dayFocus.shiftId, shiftId),
  )).limit(1);
  if (existing) {
    const [updated] = await db.update(dayFocus)
      .set({ title, text: plain, textHtml: html, keyQuestion })
      .where(eq(dayFocus.id, existing.id)).returning();
    res.json({ focus: updated });
  } else {
    const [created] = await db.insert(dayFocus).values({
      dayNumber, title, text: plain, textHtml: html, keyQuestion, shiftId,
    }).returning();
    res.json({ focus: created });
  }
};

export const listDayFocus = async (req: AdminRequest, res: Response): Promise<void> => {
  const shiftId = await resolveAdminShiftId(req);
  const list = await db.select().from(dayFocus)
    .where(eq(dayFocus.shiftId, shiftId))
    .orderBy(dayFocus.dayNumber);
  res.json({ focus: list });
};

export const crudEvents = {
  list: async (req: AdminRequest, res: Response) => {
    const shiftId = await resolveAdminShiftId(req);
    const day = req.query.day ? Number(req.query.day) : null;
    let rows = await db.select().from(events).where(eq(events.shiftId, shiftId));
    if (day && !Number.isNaN(day)) {
      rows = rows.filter(e => e.dayNumber === day);
    }
    const speakers = await db.select().from(programSpeakers);
    const speakerMap = new Map(speakers.map(s => [s.id, s]));
    const withSpeakers = rows.map(e => {
      const ids = Array.isArray(e.speakerIds) ? (e.speakerIds as number[]) : [];
      return {
        ...e,
        speakers: ids.map(id => speakerMap.get(id)).filter(Boolean),
      };
    });
    res.json({ events: attachEventChildren(withSpeakers) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(eventCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const shiftId = await resolveAdminShiftId(req);
    const parentEventId = parsed.data.parentEventId ?? null;
    if (parentEventId) {
      const shiftRows = await db.select({
        id: events.id,
        parentEventId: events.parentEventId,
        shiftId: events.shiftId,
        dayNumber: events.dayNumber,
      }).from(events).where(eq(events.shiftId, shiftId));
      const byId = new Map(shiftRows.map(r => [r.id, r]));
      const parent = byId.get(parentEventId);
      if (!parent) {
        res.status(400).json({ error: 'Родительский блок не найден' });
        return;
      }
      const dayNum = parsed.data.dayNumber ?? parent.dayNumber ?? null;
      if (dayNum != null && parent.dayNumber != null && dayNum !== parent.dayNumber) {
        res.status(400).json({ error: 'Подблок должен быть в том же дне, что и родитель' });
        return;
      }
      const depth = childDepthOfParent(parentEventId, byId);
      if (depth > MAX_EVENT_DEPTH) {
        res.status(400).json({ error: `Максимум ${MAX_EVENT_DEPTH} уровней вложенности` });
        return;
      }
    }
    const settings = await loadForumSettings();
    const values = enrichEventTimestamps(parsed.data, settings);
    const dayNum = parsed.data.dayNumber ?? values.dayNumber ?? null;
    const dayPublished = await resolveDayPublishedForEvent(
      dayNum,
      parsed.data.isPublished,
      parsed.data.dayPublished,
      shiftId,
    );
    const audience = audienceWriteFields({
      audienceDirectionIds: parsed.data.audienceDirectionIds,
      audienceType: parsed.data.audienceType,
      audienceDirectionId: parsed.data.audienceDirectionId ?? null,
    });
    const [e] = await db.insert(events).values({
      ...values,
      shiftId,
      ...(dayPublished !== undefined ? { dayPublished } : {}),
      speakerIds: parsed.data.speakerIds ?? [],
      parentEventId,
      hasSubSessions: parsed.data.hasSubSessions ?? false,
      audienceType: audience.audienceType,
      audienceDirectionId: audience.audienceDirectionId,
      audienceDirectionIds: audience.audienceDirectionIds,
      sortOrder: parsed.data.sortOrder ?? 0,
    }).returning();
    if (parentEventId) {
      await db.update(events).set({ hasSubSessions: true }).where(eq(events.id, parentEventId));
    }
    clearCache('events_day_');
    res.json({ event: e });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(eventUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    if (parsed.data.parentEventId !== undefined) {
      const newParentId = parsed.data.parentEventId;
      const shiftRows = await db.select({
        id: events.id,
        parentEventId: events.parentEventId,
        dayNumber: events.dayNumber,
      }).from(events).where(eq(events.shiftId, existing.shiftId));
      const byId = new Map(shiftRows.map(r => [r.id, r]));
      if (newParentId) {
        const parent = byId.get(newParentId);
        if (!parent) {
          res.status(400).json({ error: 'Родительский блок не найден' });
          return;
        }
        if (wouldCreateCycle(id, newParentId, byId)) {
          res.status(400).json({ error: 'Нельзя сделать блок потомком самого себя' });
          return;
        }
        const depth = childDepthOfParent(newParentId, byId);
        if (depth > MAX_EVENT_DEPTH) {
          res.status(400).json({ error: `Максимум ${MAX_EVENT_DEPTH} уровней вложенности` });
          return;
        }
        const descendants = collectDescendantIds(id, shiftRows);
        let maxRelative = 0;
        for (const did of descendants) {
          let rel = 0;
          let cur = byId.get(did);
          const seen = new Set<number>();
          while (cur && cur.id !== id) {
            if (seen.has(cur.id)) break;
            seen.add(cur.id);
            rel += 1;
            if (!cur.parentEventId) break;
            cur = byId.get(cur.parentEventId);
          }
          maxRelative = Math.max(maxRelative, rel);
        }
        if (depth + maxRelative > MAX_EVENT_DEPTH) {
          res.status(400).json({ error: `Максимум ${MAX_EVENT_DEPTH} уровней вложенности` });
          return;
        }
      }
    }
    const settings = await loadForumSettings();
    let values = enrichEventTimestamps(parsed.data, settings, existing);
    if (parsed.data.timeSlot !== undefined && !String(parsed.data.timeSlot || '').trim()) {
      values = { ...values, timeSlot: null, startTime: null, endTime: null };
    }
    const dayNum = parsed.data.dayNumber ?? existing.dayNumber ?? null;
    const dayPublished = await resolveDayPublishedForEvent(
      dayNum,
      parsed.data.isPublished,
      parsed.data.dayPublished,
      existing.shiftId,
    );
    let tagValues = values;
    if (parsed.data.tags && Array.isArray(parsed.data.tags)) {
      const { ensureThematicTagRegistry } = await import('../services/thematicTagRegistry.js');
      tagValues = { ...values, tags: await ensureThematicTagRegistry(parsed.data.tags as string[]) };
    }
    const [updated] = await db.update(events).set({
      ...tagValues,
      ...(parsed.data.place !== undefined ? { place: parsed.data.place } : {}),
      ...(parsed.data.descriptionHtml !== undefined ? { descriptionHtml: parsed.data.descriptionHtml } : {}),
      ...(dayPublished !== undefined ? { dayPublished } : {}),
      ...(parsed.data.speakerIds !== undefined ? { speakerIds: parsed.data.speakerIds } : {}),
      ...(parsed.data.parentEventId !== undefined ? { parentEventId: parsed.data.parentEventId } : {}),
      ...(parsed.data.hasSubSessions !== undefined ? { hasSubSessions: parsed.data.hasSubSessions } : {}),
      ...((
        parsed.data.audienceDirectionIds !== undefined
        || parsed.data.audienceType !== undefined
        || parsed.data.audienceDirectionId !== undefined
      ) ? audienceWriteFields({
        audienceDirectionIds: parsed.data.audienceDirectionIds,
        audienceType: parsed.data.audienceType,
        audienceDirectionId: parsed.data.audienceDirectionId ?? null,
      }) : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    }).where(eq(events.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    if (parsed.data.parentEventId) {
      await db.update(events).set({ hasSubSessions: true }).where(eq(events.id, parsed.data.parentEventId));
    }
    clearCache('events_day_');
    res.json({ event: updated });
  },
  duplicate: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const targetDay = Number(req.body.targetDayNumber ?? req.body.dayNumber);
    if (!targetDay || Number.isNaN(targetDay)) {
      res.status(400).json({ error: 'targetDayNumber required' });
      return;
    }
    const [src] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }
    const shiftRows = await db.select().from(events).where(eq(events.shiftId, src.shiftId));
    const descendantIds = collectDescendantIds(id, shiftRows);
    const subtree = shiftRows.filter(e => e.id === id || descendantIds.includes(e.id));
    const idMap = new Map<number, number>();

    const publishFlagsFor = async (isPublished: boolean | null | undefined) => {
      const published = isPublished === true;
      const dayPublished = await resolveDayPublishedForEvent(
        targetDay,
        published,
        undefined,
        src.shiftId,
      );
      return {
        isPublished: published,
        dayPublished: published ? (dayPublished === true) : false,
      };
    };

    // Insert roots of subtree first (the duplicated node as new root on target day), then children by BFS
    const { id: _id, qrToken, ...rest } = src;
    const rootFlags = await publishFlagsFor(src.isPublished);
    const [copy] = await db.insert(events).values({
      ...rest,
      dayNumber: targetDay,
      ...rootFlags,
      parentEventId: null,
      qrToken: null,
    }).returning();
    idMap.set(id, copy.id);

    let queue = descendantIds.slice();
    while (queue.length) {
      const still: number[] = [];
      let progress = false;
      for (const nextId of queue) {
        const node = subtree.find(e => e.id === nextId);
        if (!node?.parentEventId) continue;
        const mappedParent = idMap.get(node.parentEventId);
        if (!mappedParent) {
          still.push(nextId);
          continue;
        }
        const { id: cid, qrToken: _q, parentEventId: _p, ...chRest } = node;
        const childFlags = await publishFlagsFor(node.isPublished);
        const [created] = await db.insert(events).values({
          ...chRest,
          dayNumber: targetDay,
          parentEventId: mappedParent,
          ...childFlags,
          qrToken: null,
        }).returning();
        idMap.set(nextId, created.id);
        progress = true;
      }
      if (!progress && still.length) {
        res.status(500).json({ error: 'Не удалось скопировать вложенные блоки (битая иерархия)' });
        return;
      }
      queue = still;
    }
    clearCache('events_day_');
    res.json({ event: copy });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const shiftRows = await db.select({ id: events.id, parentEventId: events.parentEventId })
      .from(events).where(eq(events.shiftId, existing.shiftId));
    const descendantIds = collectDescendantIds(id, shiftRows);
    // Delete deepest first
    const toDelete = [...descendantIds].reverse().concat(id);
    for (const eid of toDelete) {
      await db.delete(eventAttendance).where(eq(eventAttendance.eventId, eid));
      await db.update(materials).set({ eventId: null }).where(eq(materials.eventId, eid));
      await db.delete(events).where(eq(events.id, eid));
    }
    if (existing.parentEventId) {
      const remaining = await db.select({ id: events.id }).from(events)
        .where(eq(events.parentEventId, existing.parentEventId)).limit(1);
      if (remaining.length === 0) {
        await db.update(events).set({ hasSubSessions: false }).where(eq(events.id, existing.parentEventId));
      }
    }
    clearCache('events_day_');
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'event_delete', section: 'events', objectId: id,
      oldValue: existing, isCritical: true,
    });
    res.json({ ok: true });
  },
};

async function resolveTaskCategoryName(categoryId: number | null | undefined): Promise<string | null> {
  if (!categoryId) return null;
  const [c] = await db.select().from(taskCategories).where(eq(taskCategories.id, categoryId)).limit(1);
  return c?.name ?? null;
}

async function buildTaskInsertValues(raw: Record<string, unknown>): Promise<typeof tasks.$inferInsert> {
  const body = { ...raw } as Record<string, unknown>;
  if (!body.status) body.status = 'draft';
  const enriched = enrichTaskWritePayload(body);
  if (!enriched.confirmationMethods?.length && body.confirmationType) {
    enriched.confirmationMethods = methodsFromLegacy({
      confirmationType: String(body.confirmationType),
      autoConfirm: body.autoConfirm as boolean | undefined,
    });
    enriched.confirmationType = String(body.confirmationType);
  }
  if (!enriched.dayNumbers?.length) {
    enriched.dayNumbers = normalizeDayNumbers(body.dayNumbers, body.dayNumber != null ? Number(body.dayNumber) : 1);
    enriched.dayNumber = enriched.dayNumbers[0] ?? 1;
  }
  if (body.categoryId != null) {
    enriched.categoryId = Number(body.categoryId);
    enriched.category = await resolveTaskCategoryName(enriched.categoryId) ?? undefined;
  }
  if (enriched.status === 'published' && !enriched.publishTime && !body.publishTime) {
    enriched.publishTime = new Date();
  }
  const { requiresModeration: _rm, ...rest } = body;
  const merged = { ...rest, ...enriched };
  delete (merged as Record<string, unknown>).requiresModeration;
  return merged as typeof tasks.$inferInsert;
}

function serializeAdminTaskRow(
  row: typeof tasks.$inferSelect,
  cat: typeof taskCategories.$inferSelect | null,
  stats: { completionCount: number; pendingCount: number },
) {
  const methods = taskMethodsForParticipant(row);
  return {
    ...row,
    categoryName: cat?.name ?? row.category,
    categoryIconKey: cat?.iconKey ?? row.iconKey,
    confirmationMethods: methods,
    completionCount: stats.completionCount,
    pendingModerationCount: stats.pendingCount,
  };
}

export const crudTaskCategories = {
  list: async (_req: AdminRequest, res: Response) => {
    const categories = await db.select().from(taskCategories).orderBy(asc(taskCategories.sortOrder), asc(taskCategories.name));
    res.json({ categories });
  },
  create: async (req: AdminRequest, res: Response) => {
    const name = String(req.body.name || '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const [category] = await db.insert(taskCategories).values({
      name,
      iconKey: req.body.iconKey ? String(req.body.iconKey) : null,
      sortOrder: req.body.sortOrder != null ? Number(req.body.sortOrder) : 0,
    }).returning();
    res.json({ category });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const [prev] = await db.select().from(taskCategories).where(eq(taskCategories.id, id)).limit(1);
    if (!prev) { res.status(404).json({ error: 'Not found' }); return; }
    const [updated] = await db.update(taskCategories).set({
      name,
      iconKey: req.body.iconKey != null ? String(req.body.iconKey) : prev.iconKey,
      sortOrder: req.body.sortOrder != null ? Number(req.body.sortOrder) : prev.sortOrder,
    }).where(eq(taskCategories.id, id)).returning();
    if (prev.name !== name) {
      await db.update(tasks).set({ category: name }).where(eq(tasks.categoryId, id));
    }
    res.json({ category: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [{ cnt }] = await db.select({ cnt: count() }).from(tasks).where(eq(tasks.categoryId, id));
    if (Number(cnt) > 0) {
      res.status(400).json({ error: 'Category is used by tasks' });
      return;
    }
    await db.delete(taskCategories).where(eq(taskCategories.id, id));
    res.json({ ok: true });
  },
};

export const crudTasks = {
  list: async (req: AdminRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const day = req.query.day ? Number(req.query.day) : undefined;
    const confirmationMethod = req.query.confirmationMethod as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();
    const includeHidden = req.query.includeHidden === 'true';
    const shiftId = await resolveAdminShiftId(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = req.query.limit;
    /** Without `limit` — return all (dropdowns / legacy). With `limit` — page size 1…500. */
    const limit = limitRaw == null || limitRaw === ''
      ? null
      : Math.max(1, Math.min(500, Number(limitRaw) || 50));

    const conditions: ReturnType<typeof eq>[] = [eq(tasks.shiftId, shiftId)];
    if (status) conditions.push(eq(tasks.status, status));
    if (categoryId && !Number.isNaN(categoryId)) conditions.push(eq(tasks.categoryId, categoryId));
    if (day && !Number.isNaN(day)) {
      conditions.push(or(
        eq(tasks.dayNumber, day),
        sql`${tasks.dayNumbers} @> ${JSON.stringify([day])}::jsonb`,
      )!);
    }
    if (confirmationMethod) {
      conditions.push(sql`${tasks.confirmationMethods} @> ${JSON.stringify([confirmationMethod])}::jsonb`);
    }
    if (!includeHidden) conditions.push(or(eq(tasks.isHidden, false), isNull(tasks.isHidden))!);
    if (q) {
      conditions.push(or(
        ilike(tasks.title, `%${q}%`),
        ilike(tasks.category, `%${q}%`),
        ilike(tasks.description, `%${q}%`),
      )!);
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const [totalRow] = await db.select({ cnt: count() }).from(tasks).where(where);
    const totalCount = Number(totalRow?.cnt ?? 0);

    const baseQuery = db.select({
      task: tasks,
      category: taskCategories,
    }).from(tasks)
      .leftJoin(taskCategories, eq(tasks.categoryId, taskCategories.id))
      .where(where)
      .orderBy(asc(tasks.id));

    const rows = limit != null
      ? await baseQuery.limit(limit).offset((page - 1) * limit)
      : await baseQuery;

    const taskIds = rows.map(r => r.task.id);
    const statsMap = new Map<number, { completionCount: number; pendingCount: number }>();
    for (const id of taskIds) statsMap.set(id, { completionCount: 0, pendingCount: 0 });

    if (taskIds.length) {
      const approved = await db.select({
        taskId: taskSubmissions.taskId,
        cnt: count(),
      }).from(taskSubmissions)
        .where(and(inArray(taskSubmissions.taskId, taskIds), eq(taskSubmissions.status, 'approved')))
        .groupBy(taskSubmissions.taskId);
      for (const r of approved) {
        const s = statsMap.get(r.taskId)!;
        s.completionCount = Number(r.cnt);
      }
      const pending = await db.select({
        taskId: taskSubmissions.taskId,
        cnt: count(),
      }).from(taskSubmissions)
        .where(and(inArray(taskSubmissions.taskId, taskIds), eq(taskSubmissions.status, 'pending')))
        .groupBy(taskSubmissions.taskId);
      for (const r of pending) {
        const s = statsMap.get(r.taskId)!;
        s.pendingCount = Number(r.cnt);
      }
    }

    res.json({
      tasks: rows.map(r => serializeAdminTaskRow(
        r.task,
        r.category,
        statsMap.get(r.task.id) ?? { completionCount: 0, pendingCount: 0 },
      )),
      totalCount,
      page,
      limit: limit ?? totalCount,
    });
  },
  create: async (req: AdminRequest, res: Response) => {
    const parsed = parseBody(taskCreateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const shiftId = await resolveAdminShiftId(req);
    const values = await buildTaskInsertValues(parsed.data as Record<string, unknown>);
    if (values.status === 'published' && !values.qrToken && (values.confirmationMethods as string[] | undefined)?.includes('qr')) {
      values.qrToken = await allocateTaskQrCode();
    }
    const [t] = await db.insert(tasks).values({ ...values, shiftId }).returning();
    res.json({ task: t });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const parsed = parseBody(taskUpdateSchema, req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: 'Not found' }); return; }
    const enriched = enrichTaskWritePayload(parsed.data as Record<string, unknown>, before);
    const patch = { ...parsed.data, ...enriched } as Partial<typeof tasks.$inferInsert>;
    delete (patch as Record<string, unknown>).requiresModeration;
    if (patch.categoryId != null) {
      patch.category = await resolveTaskCategoryName(patch.categoryId) ?? before.category;
    }
    if (patch.status === 'published' && !patch.publishTime && !before.publishTime) {
      patch.publishTime = new Date();
    }
    const methods = normalizeConfirmationMethods(
      (patch.confirmationMethods as string[] | undefined) ?? before.confirmationMethods ?? [],
    );
    if (methods.includes('qr') && !before.qrToken && !(patch as { qrToken?: string }).qrToken) {
      patch.qrToken = await allocateTaskQrCode();
    }
    const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    const now = new Date();
    const wasPublished = before.status === 'published';
    const isPublished = updated?.status === 'published';
    const publishJustHappened = isPublished && (!wasPublished || (updated.publishTime && before.publishTime && updated.publishTime > before.publishTime));
    if (updated?.pushOnPublish && isPublished && publishJustHappened) {
      const { pushCopy } = await import('../services/pushCopy.js');
      await notifyAllParticipants(pushCopy.taskPublished(updated.title), 'task_publish');
    }
    if (isPublished && publishJustHappened) {
      try {
        const { fireTaskPublishTrigger } = await import('../services/pushTriggerRunner.js');
        await fireTaskPublishTrigger(id, now);
      } catch {
        // tables may not exist yet
      }
    }
    res.json({ task: updated });
  },
  duplicate: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [src] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }
    const { id: _id, qrToken, createdAt, ...rest } = src;
    const methods = normalizeConfirmationMethods(src.confirmationMethods?.length ? src.confirmationMethods : methodsFromLegacy(src));
    const [copy] = await db.insert(tasks).values({
      ...rest,
      title: `${src.title} (копия)`,
      status: 'draft',
      publishTime: null,
      isHidden: false,
      qrToken: methods.includes('qr') ? await allocateTaskQrCode() : null,
      confirmationMethods: methods,
    }).returning();
    res.json({ task: copy });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    await db.delete(taskSubmissions).where(eq(taskSubmissions.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'task_delete', section: 'tasks', objectId: id,
      oldValue: existing, isCritical: true,
    });
    res.json({ ok: true });
  },
  bulkAction: async (req: AdminRequest, res: Response) => {
    const { bulkTasksSchema } = await import('../validation/adminSchemas.js');
    const parsed = bulkTasksSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { ids, action } = parsed.data;

    if (action === 'delete') {
      await db.delete(taskSubmissions).where(inArray(taskSubmissions.taskId, ids));
      await db.delete(tasks).where(inArray(tasks.id, ids));
    } else if (action === 'hide') {
      await db.update(tasks).set({ isHidden: true }).where(inArray(tasks.id, ids));
    } else if (action === 'unhide') {
      await db.update(tasks).set({ isHidden: false }).where(inArray(tasks.id, ids));
    } else if (action === 'publish') {
      await db.update(tasks).set({ status: 'published', isHidden: false }).where(inArray(tasks.id, ids));
    } else if (action === 'draft') {
      await db.update(tasks).set({ status: 'draft' }).where(inArray(tasks.id, ids));
    }

    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req,
      actionType: 'tasks_bulk_action',
      section: 'tasks',
      objectId: ids.join(','),
      newValue: { action, count: ids.length },
    });

    res.json({ ok: true });
  },
};

export {
  crudQuestions,
  copyQuestionsSelected,
  getPracticesResults,
  publishPracticesResults,
  unpublishPracticesResults,
  revokeQuestionPoints,
  backfillQuestionPoints,
} from './questionAdminController.js';

/** Скопировать вопросы с дня fromDay на toDay */
export const copyQuestionsDay = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(copyQuestionsDaySchema, req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const { fromDay, toDay, overwrite } = parsed.data;
  if (fromDay === toDay) { res.status(400).json({ error: 'fromDay and toDay must differ' }); return; }

  const shiftId = await resolveAdminShiftId(req);
  const source = await db.select().from(questions).where(and(
    eq(questions.dayNumber, fromDay),
    eq(questions.shiftId, shiftId),
  ));
  if (source.length === 0) { res.status(404).json({ error: 'No questions on fromDay' }); return; }

  if (overwrite) {
    const targets = await db.select().from(questions).where(and(
      eq(questions.dayNumber, toDay),
      eq(questions.shiftId, shiftId),
    ));
    for (const t of targets) {
      await db.delete(answers).where(eq(answers.questionId, t.id));
      await db.delete(questionOptions).where(eq(questionOptions.questionId, t.id));
      await db.delete(questions).where(eq(questions.id, t.id));
    }
  }

  const settings = await loadForumSettings();
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
      shiftId,
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
  if (settings && fromDay >= 1 && fromDay <= 7 && toDay >= 1 && toDay <= 7) {
    const srcEvening = resolveEveningConfigForDay(settings, fromDay);
    const byDay = (settings.eveningQuestionnaireByDay as Record<string, EveningQuestionnaireConfig> | null) || {};
    byDay[String(toDay)] = srcEvening;
    await db.update(forumSettings)
      .set({ eveningQuestionnaireByDay: byDay, updatedAt: new Date() })
      .where(eq(forumSettings.id, settings.id));
    clearCache('forumSettings');
  }
  res.json({ ok: true, created: created.length, questions: created, eveningQuestionnaireCopied: fromDay <= 7 && toDay <= 7 });
};

/** Развернуть шаблон 7 точек на выбранные дни */
export const seedTouchpointsTemplate = async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = parseBody(seedTouchpointsSchema, req.body ?? {});
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const days = parsed.data.days ?? [1, 2, 3, 4, 5, 6, 7];
  const overwrite = parsed.data.overwrite;
  const shiftId = await resolveAdminShiftId(req);

  const settings = await loadForumSettings();
  const startDate = settings?.startDate || new Date('2026-08-12T00:00:00');
  let created = 0;

  for (const day of days) {
    if (overwrite) {
      const existing = await db.select().from(questions).where(and(
        eq(questions.dayNumber, day),
        eq(questions.shiftId, shiftId),
      ));
      for (const q of existing) {
        if (!TOUCHPOINT_SLOTS.some(s => s.title === q.title)) continue;
        await db.delete(answers).where(eq(answers.questionId, q.id));
        await db.delete(questionOptions).where(eq(questionOptions.questionId, q.id));
        await db.delete(questions).where(eq(questions.id, q.id));
      }
    }
    const existing = await db.select().from(questions).where(and(
      eq(questions.dayNumber, day),
      eq(questions.shiftId, shiftId),
    ));
    for (const slot of TOUCHPOINT_SLOTS) {
      if (existing.some(q => q.title === slot.title) && !overwrite) continue;
      const { publishTime, closeTime } = windowsForDay(startDate, day, slot);
      const questionKind = slot.block === 'Итоги дня'
        ? 'day_summary'
        : slot.block === 'Проверка состояния' || slot.type === 'checkin'
          ? 'state_check'
          : slot.block === 'Точки осмысления'
            ? 'after_blocks'
            : null;
      const reflectionKind = questionKind === 'day_summary'
        ? 'evening_summary'
        : questionKind === 'state_check'
          ? 'state_check'
          : null;
      await db.insert(questions).values({
        shiftId,
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
        ...(questionKind ? { questionKind } : {}),
        ...(reflectionKind ? { reflectionKind } : {}),
      });
      created++;
    }
  }
  res.json({ ok: true, created, days });
};

export const moderateTask = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid submission id' });
    return;
  }

  const body = req.body ?? {};
  const status = body.status as 'approved' | 'rejected' | undefined;
  const hasAnswerPatch = 'answerText' in body || 'photoUrl' in body || 'postUrl' in body;
  const hasCommentPatch = 'moderatorComment' in body;

  if (status !== undefined && status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: 'status must be approved or rejected' });
    return;
  }
  if (!status && !hasAnswerPatch && !hasCommentPatch) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  const [existing] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }

  if (hasAnswerPatch || (hasCommentPatch && !status)) {
    const { normalizePostUrl } = await import('../services/taskEligibility.js');
    const patch: {
      answerText?: string | null;
      photoUrl?: string | null;
      postUrl?: string | null;
      postUrlNormalized?: string | null;
      moderatorComment?: string | null;
    } = {};
    if ('answerText' in body) {
      const v = body.answerText;
      patch.answerText = v == null || v === '' ? null : String(v);
    }
    if ('photoUrl' in body) {
      const v = body.photoUrl;
      patch.photoUrl = v == null || v === '' ? null : String(v).slice(0, 500);
    }
    if ('postUrl' in body) {
      const v = body.postUrl;
      const postUrl = v == null || v === '' ? null : String(v).slice(0, 500);
      patch.postUrl = postUrl;
      patch.postUrlNormalized = postUrl ? normalizePostUrl(postUrl) : null;
    }
    if (hasCommentPatch && !status) {
      const v = body.moderatorComment;
      patch.moderatorComment = v == null || v === '' ? null : String(v);
    }
    if (Object.keys(patch).length > 0) {
      await db.update(taskSubmissions).set(patch).where(eq(taskSubmissions.id, id));
    }
  }

  let submission = existing;
  if (status === 'approved' || status === 'rejected') {
    const { applyTaskModeration } = await import('../services/taskModerationService.js');
    const result = await applyTaskModeration(id, status, body.moderatorComment, req.adminId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    submission = result.submission;
  } else {
    const [updated] = await db.select().from(taskSubmissions).where(eq(taskSubmissions.id, id)).limit(1);
    submission = updated ?? existing;
  }

  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: status ? 'task_moderate' : 'task_submission_edit',
    section: 'moderation',
    objectId: id,
    newValue: {
      status: status ?? submission.status,
      moderatorComment: body.moderatorComment,
      answerText: hasAnswerPatch ? body.answerText : undefined,
      photoUrl: hasAnswerPatch ? body.photoUrl : undefined,
      postUrl: hasAnswerPatch ? body.postUrl : undefined,
    },
    isCritical: Boolean(status),
  });
  res.json({ submission: enrichSubmissionRow(submission) });
};

export const bulkModerateTasks = async (req: AdminRequest, res: Response): Promise<void> => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const status = req.body?.status as 'approved' | 'rejected';
  const moderatorComment = req.body?.moderatorComment as string | undefined;
  if (!ids.length) {
    res.status(400).json({ error: 'ids required' });
    return;
  }
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: 'status must be approved or rejected' });
    return;
  }
  const { applyTaskModeration } = await import('../services/taskModerationService.js');
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const result = await applyTaskModeration(
      id,
      status,
      status === 'rejected' ? (moderatorComment || 'Не принято') : undefined,
      req.adminId,
    );
    results.push({ id, ok: result.ok, error: result.ok ? undefined : result.error });
  }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'task_moderate_bulk',
    section: 'moderation',
    newValue: { status, count: ids.length, failed: results.filter(r => !r.ok).length },
  });
  res.json({ results, okCount: results.filter(r => r.ok).length });
};

export const getModerationSummary = async (_req: AdminRequest, res: Response): Promise<void> => {
  const [exchangeRow] = await db.select({ count: count() }).from(exchangeQuestions)
    .where(eq(exchangeQuestions.moderationStatus, 'pending'));
  const [tasksRow] = await db.select({ count: count() }).from(taskSubmissions)
    .where(or(
      eq(taskSubmissions.status, 'pending'),
      eq(taskSubmissions.status, 'pending_team'),
    ));
  res.json({
    pendingExchange: exchangeRow?.count ?? 0,
    pendingTasks: tasksRow?.count ?? 0,
  });
};

export const moderateExchange = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { moderationStatus, moderatorComment, rejectReason } = req.body;
  const comment = moderatorComment ?? rejectReason;

  if (!['approved', 'rejected', 'pending'].includes(String(moderationStatus || ''))) {
    res.status(400).json({ error: 'moderationStatus must be approved, rejected or pending' });
    return;
  }

  const [before] = await db.select().from(exchangeQuestions).where(eq(exchangeQuestions.id, id)).limit(1);
  if (!before) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  const patch: { moderationStatus: string; moderatorComment?: string | null } = { moderationStatus };
  if (moderationStatus === 'rejected') {
    patch.moderatorComment = comment != null ? String(comment).slice(0, 500) : before.moderatorComment;
  } else if (moderationStatus === 'approved') {
    patch.moderatorComment = null;
  }

  const [updated] = await db.update(exchangeQuestions)
    .set(patch)
    .where(eq(exchangeQuestions.id, id)).returning();

  if (moderationStatus === 'approved' && before.moderationStatus !== 'approved' && updated) {
    const { awardPoints } = await import('../services/pointsService.js');
    const { getExchangeLimitsConfig } = await import('../services/exchangeLimits.js');
    const exchangeCfg = await getExchangeLimitsConfig();
    await awardPoints(
      updated.participantId,
      'exchange_question',
      exchangeCfg.pointsPerQuestion,
      undefined,
      { ignoreMaxAccruals: true },
    );
  }

  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'exchange_moderate',
    section: 'moderation',
    objectId: id,
    oldValue: { moderationStatus: before.moderationStatus },
    newValue: { moderationStatus, moderatorComment: patch.moderatorComment ?? null },
  });

  res.json({ question: updated });
};

export const deleteExchangeQuestion = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const [before] = await db.select().from(exchangeQuestions).where(eq(exchangeQuestions.id, id)).limit(1);
  if (!before) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  await db.delete(exchangeAnswers).where(eq(exchangeAnswers.questionId, id));
  await db.delete(exchangeQuestions).where(eq(exchangeQuestions.id, id));

  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'exchange_delete',
    section: 'moderation',
    objectId: id,
    oldValue: {
      text: before.text,
      participantId: before.participantId,
      moderationStatus: before.moderationStatus,
    },
    isCritical: true,
  });

  res.json({ ok: true, id });
};

export const deleteExchangeAnswer = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.answerId);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: 'Invalid answerId' });
    return;
  }

  const [before] = await db.select().from(exchangeAnswers).where(eq(exchangeAnswers.id, id)).limit(1);
  if (!before) {
    res.status(404).json({ error: 'Answer not found' });
    return;
  }

  // Удаляем вложенные комментарии к ответу, затем сам ответ
  await db.delete(exchangeAnswers).where(eq(exchangeAnswers.parentAnswerId, id));
  await db.delete(exchangeAnswers).where(eq(exchangeAnswers.id, id));

  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'exchange_answer_delete',
    section: 'moderation',
    objectId: id,
    oldValue: {
      text: before.text,
      participantId: before.participantId,
      questionId: before.questionId,
      parentAnswerId: before.parentAnswerId ?? null,
    },
    isCritical: true,
  });

  res.json({ ok: true, id, questionId: before.questionId });
};

async function mapExchangeAdminRows(
  rows: Array<{ q: typeof exchangeQuestions.$inferSelect; p: typeof participants.$inferSelect | null }>,
) {
  const qIds = rows.map(r => r.q.id);
  const answersByQ = new Map<number, Array<{
    id: number;
    participantId: number;
    text: string;
    parentAnswerId: number | null;
    authorName: string;
    direction: string | null;
    reactions: unknown;
    createdAt: Date | null;
  }>>();

  if (qIds.length > 0) {
    const allAnswers = await db.select({
      a: exchangeAnswers,
      author: participants,
    }).from(exchangeAnswers)
      .leftJoin(participants, eq(exchangeAnswers.participantId, participants.id))
      .where(inArray(exchangeAnswers.questionId, qIds))
      .orderBy(asc(exchangeAnswers.createdAt), asc(exchangeAnswers.id));

    for (const row of allAnswers) {
      const qid = row.a.questionId;
      if (!answersByQ.has(qid)) answersByQ.set(qid, []);
      answersByQ.get(qid)!.push({
        id: row.a.id,
        participantId: row.a.participantId,
        text: row.a.text,
        parentAnswerId: row.a.parentAnswerId ?? null,
        authorName: `${row.author?.firstName ?? ''} ${row.author?.lastName ?? ''}`.trim() || '—',
        direction: row.author?.direction ?? null,
        reactions: row.a.reactions,
        createdAt: row.a.createdAt,
      });
    }
  }

  return rows.map(r => {
    const answers = answersByQ.get(r.q.id) || [];
    return {
      ...r.q,
      authorName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim() || '—',
      direction: r.p?.direction ?? null,
      groupName: r.p?.groupName ?? null,
      answerCount: answers.filter(a => !a.parentAnswerId).length,
      answers,
    };
  });
}

export const listPendingExchange = async (_req: AdminRequest, res: Response): Promise<void> => {
  const rows = await db.select({
    q: exchangeQuestions,
    p: participants,
  }).from(exchangeQuestions)
    .leftJoin(participants, eq(exchangeQuestions.participantId, participants.id))
    .where(eq(exchangeQuestions.moderationStatus, 'pending'))
    .orderBy(desc(exchangeQuestions.createdAt));

  res.json({ questions: await mapExchangeAdminRows(rows) });
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

  res.json({
    questions: await mapExchangeAdminRows(rows),
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

export const getLevelsActionCatalog = async (_req: AdminRequest, res: Response): Promise<void> => {
  const { mergeCatalogWithDb, ACTION_CATALOG, LEVEL_THRESHOLD_ACTION_TYPES } = await import('../services/levelsActionCatalog.js');
  const config = await db.select().from(levelsConfig);
  const categories = await db.select().from(taskCategories).orderBy(asc(taskCategories.sortOrder));
  const catNames = categories.map(c => c.name);
  const catalog = mergeCatalogWithDb(config, catNames);
  const levelRows = config.filter(c => LEVEL_THRESHOLD_ACTION_TYPES.has(c.actionType));
  res.json({
    catalog,
    levelConfig: levelRows,
    catalogMeta: ACTION_CATALOG.filter(d => !LEVEL_THRESHOLD_ACTION_TYPES.has(d.actionType)).map(d => ({
      actionType: d.actionType,
      group: d.group,
    })),
    taskCategories: categories,
  });
};

export const crudLevels = {
  list: async (_req: AdminRequest, res: Response) => res.json({ config: await db.select().from(levelsConfig) }),
  upsert: async (req: AdminRequest, res: Response) => {
    const { actionType, pointsPerUnit, maxAccruals, levelThresholds, track, displayName } = req.body;
    const [existing] = await db.select().from(levelsConfig)
      .where(eq(levelsConfig.actionType, actionType)).limit(1);
    const payload = {
      actionType,
      pointsPerUnit,
      maxAccruals,
      levelThresholds,
      track: track ?? null,
      displayName: displayName ?? null,
    };
    if (existing) {
      const [updated] = await db.update(levelsConfig)
        .set(payload)
        .where(eq(levelsConfig.id, existing.id)).returning();
      res.json({ config: updated });
    } else {
      const [created] = await db.insert(levelsConfig).values(payload).returning();
      res.json({ config: created });
    }
  },
  batchUpsert: async (req: AdminRequest, res: Response) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const out = [];
    for (const item of items) {
      if (!item?.actionType) continue;
      const [existing] = await db.select().from(levelsConfig)
        .where(eq(levelsConfig.actionType, item.actionType)).limit(1);
      const payload = {
        actionType: item.actionType,
        pointsPerUnit: item.pointsPerUnit,
        maxAccruals: item.maxAccruals,
        levelThresholds: item.levelThresholds,
        track: item.track ?? null,
        displayName: item.displayName ?? null,
      };
      if (existing) {
        const [updated] = await db.update(levelsConfig).set(payload).where(eq(levelsConfig.id, existing.id)).returning();
        out.push(updated);
      } else {
        const [created] = await db.insert(levelsConfig).values(payload).returning();
        out.push(created);
      }
    }
    res.json({ config: out });
  },
};

export const triggerRatingRecalcAll = async (req: AdminRequest, res: Response): Promise<void> => {
  const { recalculateAllParticipantTotals } = await import('../services/ratingRecalcService.js');
  const result = await recalculateAllParticipantTotals(req.adminId);
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req,
    actionType: 'rating_recalc_all',
    section: 'levels',
    newValue: { runId: result.runId, participantsProcessed: result.participantsProcessed },
    isCritical: true,
  });
  res.json({ ok: true, ...result });
};

export const listRatingRecalcHistory = async (_req: AdminRequest, res: Response): Promise<void> => {
  const runs = await db.select().from(ratingRecalcRuns).orderBy(desc(ratingRecalcRuns.startedAt)).limit(20);
  res.json({ runs });
};

const DEFAULT_BONUS_RULES = [
  { code: 'day_complete_bonus', pointsActionType: 'day_complete_bonus', params: { type: 'touchpoints_day' } },
  { code: 'reflection_streak_7', pointsActionType: 'reflection_streak_7', params: { minDays: 7 } },
  { code: 'bonus_regularity', pointsActionType: 'bonus_regularity', params: { minStreak: 6 } },
  { code: 'bonus_diversity', pointsActionType: 'bonus_diversity', params: { minCategories: 4 } },
];

async function ensureDefaultBonusRules(): Promise<void> {
  for (const r of DEFAULT_BONUS_RULES) {
    const [exists] = await db.select({ id: ratingBonusRules.id }).from(ratingBonusRules)
      .where(eq(ratingBonusRules.code, r.code)).limit(1);
    if (!exists) {
      await db.insert(ratingBonusRules).values({ ...r, enabled: true });
    }
  }
}

export const listRatingBonusRules = async (_req: AdminRequest, res: Response): Promise<void> => {
  await ensureDefaultBonusRules();
  const rules = await db.select().from(ratingBonusRules).orderBy(asc(ratingBonusRules.id));
  res.json({ rules });
};

export const createRatingBonusRule = async (req: AdminRequest, res: Response): Promise<void> => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const { parseBody, ratingBonusRuleCreateSchema } = await import('../validation/adminSchemas.js');
  const parsed = parseBody(ratingBonusRuleCreateSchema, { code });
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const template = DEFAULT_BONUS_RULES.find(r => r.code === parsed.data.code);
  if (!template) {
    res.status(400).json({ error: 'Unknown bonus rule code' });
    return;
  }
  const [exists] = await db.select({ id: ratingBonusRules.id }).from(ratingBonusRules)
    .where(eq(ratingBonusRules.code, parsed.data.code)).limit(1);
  if (exists) {
    res.status(400).json({ error: 'Rule already exists' });
    return;
  }
  const [created] = await db.insert(ratingBonusRules).values({ ...template, enabled: true }).returning();
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'rating_bonus_rule_create', section: 'levels', objectId: String(created.id),
    newValue: created, isCritical: true,
  });
  res.json({ rule: created });
};

export const patchRatingBonusRule = async (req: AdminRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { parseBody, ratingBonusRulePatchSchema } = await import('../validation/adminSchemas.js');
  const parsed = parseBody(ratingBonusRulePatchSchema, req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { enabled, params, pointsActionType } = parsed.data;
  const [before] = await db.select().from(ratingBonusRules).where(eq(ratingBonusRules.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: 'Not found' }); return; }
  const [updated] = await db.update(ratingBonusRules)
    .set({
      ...(enabled !== undefined ? { enabled } : {}),
      ...(params !== undefined ? { params } : {}),
      ...(pointsActionType !== undefined ? { pointsActionType } : {}),
    })
    .where(eq(ratingBonusRules.id, id)).returning();
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  const { logAdminAction } = await import('../services/adminActionsLog.js');
  await logAdminAction({
    req, actionType: 'rating_bonus_rule_update', section: 'levels', objectId: String(id),
    oldValue: before, newValue: updated, isCritical: true,
  });
  res.json({ rule: updated });
};

function normalizeMaterialKbUnlock(body: Record<string, unknown>): {
  kbUnlockMode?: 'immediate' | 'touchpoints';
  kbUnlockMinTouchpoints?: number | null;
} {
  const out: { kbUnlockMode?: 'immediate' | 'touchpoints'; kbUnlockMinTouchpoints?: number | null } = {};
  if (body.kbUnlockMode === 'immediate' || body.kbUnlockMode === 'touchpoints') {
    out.kbUnlockMode = body.kbUnlockMode;
  }
  if (body.kbUnlockMinTouchpoints !== undefined) {
    const n = body.kbUnlockMinTouchpoints;
    if (n === null || n === '') {
      out.kbUnlockMinTouchpoints = null;
    } else {
      const num = Number(n);
      if (Number.isFinite(num)) {
        out.kbUnlockMinTouchpoints = Math.min(7, Math.max(1, Math.round(num)));
      }
    }
  }
  if (out.kbUnlockMode === 'immediate') {
    out.kbUnlockMinTouchpoints = null;
  }
  return out;
}

export const crudMaterials = {
  list: async (req: AdminRequest, res: Response) => {
    const shiftId = await resolveAdminShiftId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let rows = await db.select().from(materials).where(eq(materials.shiftId, shiftId));
    if (status) rows = rows.filter(m => (m.status || 'published') === status);
    res.json({ materials: rows, totalCount: rows.length });
  },
  create: async (req: AdminRequest, res: Response) => {
    const shiftId = await resolveAdminShiftId(req);
    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'Укажите название материала' });
      return;
    }
    const kb = normalizeMaterialKbUnlock(body);
    let tags = body.tags;
    if (Array.isArray(tags)) {
      const { ensureThematicTagRegistry } = await import('../services/thematicTagRegistry.js');
      tags = await ensureThematicTagRegistry(tags as string[]);
    }
    const statusRaw = String(body.status ?? 'draft');
    const status = statusRaw === 'published' || statusRaw === 'archived' ? statusRaw : 'draft';
    const eventIdRaw = body.eventId;
    const eventId = eventIdRaw == null || eventIdRaw === '' ? null : Number(eventIdRaw);
    const dayNumber = body.dayNumber != null && body.dayNumber !== '' ? Number(body.dayNumber) : null;
    const [m] = await db.insert(materials).values({
      shiftId,
      title,
      url: body.url != null && String(body.url).trim() ? String(body.url).trim().slice(0, 500) : null,
      fileUrl: body.fileUrl != null && String(body.fileUrl).trim() ? String(body.fileUrl).trim().slice(0, 500) : null,
      type: body.type != null && String(body.type).trim() ? String(body.type).trim().slice(0, 50) : null,
      direction: body.direction != null && String(body.direction).trim() ? String(body.direction).trim().slice(0, 255) : null,
      speakerName: body.speakerName != null && String(body.speakerName).trim()
        ? String(body.speakerName).trim().slice(0, 255)
        : null,
      speakerIds: Array.isArray(body.speakerIds) ? body.speakerIds.map(Number).filter(n => Number.isFinite(n)) : [],
      tags: Array.isArray(tags) ? tags : [],
      eventId: Number.isFinite(eventId as number) ? (eventId as number) : null,
      dayNumber: Number.isFinite(dayNumber as number) ? (dayNumber as number) : null,
      isGeneral: body.isGeneral === true,
      isNew: body.isNew !== false,
      status,
      ...kb,
    }).returning();
    res.json({ material: m });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const kb = normalizeMaterialKbUnlock(body);
    const patch: Record<string, unknown> = { ...kb };
    if (body.title !== undefined) {
      const title = String(body.title ?? '').trim();
      if (!title) {
        res.status(400).json({ error: 'Укажите название материала' });
        return;
      }
      patch.title = title;
    }
    if (body.url !== undefined) {
      patch.url = body.url != null && String(body.url).trim() ? String(body.url).trim().slice(0, 500) : null;
    }
    if (body.fileUrl !== undefined) {
      patch.fileUrl = body.fileUrl != null && String(body.fileUrl).trim()
        ? String(body.fileUrl).trim().slice(0, 500)
        : null;
    }
    if (body.type !== undefined) {
      patch.type = body.type != null && String(body.type).trim() ? String(body.type).trim().slice(0, 50) : null;
    }
    if (body.direction !== undefined) {
      patch.direction = body.direction != null && String(body.direction).trim()
        ? String(body.direction).trim().slice(0, 255)
        : null;
    }
    if (body.speakerName !== undefined) {
      patch.speakerName = body.speakerName != null && String(body.speakerName).trim()
        ? String(body.speakerName).trim().slice(0, 255)
        : null;
    }
    if (body.speakerIds !== undefined) {
      patch.speakerIds = Array.isArray(body.speakerIds)
        ? body.speakerIds.map(Number).filter(n => Number.isFinite(n))
        : [];
    }
    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        const { ensureThematicTagRegistry } = await import('../services/thematicTagRegistry.js');
        patch.tags = await ensureThematicTagRegistry(body.tags as string[]);
      } else {
        patch.tags = [];
      }
    }
    if (body.eventId !== undefined) {
      const eventId = body.eventId == null || body.eventId === '' ? null : Number(body.eventId);
      patch.eventId = Number.isFinite(eventId as number) ? eventId : null;
    }
    if (body.dayNumber !== undefined) {
      const dayNumber = body.dayNumber == null || body.dayNumber === '' ? null : Number(body.dayNumber);
      patch.dayNumber = Number.isFinite(dayNumber as number) ? dayNumber : null;
    }
    if (body.isGeneral !== undefined) patch.isGeneral = body.isGeneral === true;
    if (body.isNew !== undefined) patch.isNew = body.isNew !== false;
    if (body.status !== undefined) {
      const statusRaw = String(body.status);
      patch.status = statusRaw === 'published' || statusRaw === 'archived' ? statusRaw : 'draft';
    }
    const [updated] = await db.update(materials).set(patch).where(eq(materials.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ material: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(materials).where(eq(materials.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      req, actionType: 'material_delete', section: 'knowledge', objectId: id,
      oldValue: deleted, isCritical: true,
    });
    res.json({ ok: true });
  },
};

export const crudMaterialTypes = {
  list: async (_req: AdminRequest, res: Response) => {
    res.json({ types: await db.select().from(materialTypes).orderBy(asc(materialTypes.sortOrder)) });
  },
  create: async (req: AdminRequest, res: Response) => {
    const key = String(req.body.key || '').trim();
    const name = String(req.body.name || '').trim();
    if (!key || !name) { res.status(400).json({ error: 'key and name required' }); return; }
    const [row] = await db.insert(materialTypes).values({
      key, name, sortOrder: Number(req.body.sortOrder) || 0,
    }).returning();
    res.json({ type: row });
  },
  update: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const patch: Partial<typeof materialTypes.$inferInsert> = {};
    if (req.body.name != null) patch.name = String(req.body.name).trim();
    if (req.body.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder);
    const [updated] = await db.update(materialTypes).set(patch).where(eq(materialTypes.id, id)).returning();
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ type: updated });
  },
  delete: async (req: AdminRequest, res: Response) => {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(materialTypes).where(eq(materialTypes.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  },
};

export const exportParticipants = async (req: AdminRequest, res: Response): Promise<void> => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const { writeParticipantsFullExport } = await import('../services/exports/participantsExport.js');
  const parsed = parseParticipantListQuery(req);
  parsed.page = 1;
  delete parsed.limit;
  await writeParticipantsFullExport(res, format === 'xlsx' ? 'xlsx' : 'csv', parsed);
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
    const answerText = participantAnswerSummary(r.a.answerData, r.q?.type);
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

export const exportPiggybank = async (req: AdminRequest, res: Response): Promise<void> => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const { queryPiggybankForExport } = await import('./adminPiggybankController.js');
  const rows = await queryPiggybankForExport(req);

  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Копилка');
    ws.columns = [
      { header: 'Дата', key: 'createdAt', width: 20 },
      { header: 'Участник', key: 'participantName', width: 24 },
      { header: 'Направление', key: 'directionName', width: 18 },
      { header: 'Текст', key: 'text', width: 50 },
      { header: 'Теги', key: 'tags', width: 20 },
      { header: 'Источник', key: 'source', width: 18 },
      { header: 'Скрыто', key: 'isHidden', width: 8 },
      { header: 'Нарушение', key: 'isViolation', width: 10 },
    ];
    for (const r of rows) {
      ws.addRow({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
        isHidden: r.isHidden ? 'да' : '',
        isViolation: r.isViolation ? 'да' : '',
      });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=piggybank.xlsx');
    await wb.xlsx.write(res);
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=piggybank.csv');
  const header = 'created_at,participant,direction,tags,source,text,is_hidden,is_violation\n';
  const csv = rows.map(r => [
    r.createdAt,
    JSON.stringify(r.participantName),
    JSON.stringify(r.directionName ?? ''),
    JSON.stringify(r.tags),
    JSON.stringify(r.source ?? ''),
    JSON.stringify(r.text),
    r.isHidden ? '1' : '0',
    r.isViolation ? '1' : '0',
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
  const { sendCsv } = await import('../services/exports/workbook.js');
  const rows = await db.select({ a: eventAttendance, p: participants, e: events })
    .from(eventAttendance)
    .leftJoin(participants, eq(eventAttendance.participantId, participants.id))
    .leftJoin(events, eq(eventAttendance.eventId, events.id));
  sendCsv(
    res,
    'attendance.csv',
    'id,participant_id,name,direction,event_title,event_day,created_at',
    rows.map(r => [
      r.a.id, r.p?.id, `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(), r.p?.direction ?? '',
      r.e?.title ?? '', r.e?.dayNumber ?? '', r.a.createdAt,
    ]),
  );
};

export const exportPointsLog = async (_req: AdminRequest, res: Response): Promise<void> => {
  const { sendCsv } = await import('../services/exports/workbook.js');
  const rows = await db.select({ l: pointsLog, p: participants })
    .from(pointsLog)
    .leftJoin(participants, eq(pointsLog.participantId, participants.id))
    .orderBy(desc(pointsLog.createdAt));
  sendCsv(
    res,
    'points_log.csv',
    'id,participant_id,name,direction,action_type,points,created_at',
    rows.map(r => [
      r.l.id, r.p?.id, `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(), r.p?.direction ?? '',
      r.l.actionType, r.l.points, r.l.createdAt,
    ]),
  );
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

export const listPushLog = async (req: AdminRequest, res: Response): Promise<void> => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const rows = await db.select({
    log: pushLog,
    p: participants,
  }).from(pushLog)
    .leftJoin(participants, eq(pushLog.participantId, participants.id))
    .orderBy(desc(pushLog.sentAt))
    .limit(limit);
  const { describeDeliveryStatus } = await import('../services/pushDeliveryStatus.js');
  res.json({
    log: rows.map(r => ({
      ...r.log,
      participantName: r.p ? `${r.p.firstName ?? ''} ${r.p.lastName ?? ''}`.trim() : null,
      deliveryStatusHint: describeDeliveryStatus(r.log.deliveryStatus ?? ''),
    })),
  });
};

export const listPointsLog = async (req: AdminRequest, res: Response): Promise<void> => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  const actionTypePrefix = req.query.actionTypePrefix as string | undefined;
  const participantIdRaw = req.query.participantId as string | undefined;
  const participantId = participantIdRaw ? Number(participantIdRaw) : undefined;

  const conditions = [];
  if (participantId && !Number.isNaN(participantId)) {
    conditions.push(eq(pointsLog.participantId, participantId));
  }
  if (actionTypePrefix) {
    conditions.push(like(pointsLog.actionType, actionTypePrefix.replace('*', '%')));
  }

  let query = db.select({
    l: pointsLog,
    p: participants,
  }).from(pointsLog)
    .leftJoin(participants, eq(pointsLog.participantId, participants.id))
    .orderBy(desc(pointsLog.createdAt))
    .limit(limit);
  if (conditions.length) {
    query = query.where(and(...conditions)) as typeof query;
  }
  const log = await query;
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
    submissions: rows.map(r => enrichSubmissionRow({
      ...r.s,
      participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
      taskTitle: r.t?.title,
      confirmationType: r.t?.confirmationType,
      teamConfirmations: confBySub.get(r.s.id) || [],
    })),
  });
};

export const listAllSubmissions = async (req: AdminRequest, res: Response): Promise<void> => {
  const statusRaw = req.query.status as string | undefined;
  const taskIdRaw = req.query.taskId as string | undefined;
  const participantIdRaw = req.query.participantId as string | undefined;
  const direction = req.query.direction as string | undefined;
  const groupIdRaw = req.query.groupId as string | undefined;
  const confirmationType = req.query.confirmationType as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const dayRaw = req.query.day ?? req.query.dayNumber;
  const dayNumber = dayRaw != null && dayRaw !== '' ? Number(dayRaw) : undefined;
  const verifiedByMe = req.query.verifiedByMe === '1' || req.query.verifiedByMe === 'true';
  const verifiedByAdminIdRaw = req.query.verifiedByAdminId as string | undefined;
  const verifiedByAdminId = verifiedByAdminIdRaw ? Number(verifiedByAdminIdRaw) : undefined;
  const taskId = taskIdRaw ? Number(taskIdRaw) : undefined;
  const participantId = participantIdRaw ? Number(participantIdRaw) : undefined;
  const groupId = groupIdRaw ? Number(groupIdRaw) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const sortBy = String(req.query.sortBy || 'submittedAt');
  const sortDirFn = req.query.sortDir === 'asc' ? asc : desc;

  const conditions = [];
  if (statusRaw) {
    const statuses = statusRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(taskSubmissions.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(taskSubmissions.status, statuses));
  }
  if (taskId && !Number.isNaN(taskId)) conditions.push(eq(taskSubmissions.taskId, taskId));
  if (participantId && !Number.isNaN(participantId)) {
    conditions.push(eq(taskSubmissions.participantId, participantId));
  }
  if (direction) conditions.push(eq(participants.direction, direction));
  if (groupId && !Number.isNaN(groupId)) conditions.push(eq(participants.groupId, groupId));
  if (confirmationType) conditions.push(eq(tasks.confirmationType, confirmationType));
  if (dayNumber && !Number.isNaN(dayNumber)) {
    conditions.push(or(
      eq(tasks.dayNumber, dayNumber),
      sql`${tasks.dayNumbers} @> ${JSON.stringify([dayNumber])}::jsonb`,
    )!);
  }
  if (verifiedByMe && req.adminId) {
    conditions.push(eq(taskSubmissions.verifiedByAdminId, req.adminId));
  } else if (verifiedByAdminId && !Number.isNaN(verifiedByAdminId)) {
    conditions.push(eq(taskSubmissions.verifiedByAdminId, verifiedByAdminId));
  }
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(taskSubmissions.submittedAt, d));
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!Number.isNaN(d.getTime())) conditions.push(lte(taskSubmissions.submittedAt, d));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  let countQuery = db.select({ count: count() }).from(taskSubmissions)
    .leftJoin(participants, eq(taskSubmissions.participantId, participants.id))
    .leftJoin(tasks, eq(taskSubmissions.taskId, tasks.id));
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [total] = await countQuery;

  let orderExpr;
  if (sortBy === 'participant') orderExpr = sortDirFn(participants.firstName);
  else if (sortBy === 'status') orderExpr = sortDirFn(taskSubmissions.status);
  else if (sortBy === 'points') orderExpr = sortDirFn(taskSubmissions.pointsAwarded);
  else if (sortBy === 'task') orderExpr = sortDirFn(tasks.title);
  else if (sortBy === 'checkedAt') orderExpr = sortDirFn(taskSubmissions.checkedAt);
  else if (sortBy === 'day') orderExpr = sortDirFn(tasks.dayNumber);
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
    submissions: rows.map(r => enrichSubmissionRow({
      ...r.s,
      participantName: `${r.p?.firstName ?? ''} ${r.p?.lastName ?? ''}`.trim(),
      participantId: r.p?.id ?? r.s.participantId,
      taskTitle: r.t?.title,
      taskDay: r.t?.dayNumber,
      taskDayNumbers: r.t?.dayNumbers ?? (r.t?.dayNumber != null ? [r.t.dayNumber] : []),
      confirmationType: r.t?.confirmationType,
      participantDirection: r.p?.direction,
      participantGroupId: r.p?.groupId,
      participantGroupName: r.p?.groupName,
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

export const getForumSettings = async (req: AdminRequest, res: Response): Promise<void> => {
  const shiftId = await resolveAdminShiftId(req);
  const shift = await getShiftById(shiftId);
  const settings = shift ? shiftOpsToForumShape(shift) : await loadForumSettings();
  res.json({ settings: { ...settings, shiftId }, editingShiftId: shiftId });
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
