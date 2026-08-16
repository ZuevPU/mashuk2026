import { Response } from 'express';
import { and, eq, asc, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { participants, pedagogicalRoles, participantGroups } from '../db/schema.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';
import {
  scorePedagogicalRole,
  getRoleMeta,
  normalizeOnboardingConfig,
  interestTagsFromConfig,
  validateGoalAnswers,
  pruneHiddenGoalAnswers,
  resolveParticipantInterestLimits,
  interestPickCountError,
} from '../services/roleService.js';
import { normalizeRegion } from '../data/regions.js';
import { getActiveConsentVersions } from './consentsController.js';
import { generateQrToken } from '../services/qrService.js';
import { awardPoints } from '../services/pointsService.js';
import { scheduleParticipantAvatarSync } from '../services/participantAvatarSync.js';
import { healParticipantPlaceholderName, resolveOnboardingName } from '../services/participantName.js';
import { needsShift2InterestsReselection } from '../services/shift2InterestsGate.js';
import { getForumSettings } from '../services/helpers.js';
import {
  groupsMatchingDirection,
  listShiftGroupsWithSeats,
  resolveDirectionFromGroup,
} from '../services/groupDirectionSync.js';
import {
  findParticipantForVk,
  getShiftById,
  listPublishedShiftsForParticipants,
  listVkEnrollments,
  publicShiftCard,
  requestedShiftIdFromReq,
  resolveRegistrationRoute,
} from '../services/shiftService.js';

async function getForumOnboardingConfig(shiftId?: number | null) {
  if (shiftId != null && Number.isInteger(shiftId) && shiftId > 0) {
    const { syncInterestCatalogToOnboarding } = await import('../services/interestCatalog.js');
    await syncInterestCatalogToOnboarding(shiftId);
  }
  const settings = await getForumSettings(shiftId);
  const config = normalizeOnboardingConfig(settings?.roleDiagnosticsConfig);
  const tagCount = config.interestGroups.reduce((n, g) => n + g.tags.length, 0);
  const limits = resolveParticipantInterestLimits(config, tagCount);
  return { ...config, interestMin: limits.interestMin, interestMax: limits.interestMax };
}

async function resolvePublishedShiftId(req: VkAuthRequest, explicit?: number | null): Promise<number | null> {
  const published = await listPublishedShiftsForParticipants();
  const candidate = explicit
    || (req.query.shiftId != null ? Number(req.query.shiftId) : null)
    || requestedShiftIdFromReq(req);
  if (candidate && Number.isInteger(candidate) && candidate > 0) {
    return published.some(s => s.id === candidate) ? candidate : null;
  }
  if (published.length === 1) return published[0].id;
  return published.find(s => s.status === 'active')?.id ?? null;
}

const onboardingBaseSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  age: z.coerce.number().int().min(14).max(100),
  directionId: z.coerce.number().int().positive(),
  workplace: z.string().min(1).max(500),
  position: z.string().min(1).max(500),
  region: z.string().min(1).max(255),
  consentPd: z.literal(true),
  consentAnalytics: z.literal(true),
  consentPdVersion: z.coerce.number().int().positive().optional(),
  consentAnalyticsVersion: z.coerce.number().int().positive().optional(),
  groupId: z.coerce.number().int().positive().optional().nullable(),
  goalAnswers: z.array(z.string().max(2000)).min(1).max(24),
  interests: z.array(z.string().min(1).max(100)).min(1).max(30),
  roleAnswers: z.array(z.coerce.number().int().min(0).max(11)).min(1).max(12),
  vkPhotoUrl: z.string().url().max(2000).optional(),
  shiftId: z.coerce.number().int().positive().optional(),
});

async function assignGroup(
  mode: string,
  groupId: number | null | undefined,
  directionId: number,
  shiftId: number,
): Promise<{ groupId: number | null; groupName: string | null }> {
  if (mode === 'list') {
    if (!groupId) return { groupId: null, groupName: null };
    const [g] = await db.select().from(participantGroups).where(and(
      eq(participantGroups.id, groupId),
      eq(participantGroups.shiftId, shiftId),
    )).limit(1);
    if (!g) return { groupId: null, groupName: null };
    const [c] = await db.select({ c: count() }).from(participants).where(and(
      eq(participants.groupId, g.id),
      eq(participants.shiftId, shiftId),
    ));
    if (g.capacity != null && Number(c?.c ?? 0) >= g.capacity) {
      throw new Error('Группа заполнена');
    }
    return { groupId: g.id, groupName: g.name };
  }

  const groups = await db.select().from(participantGroups)
    .where(eq(participantGroups.shiftId, shiftId))
    .orderBy(asc(participantGroups.id));
  const pool = groupsMatchingDirection(groups, directionId);
  let best: typeof pool[0] | null = null;
  let bestCount = Infinity;
  for (const g of pool) {
    const [c] = await db.select({ c: count() }).from(participants).where(and(
      eq(participants.groupId, g.id),
      eq(participants.shiftId, shiftId),
    ));
    const n = Number(c?.c ?? 0);
    if (g.capacity != null && n >= g.capacity) continue;
    if (n < bestCount) { best = g; bestCount = n; }
  }
  if (!best) return { groupId: null, groupName: null };
  return { groupId: best.id, groupName: best.name };
}

export const listPublishedShifts = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    const published = await listPublishedShiftsForParticipants();
    const enrollments = vkUserId ? await listVkEnrollments(vkUserId) : [];
    const route = resolveRegistrationRoute(published, enrollments, requestedShiftIdFromReq(req));
    res.json({
      shifts: published.map(publicShiftCard),
      enrollments,
      registrationTargetShiftId: route.shiftId,
      registrationAction: route.action,
    });
  } catch (error) {
    console.error('listPublishedShifts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const preferredShiftId = requestedShiftIdFromReq(req);
    const published = await listPublishedShiftsForParticipants();
    const publishedShifts = published.map(publicShiftCard);
    const enrollments = await listVkEnrollments(vkUserId);
    const route = resolveRegistrationRoute(published, enrollments, preferredShiftId);
    let user = await findParticipantForVk(vkUserId, preferredShiftId, {
      fallback: preferredShiftId == null,
    });

    // Участник смены 1 сразу входит туда, если в запрошенной смене профиля ещё нет.
    // Скопированным в другую смену сначала даём выбрать смену — не перехватываем вход.
    if (route.action === 'enter' && route.shiftId) {
      const preferredCompleted = !!(
        user?.onboardingCompletedAt
        && !user.selfDeletedAt
        && preferredShiftId
        && user.shiftId === preferredShiftId
      );
      if (!preferredCompleted) {
        user = await findParticipantForVk(vkUserId, route.shiftId, { fallback: false });
      }
    }

    if (!user || !user.onboardingCompletedAt) {
      res.json({
        status: 'needs_registration',
        vkUserId,
        shiftId: route.shiftId ?? preferredShiftId,
        registrationTargetShiftId: route.shiftId,
        registrationAction: route.action,
        publishedShifts,
        enrollments,
      });
      return;
    }
    if (user.selfDeletedAt) {
      res.json({ status: 'self_deleted', deletedAt: user.selfDeletedAt });
      return;
    }
    if (user.isBlocked) {
      res.json({
        status: 'blocked',
        blockReason: user.blockReason || 'Доступ ограничен организаторами',
        blockedAt: user.blockedAt,
      });
      return;
    }

    if (!user.avatarUrl) {
      scheduleParticipantAvatarSync(user.id);
    }
    const healed = await healParticipantPlaceholderName(user);
    if (healed) user = healed;

    const shift = await getShiftById(user.shiftId);
    const onboardingConfig = await getForumOnboardingConfig(user.shiftId);
    const needsInterestsReselection = needsShift2InterestsReselection({
      onboardingCompleted: true,
      shift,
      interestsReselectedAt: user.interestsReselectedAt,
      interests: user.interests,
      interestMin: onboardingConfig.interestMin,
      allowedTags: interestTagsFromConfig(onboardingConfig),
    });
    res.json({
      status: 'ok',
      user,
      publishedShifts,
      enrollments,
      shiftLive: shift?.status === 'active',
      registrationAction: route.action,
      registrationTargetShiftId: route.shiftId,
      needsInterestsReselection,
      interestsCatalog: needsInterestsReselection
        ? {
          interestGroups: onboardingConfig.interestGroups,
          interestMin: onboardingConfig.interestMin,
          interestMax: onboardingConfig.interestMax,
        }
        : null,
    });
  } catch (error) {
    console.error('getMe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeOnboarding = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = onboardingBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const shiftId = await resolvePublishedShiftId(req, data.shiftId ?? null);
    if (!shiftId) {
      res.status(400).json({ error: 'Выберите опубликованную смену' });
      return;
    }
    const onboardingConfig = await getForumOnboardingConfig(shiftId);
    data.goalAnswers = pruneHiddenGoalAnswers(onboardingConfig.goalQuestions, data.goalAnswers);
    const goalErr = validateGoalAnswers(onboardingConfig.goalQuestions, data.goalAnswers);
    if (goalErr) {
      res.status(400).json({ error: goalErr });
      return;
    }
    const interestErr = interestPickCountError(data.interests.length, {
      interestMin: onboardingConfig.interestMin,
      interestMax: onboardingConfig.interestMax,
    });
    if (interestErr) {
      res.status(400).json({ error: interestErr });
      return;
    }
    if (data.roleAnswers.length !== onboardingConfig.questions.length) {
      res.status(400).json({
        error: `Нужно ответить на ${onboardingConfig.questions.length} вопрос(а/ов) диагностики`,
      });
      return;
    }
    for (let i = 0; i < data.roleAnswers.length; i++) {
      const optCount = onboardingConfig.questions[i]?.options.length ?? 0;
      if (data.roleAnswers[i] < 0 || data.roleAnswers[i] >= optCount) {
        res.status(400).json({ error: `Некорректный ответ на вопрос диагностики ${i + 1}` });
        return;
      }
    }
    const allowedTags = interestTagsFromConfig(onboardingConfig);
    for (const tag of data.interests) {
      if (!allowedTags.has(tag)) {
        res.status(400).json({ error: `Unknown interest tag: ${tag}` });
        return;
      }
    }

    const { getDirectionInShift } = await import('../services/shiftCatalogs.js');
    const dir = await getDirectionInShift(data.directionId, shiftId);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const settings = await getForumSettings(shiftId);
    const diagMatrix = onboardingConfig.optionToRole;

    let pedagogicalRole: string;
    try {
      pedagogicalRole = scorePedagogicalRole(data.roleAnswers, diagMatrix);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid roleAnswers' });
      return;
    }

    const existing = await findParticipantForVk(vkUserId, shiftId, { fallback: false });
    if (existing?.selfDeletedAt) {
      res.status(403).json({
        error: 'Вы удалили профиль из программы. Для повторного участия обратитесь к организаторам.',
        status: 'self_deleted',
      });
      return;
    }
    if (existing?.isBlocked) {
      res.status(403).json({
        error: 'Доступ к программе ограничен. Обратитесь к организаторам.',
        status: 'blocked',
      });
      return;
    }
    if (existing?.onboardingCompletedAt) {
      res.json({ status: 'ok', user: existing, role: getRoleMeta(existing.pedagogicalRole || pedagogicalRole) });
      return;
    }

    const mode = settings?.groupAssignMode || 'list';
    let groupAssign: { groupId: number | null; groupName: string | null };
    try {
      groupAssign = await assignGroup(mode, data.groupId, dir.id, shiftId);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Group assign failed' });
      return;
    }
    if (mode === 'list' && !groupAssign.groupId) {
      const shiftGroups = await db.select().from(participantGroups).where(eq(participantGroups.shiftId, shiftId));
      if (shiftGroups.length > 0) {
        res.status(400).json({ error: 'Выберите группу' });
        return;
      }
    }

    const consentVersions = await getActiveConsentVersions();
    if (data.consentPdVersion != null && data.consentPdVersion !== consentVersions.pd) {
      res.status(400).json({ error: 'Устаревшая версия согласия на ПД', expected: consentVersions.pd });
      return;
    }
    if (data.consentAnalyticsVersion != null && data.consentAnalyticsVersion !== consentVersions.analytics) {
      res.status(400).json({ error: 'Устаревшая версия согласия на аналитику', expected: consentVersions.analytics });
      return;
    }

    const region = normalizeRegion(data.region);
    if (!region || region === '__other__') {
      res.status(400).json({ error: 'Укажите регион или свой вариант в поле «Иное»' });
      return;
    }

    const resolvedDir = await resolveDirectionFromGroup(groupAssign.groupId, { id: dir.id, name: dir.name });

    const resolvedName = await resolveOnboardingName(vkUserId, data.firstName, data.lastName);
    if ('error' in resolvedName) {
      res.status(400).json({ error: resolvedName.error });
      return;
    }

    const values = {
      vkId: vkUserId,
      shiftId,
      firstName: resolvedName.firstName,
      lastName: resolvedName.lastName,
      age: data.age,
      workplace: data.workplace,
      position: data.position,
      region,
      consentPd: true,
      consentAnalytics: true,
      consentPdVersion: data.consentPdVersion ?? consentVersions.pd,
      consentAnalyticsVersion: data.consentAnalyticsVersion ?? consentVersions.analytics,
      groupId: groupAssign.groupId,
      groupName: groupAssign.groupName,
      directionId: resolvedDir.id,
      direction: resolvedDir.name,
      interests: data.interests,
      interestsReselectedAt: new Date(),
      goalAnswers: data.goalAnswers,
      roleAnswers: data.roleAnswers,
      pedagogicalRole,
      qrToken: generateQrToken(),
      onboardingCompletedAt: new Date(),
      lastActiveAt: new Date(),
    };

    let user;
    if (existing) {
      [user] = await db.update(participants).set(values).where(eq(participants.id, existing.id)).returning();
    } else {
      [user] = await db.insert(participants).values(values).returning();
    }

    await awardPoints(user.id, 'point_a_complete', undefined, 1);

    scheduleParticipantAvatarSync(user.id, { vkPhotoUrl: data.vkPhotoUrl });

    res.json({ status: 'ok', user, role: getRoleMeta(pedagogicalRole) });
  } catch (error) {
    console.error('completeOnboarding:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** @deprecated Use completeOnboarding — kept for thin backward compatibility */
export const register = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { firstName, lastName, directionId } = req.body;
    if (!directionId) {
      res.status(400).json({ error: 'directionId is required' });
      return;
    }

    const consentVersions = await getActiveConsentVersions();
    const shiftId = await resolvePublishedShiftId(req, req.body?.shiftId != null ? Number(req.body.shiftId) : null);
    if (!shiftId) {
      res.status(400).json({ error: 'Выберите опубликованную смену' });
      return;
    }

    const { getDirectionInShift } = await import('../services/shiftCatalogs.js');
    const dir = await getDirectionInShift(Number(directionId), shiftId);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const existing = await findParticipantForVk(vkUserId, shiftId, { fallback: false });
    if (existing?.onboardingCompletedAt) {
      res.json({ status: 'ok', user: existing });
      return;
    }

    const resolvedName = await resolveOnboardingName(
      vkUserId,
      String(firstName ?? ''),
      String(lastName ?? ''),
    );
    if ('error' in resolvedName) {
      res.status(400).json({ error: resolvedName.error });
      return;
    }

    const values = {
      vkId: vkUserId,
      shiftId,
      firstName: resolvedName.firstName,
      lastName: resolvedName.lastName,
      directionId: dir.id,
      direction: dir.name,
      consentPd: true,
      consentAnalytics: true,
      consentPdVersion: consentVersions.pd,
      consentAnalyticsVersion: consentVersions.analytics,
      interests: ['проектная работа', 'подростки', 'осмысленность обучения', 'командная работа учителей', 'открытые уроки'],
      goalAnswers: ['—', '—', '—', '—', '—'],
      roleAnswers: [1, 1, 0, 1, 1, 2, 0, 3],
      pedagogicalRole: 'practice_realizer',
      age: 30,
      workplace: 'Не указано',
      position: 'Не указано',
      qrToken: generateQrToken(),
      onboardingCompletedAt: new Date(),
      lastActiveAt: new Date(),
    };

    let user;
    if (existing) {
      [user] = await db.update(participants).set(values).where(eq(participants.id, existing.id)).returning();
    } else {
      [user] = await db.insert(participants).values(values).returning();
    }

    scheduleParticipantAvatarSync(user.id);

    res.json({ status: 'ok', user });
  } catch (error) {
    console.error('register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listOnboardingMeta = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const requested = req.query.shiftId != null ? Number(req.query.shiftId) : null;
    const shiftId = await resolvePublishedShiftId(
      req,
      requested != null && Number.isInteger(requested) && requested > 0 ? requested : null,
    );
    const published = await listPublishedShiftsForParticipants();
    const publishedShifts = published.map(publicShiftCard);
    if (!shiftId) {
      res.json({
        publishedShifts,
        groupAssignMode: 'list',
        groups: [],
        activeShiftId: null,
      });
      return;
    }
    const roles = await db.select().from(pedagogicalRoles);
    const onboardingConfig = await getForumOnboardingConfig(shiftId);
    const settings = await getForumSettings(shiftId);
    const groupsWithSeats = await listShiftGroupsWithSeats(shiftId);
    res.json({
      roles: roles.length ? roles : undefined,
      goalQuestions: onboardingConfig.goalQuestions,
      interestGroups: onboardingConfig.interestGroups,
      interestMin: onboardingConfig.interestMin,
      interestMax: onboardingConfig.interestMax,
      diagnostics: {
        optionToRole: onboardingConfig.optionToRole,
        questions: onboardingConfig.questions,
      },
      catalog: {
        interestGroups: onboardingConfig.interestGroups,
      },
      groupAssignMode: settings?.groupAssignMode || 'list',
      groups: groupsWithSeats,
      activeShiftId: shiftId,
      publishedShifts,
    });
  } catch (error) {
    console.error('listOnboardingMeta:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
