import { Response } from 'express';
import { and, eq, asc, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { participants, directions, pedagogicalRoles, participantGroups } from '../db/schema.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';
import {
  scorePedagogicalRole,
  getRoleMeta,
  normalizeOnboardingConfig,
  interestTagsFromConfig,
  validateGoalAnswers,
  pruneHiddenGoalAnswers,
} from '../services/roleService.js';
import { normalizeRegion } from '../data/regions.js';
import { getActiveConsentVersions } from './consentsController.js';
import { generateQrToken } from '../services/qrService.js';
import { awardPoints } from '../services/pointsService.js';
import { scheduleParticipantAvatarSync } from '../services/participantAvatarSync.js';
import { getForumSettings } from '../services/helpers.js';
import { findParticipantByVkInActiveShift, resolveActiveShiftId } from '../services/shiftService.js';

async function getForumOnboardingConfig() {
  const settings = await getForumSettings();
  return normalizeOnboardingConfig(settings?.roleDiagnosticsConfig);
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

  // Auto: least-filled group. Direction of the participant is forced from the group later.
  void directionId;
  const groups = await db.select().from(participantGroups)
    .where(eq(participantGroups.shiftId, shiftId))
    .orderBy(asc(participantGroups.id));
  let best: typeof groups[0] | null = null;
  let bestCount = Infinity;
  for (const g of groups) {
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

export const getMe = async (req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await findParticipantByVkInActiveShift(vkUserId);

    if (!user || !user.onboardingCompletedAt) {
      res.json({ status: 'needs_registration', vkUserId });
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

    res.json({ status: 'ok', user });
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
    const onboardingConfig = await getForumOnboardingConfig();
    data.goalAnswers = pruneHiddenGoalAnswers(onboardingConfig.goalQuestions, data.goalAnswers);
    const goalErr = validateGoalAnswers(onboardingConfig.goalQuestions, data.goalAnswers);
    if (goalErr) {
      res.status(400).json({ error: goalErr });
      return;
    }
    if (
      data.interests.length < onboardingConfig.interestMin
      || data.interests.length > onboardingConfig.interestMax
    ) {
      res.status(400).json({
        error: `Выберите от ${onboardingConfig.interestMin} до ${onboardingConfig.interestMax} интересов`,
      });
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

    const [dir] = await db.select().from(directions).where(eq(directions.id, data.directionId)).limit(1);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const settings = await getForumSettings();
    const shiftId = await resolveActiveShiftId();
    const diagMatrix = onboardingConfig.optionToRole;

    let pedagogicalRole: string;
    try {
      pedagogicalRole = scorePedagogicalRole(data.roleAnswers, diagMatrix);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid roleAnswers' });
      return;
    }

    const existing = await findParticipantByVkInActiveShift(vkUserId);
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
    if (mode === 'list' && !groupAssign.groupId
      && (await db.select().from(participantGroups).where(eq(participantGroups.shiftId, shiftId))).length > 0) {
      res.status(400).json({ error: 'Выберите группу' });
      return;
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

    const { resolveDirectionFromGroup } = await import('../services/groupDirectionSync.js');
    const finalDir = await resolveDirectionFromGroup(groupAssign.groupId, { id: dir.id, name: dir.name });

    const values = {
      vkId: vkUserId,
      shiftId,
      firstName: data.firstName,
      lastName: data.lastName,
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
      directionId: finalDir.id,
      direction: finalDir.name,
      interests: data.interests,
      goalAnswers: data.goalAnswers,
      roleAnswers: data.roleAnswers,
      pedagogicalRole,
      qrToken: generateQrToken(),
      onboardingCompletedAt: new Date(),
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

    const [dir] = await db.select().from(directions).where(eq(directions.id, Number(directionId))).limit(1);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const existing = await findParticipantByVkInActiveShift(vkUserId);
    if (existing?.onboardingCompletedAt) {
      res.json({ status: 'ok', user: existing });
      return;
    }

    const consentVersions = await getActiveConsentVersions();
    const shiftId = await resolveActiveShiftId();
    const values = {
      vkId: vkUserId,
      shiftId,
      firstName: firstName || null,
      lastName: lastName || null,
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

export const listOnboardingMeta = async (_req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const roles = await db.select().from(pedagogicalRoles);
    const settings = await getForumSettings();
    const shiftId = await resolveActiveShiftId();
    const groups = await db.select().from(participantGroups)
      .where(eq(participantGroups.shiftId, shiftId))
      .orderBy(asc(participantGroups.id));
    const groupsWithFree = await Promise.all(groups.map(async (g) => {
      const [c] = await db.select({ c: count() }).from(participants).where(and(
        eq(participants.groupId, g.id),
        eq(participants.shiftId, shiftId),
      ));
      const members = Number(c?.c ?? 0);
      return {
        ...g,
        membersCount: members,
        seatsLeft: g.capacity != null ? Math.max(0, g.capacity - members) : null,
      };
    }));
    const onboardingConfig = normalizeOnboardingConfig(settings?.roleDiagnosticsConfig);
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
      groups: groupsWithFree.filter(g => g.seatsLeft == null || g.seatsLeft > 0),
      activeShiftId: shiftId,
    });
  } catch (error) {
    console.error('listOnboardingMeta:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
