import { Response } from 'express';
import { eq, asc, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { participants, directions, pedagogicalRoles, forumSettings, participantGroups } from '../db/schema.js';
import { VkAuthRequest } from '../middlewares/vkAuth.js';
import { scorePedagogicalRole, getRoleMeta, INTEREST_GROUPS, getDefaultDiagnosticsConfig, normalizeOptionToRole } from '../services/roleService.js';
import { getActiveConsentVersions } from './consentsController.js';
import { generateQrToken } from '../services/qrService.js';

const ALL_INTEREST_TAGS = new Set(INTEREST_GROUPS.flatMap(g => g.tags));

const onboardingSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  age: z.coerce.number().int().min(14).max(100),
  directionId: z.coerce.number().int().positive(),
  workplace: z.string().min(1).max(500),
  position: z.string().min(1).max(500),
  consentPd: z.literal(true),
  consentAnalytics: z.literal(true),
  consentPdVersion: z.coerce.number().int().positive().optional(),
  consentAnalyticsVersion: z.coerce.number().int().positive().optional(),
  groupId: z.coerce.number().int().positive().optional().nullable(),
  goalAnswers: z.array(z.string().min(1).max(2000)).length(5),
  interests: z.array(z.string().min(1).max(100)).min(5).max(8),
  roleAnswers: z.array(z.coerce.number().int().min(0).max(3)).length(6),
});

async function assignGroup(
  mode: string,
  groupId: number | null | undefined,
  directionId: number,
): Promise<{ groupId: number | null; groupName: string | null }> {
  if (mode === 'list') {
    if (!groupId) return { groupId: null, groupName: null };
    const [g] = await db.select().from(participantGroups).where(eq(participantGroups.id, groupId)).limit(1);
    if (!g) return { groupId: null, groupName: null };
    const [c] = await db.select({ c: count() }).from(participants).where(eq(participants.groupId, g.id));
    if (g.capacity != null && Number(c?.c ?? 0) >= g.capacity) {
      throw new Error('Группа заполнена');
    }
    return { groupId: g.id, groupName: g.name };
  }

  const groups = await db.select().from(participantGroups).orderBy(asc(participantGroups.id));
  const candidates = groups.filter(g => !g.directionId || g.directionId === directionId);
  const pool = candidates.length ? candidates : groups;
  let best: typeof pool[0] | null = null;
  let bestCount = Infinity;
  for (const g of pool) {
    const [c] = await db.select({ c: count() }).from(participants).where(eq(participants.groupId, g.id));
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

    const [user] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);

    if (!user || !user.onboardingCompletedAt) {
      res.json({ status: 'needs_registration', vkUserId });
      return;
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

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    for (const tag of data.interests) {
      if (!ALL_INTEREST_TAGS.has(tag)) {
        res.status(400).json({ error: `Unknown interest tag: ${tag}` });
        return;
      }
    }

    const [dir] = await db.select().from(directions).where(eq(directions.id, data.directionId)).limit(1);
    if (!dir) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const [settings] = await db.select().from(forumSettings).limit(1);
    const diagMatrix = normalizeOptionToRole(
      (settings?.roleDiagnosticsConfig as { optionToRole?: unknown } | null)?.optionToRole,
    );

    let pedagogicalRole: string;
    try {
      pedagogicalRole = scorePedagogicalRole(data.roleAnswers, diagMatrix);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid roleAnswers' });
      return;
    }

    const [existing] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);
    if (existing?.onboardingCompletedAt) {
      res.json({ status: 'ok', user: existing, role: getRoleMeta(existing.pedagogicalRole || pedagogicalRole) });
      return;
    }

    const mode = settings?.groupAssignMode || 'list';
    let groupAssign: { groupId: number | null; groupName: string | null };
    try {
      groupAssign = await assignGroup(mode, data.groupId, dir.id);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Group assign failed' });
      return;
    }
    if (mode === 'list' && !groupAssign.groupId && (await db.select().from(participantGroups)).length > 0) {
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

    const values = {
      vkId: vkUserId,
      firstName: data.firstName,
      lastName: data.lastName,
      age: data.age,
      workplace: data.workplace,
      position: data.position,
      consentPd: true,
      consentAnalytics: true,
      consentPdVersion: data.consentPdVersion ?? consentVersions.pd,
      consentAnalyticsVersion: data.consentAnalyticsVersion ?? consentVersions.analytics,
      groupId: groupAssign.groupId,
      groupName: groupAssign.groupName,
      directionId: dir.id,
      direction: dir.name,
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

    const [existing] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);
    if (existing?.onboardingCompletedAt) {
      res.json({ status: 'ok', user: existing });
      return;
    }

    const consentVersions = await getActiveConsentVersions();
    const values = {
      vkId: vkUserId,
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
      roleAnswers: [1, 1, 0, 1, 1, 2],
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

    res.json({ status: 'ok', user });
  } catch (error) {
    console.error('register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listOnboardingMeta = async (_req: VkAuthRequest, res: Response): Promise<void> => {
  try {
    const roles = await db.select().from(pedagogicalRoles);
    const [settings] = await db.select().from(forumSettings).limit(1);
    const groups = await db.select().from(participantGroups).orderBy(asc(participantGroups.id));
    const groupsWithFree = await Promise.all(groups.map(async (g) => {
      const [c] = await db.select({ c: count() }).from(participants).where(eq(participants.groupId, g.id));
      const members = Number(c?.c ?? 0);
      return {
        ...g,
        membersCount: members,
        seatsLeft: g.capacity != null ? Math.max(0, g.capacity - members) : null,
      };
    }));
    const defaults = getDefaultDiagnosticsConfig();
    const saved = settings?.roleDiagnosticsConfig as { optionToRole?: unknown; questions?: unknown } | null;
    res.json({
      roles: roles.length ? roles : undefined,
      catalog: {
        interestGroups: INTEREST_GROUPS,
      },
      diagnostics: {
        optionToRole: normalizeOptionToRole(saved?.optionToRole),
        questions: Array.isArray(saved?.questions) && saved!.questions!.length === 6
          ? saved!.questions
          : defaults.questions,
      },
      groupAssignMode: settings?.groupAssignMode || 'list',
      groups: groupsWithFree.filter(g => g.seatsLeft == null || g.seatsLeft > 0),
    });
  } catch (error) {
    console.error('listOnboardingMeta:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
