import { Response } from 'express';
import { eq, desc, and, or, isNull, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  piggybank, answers, taskSubmissions, tasks, questions, participants,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getRoleMeta } from '../services/roleService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { gatherProfileBundle, streamProfilePdf } from '../services/profilePdfBuilder.js';
import { getLevel } from '../services/pointsService.js';
import { buildOutcomesHeuristic } from '../services/profileOutcomes.js';
import {
  PIGGYBANK_TAGS,
  PIGGYBANK_SOURCES,
  entryHasTag,
  formatTagsForExport,
} from '../services/piggybankDict.js';
import { createPiggybankEntry, filterPiggybankEntries } from '../services/piggybankService.js';

export const getProfile = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const bundle = await gatherProfileBundle(req.participant!.id);
    if (!bundle) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const p = bundle.participant;
    const role = p.pedagogicalRole ? getRoleMeta(p.pedagogicalRole) : null;
    const pathLevel = await getLevel(p.pathPoints ?? 0, 'path');
    const experienceLevel = await getLevel(p.experiencePoints ?? 0, 'experience');
    const ideas = bundle.allPiggy.filter(e => entryHasTag(e, 'идея'));

    res.json({
      user: {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        direction: p.direction,
        age: p.age,
        workplace: p.workplace,
        position: p.position,
        groupId: p.groupId,
        groupName: p.groupName,
        shiftLabel: bundle.shiftLabel,
        pedagogicalRole: p.pedagogicalRole,
        pedagogicalRoleName: role?.name ?? null,
        pedagogicalRoleQuadrant: role?.quadrant ?? null,
        leadingRoleStart: p.pedagogicalRole,
        leadingRoleStartName: role?.name ?? null,
        strongRole: p.strongRole,
        strongRoleName: bundle.actionStyle.strongRole?.name ?? null,
        growthRole: p.growthRole,
        growthRoleName: bundle.actionStyle.growthRole?.name ?? null,
        nextExperiment: p.nextExperiment,
        qrToken: p.qrToken || null,
        hideFromLeaderboard: !!p.hideFromLeaderboard,
        pushOptOut: (p.pushOptOut as Record<string, boolean>) || {},
      },
      stats: {
        activities: bundle.userAnswers.length + bundle.userTasks.length,
        tasksDone: bundle.userTasks.filter(t => t.status === 'approved').length,
        ideas: ideas.length,
        answers: bundle.userAnswers.length,
      },
      metrics: bundle.metrics,
      points: {
        path: p.pathPoints ?? 0,
        experience: p.experiencePoints ?? 0,
        bonus: p.bonusPoints ?? 0,
        total: (p.pathPoints ?? 0) + (p.experiencePoints ?? 0) + (p.bonusPoints ?? 0),
        pathLevel,
        experienceLevel,
      },
      trajectory: bundle.trajectory,
      myRequest: bundle.goals[2] || null,
      goalAnswers: bundle.goals,
      goalSetting: p.interests ? { interests: p.interests } : null,
      actionStyle: bundle.actionStyle,
      outcomes: bundle.outcomes,
      piggybankCount: bundle.piggybankCount,
      piggybankTags: bundle.piggybankTags,
      nextSteps: bundle.nextSteps,
      showNextSteps: bundle.showNextSteps,
      recommendation: bundle.recommendation,
      dailyTracker: bundle.dailyTracker,
      dict: bundle.dict,
      roleTrajectory: bundle.roleTrajectory,
      finalCard: bundle.finalCard,
      pdf: bundle.pdf,
      currentDay: bundle.currentDay,
    });
  } catch (error) {
    console.error('getProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadMyProfilePdf = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const bundle = await gatherProfileBundle(req.participant!.id);
    if (!bundle) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!bundle.pdf.available) {
      res.status(403).json({ error: 'PDF not available yet' });
      return;
    }
    await streamProfilePdf(bundle, res);
  } catch (error) {
    console.error('downloadMyProfilePdf:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tag = req.query.tag as string | undefined;
    const source = req.query.source as string | undefined;
    const day = req.query.day as string | undefined;
    const q = req.query.q as string | undefined;

    const entries = await db.select().from(piggybank)
      .where(and(
        eq(piggybank.participantId, req.participant!.id),
        isNull(piggybank.deletedAt),
        or(eq(piggybank.isHidden, false), isNull(piggybank.isHidden)),
      ))
      .orderBy(desc(piggybank.createdAt));

    const filtered = filterPiggybankEntries(entries, {
      tag,
      source,
      day: day != null && day !== '' ? Number(day) : undefined,
      q,
    }, (e, t) => entryHasTag(e, t));

    res.json({ entries: filtered, dict: { tags: PIGGYBANK_TAGS, sources: PIGGYBANK_SOURCES } });
  } catch (error) {
    console.error('listPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tagsInput = req.body.tags ?? req.body.tag;
    const text = req.body.text;
    const source = req.body.source;

    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    try {
      const entry = await createPiggybankEntry({
        participantId: req.participant!.id,
        text,
        tags: tagsInput,
        source,
      });
      res.json({ entry });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid payload';
      res.status(400).json({ error: msg });
    }
  } catch (error) {
    console.error('createPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Внутренний хелпер для админ-экспортов / аналитики глубины */
export function depthForAnswerText(text: string) {
  return inferReflectionDepth(text);
}

/** Участник удаляет себя из программы: данные в БД сохраняются, выставляется self_deleted_at */
export const deleteMyProfile = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const [updated] = await db.update(participants)
      .set({ selfDeletedAt: new Date() })
      .where(eq(participants.id, req.participant!.id))
      .returning({ selfDeletedAt: participants.selfDeletedAt });
    res.json({ status: 'ok', deletedAt: updated?.selfDeletedAt });
  } catch (error) {
    console.error('deleteMyProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfileSettings = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const patch: Partial<typeof participants.$inferInsert> = {};
    if (typeof req.body.hideFromLeaderboard === 'boolean') {
      patch.hideFromLeaderboard = req.body.hideFromLeaderboard;
    }
    if (req.body.pushOptOut && typeof req.body.pushOptOut === 'object') {
      const allowed = ['touchpoints', 'program', 'tasks', 'exchange', 'all'] as const;
      const incoming = req.body.pushOptOut as Record<string, unknown>;
      const current = (req.participant!.pushOptOut as Record<string, boolean>) || {};
      const next: Record<string, boolean> = { ...current };
      for (const key of allowed) {
        if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
      }
      patch.pushOptOut = next;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No settings' });
      return;
    }
    const [updated] = await db.update(participants)
      .set(patch)
      .where(eq(participants.id, req.participant!.id))
      .returning();
    res.json({
      user: {
        hideFromLeaderboard: updated.hideFromLeaderboard,
        pushOptOut: updated.pushOptOut || {},
        qrToken: updated.qrToken,
      },
    });
  } catch (error) {
    console.error('updateProfileSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicLeaderboard = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const track = (req.query.track as string) || 'total';
    const directionFilter = (req.query.direction as string) || '';
    const scopeRaw = (req.query.scope as string) || 'total';
    const scope = (scopeRaw === 'day' || scopeRaw === 'shift') ? scopeRaw : 'total';
    const dayNum = req.query.day != null ? Number(req.query.day) : undefined;
    const medalId = req.query.medalId != null ? Number(req.query.medalId) : undefined;

    const { getForumSettings } = await import('../services/helpers.js');
    const {
      normalizeLeaderboardScopes,
      isLeaderboardScopeEnabled,
    } = await import('../services/leaderboardService.js');
    const settings = await getForumSettings();
    const scopes = normalizeLeaderboardScopes(settings?.leaderboardScopes);
    if (!isLeaderboardScopeEnabled(scopes, scope, track)) {
      res.status(400).json({ error: 'Leaderboard scope disabled' });
      return;
    }

    const list = await db.select({
      id: participants.id,
      firstName: participants.firstName,
      lastName: participants.lastName,
      direction: participants.direction,
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
      bonusPoints: participants.bonusPoints,
      hideFromLeaderboard: participants.hideFromLeaderboard,
      selfDeletedAt: participants.selfDeletedAt,
    }).from(participants);

    const me = req.participant!.id;
    const directions = [...new Set(list.map(p => p.direction).filter(Boolean))] as string[];
    let medalSet: Set<number> | null = null;
    if (medalId && !Number.isNaN(medalId)) {
      const { participantIdsWithMedal } = await import('../services/leaderboardService.js');
      medalSet = await participantIdsWithMedal(medalId);
    }

    const eligible = list
      .filter(p => !p.selfDeletedAt)
      .filter(p => !p.hideFromLeaderboard || p.id === me)
      .filter(p => !directionFilter || p.direction === directionFilter)
      .filter(p => !medalSet || medalSet.has(p.id));

    const { computeLeaderboardScores } = await import('../services/leaderboardService.js');
    const scoreMap = await computeLeaderboardScores(
      eligible.map(p => p.id),
      {
        scope,
        day: scope === 'day' ? dayNum : undefined,
        track,
      },
    );

    const rows = eligible
      .map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        direction: p.direction,
        score: scoreMap.get(p.id) ?? 0,
        isMe: p.id === me,
      }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, ...p }));

    const myRank = rows.find(r => r.isMe)?.rank ?? null;
    res.json({
      track,
      scope,
      day: scope === 'day' ? (dayNum ?? null) : null,
      direction: directionFilter || null,
      medalId: medalId && !Number.isNaN(medalId) ? medalId : null,
      directions,
      myRank,
      leaders: rows.slice(0, 50),
    });
  } catch (error) {
    console.error('getPublicLeaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const exportPiggybankText = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tag = req.query.tag as string | undefined;
    const source = req.query.source as string | undefined;
    const day = req.query.day as string | undefined;
    const q = req.query.q as string | undefined;

    const entries = await db.select().from(piggybank)
      .where(eq(piggybank.participantId, req.participant!.id))
      .orderBy(desc(piggybank.createdAt));

    const filtered = filterPiggybankEntries(entries, {
      tag,
      source,
      day: day != null && day !== '' ? Number(day) : undefined,
      q,
    }, (e, t) => entryHasTag(e, t));

    const body = filtered.map(e => {
      const dayLabel = e.forumDay ? ` · Д${e.forumDay}` : '';
      return `[${e.createdAt?.toISOString() || ''}] #${formatTagsForExport(e)} · ${e.source}${dayLabel}\n${e.text}`;
    }).join('\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=piggybank.txt');
    res.send('\uFEFF' + (body || 'Копилка пуста'));
  } catch (error) {
    console.error('exportPiggybankText:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listMyMedals = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { medals, userMedals } = await import('../db/schema.js');
    const rows = await db.select({
      um: userMedals,
      m: medals,
    }).from(userMedals)
      .leftJoin(medals, eq(userMedals.medalId, medals.id))
      .where(eq(userMedals.participantId, req.participant!.id));

    res.json({
      medals: rows.map(r => ({
        id: r.um.id,
        awardedAt: r.um.awardedAt,
        way: r.um.way,
        name: r.m?.name,
        description: r.m?.description,
        level: r.m?.level,
        category: r.m?.category,
        iconUrl: r.m?.iconUrl,
      })),
    });
  } catch (error) {
    console.error('listMyMedals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listMedalsCatalog = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { medals, userMedals } = await import('../db/schema.js');
    const { parseMedalRule, getMedalRuleProgress } = await import('../services/medalEvaluator.js');
    const catalog = await db.select().from(medals).where(eq(medals.isActive, true));
    const owned = await db.select().from(userMedals)
      .where(eq(userMedals.participantId, req.participant!.id));
    const ownedMedalIds = new Set(owned.map(o => o.medalId));
    const participantId = req.participant!.id;

    const visible = catalog.filter(m => {
      const earned = ownedMedalIds.has(m.id);
      if (m.visibility === 'hidden' && !earned) return false;
      return true;
    });

    const medalsOut = await Promise.all(visible.map(async m => {
      const earned = ownedMedalIds.has(m.id);
      const parsed = parseMedalRule(m.conditionRule);
      let progress: { current: number; target: number } | null = null;
      let conditionLabel: string | null = null;
      if (!earned && m.awardType === 'auto' && m.visibility === 'open' && parsed) {
        const p = await getMedalRuleProgress(participantId, parsed);
        progress = { current: p.current, target: p.target };
        conditionLabel = p.conditionLabel;
      }
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        level: m.level,
        category: m.category,
        iconUrl: m.iconUrl,
        awardType: m.awardType,
        visibility: m.visibility,
        earned,
        awardedAt: owned.find(o => o.medalId === m.id)?.awardedAt ?? null,
        progress,
        conditionLabel,
      };
    }));

    res.json({ medals: medalsOut });
  } catch (error) {
    console.error('listMedalsCatalog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const synthesizeMyOutcomes = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const bundle = await gatherProfileBundle(req.participant!.id);
    if (!bundle) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const bullets = buildOutcomesHeuristic({
      answersCount: bundle.userAnswers.length,
      tasksApproved: bundle.userTasks.filter(t => t.status === 'approved').length,
      piggyTotal: bundle.allPiggy.length,
      piggyInWork: bundle.allPiggy.filter(e => entryHasTag(e, 'в работу')).length,
      eveningNotes: bundle.actionStyle.selfInsights,
    });
    await db.update(participants)
      .set({ outcomesEdited: { bullets, generatedAt: new Date().toISOString(), source: 'heuristic' } })
      .where(eq(participants.id, req.participant!.id));
    res.json({ bullets, source: 'heuristic', configured: false });
  } catch (error) {
    console.error('synthesizeMyOutcomes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
