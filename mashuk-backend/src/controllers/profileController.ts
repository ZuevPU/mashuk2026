import { Response } from 'express';
import { eq, desc, and, or, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  piggybank, answers, taskSubmissions, tasks, questions, participants, directions, pointsLog,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getRoleMeta, interestTagsFromConfig, normalizeOnboardingConfig } from '../services/roleService.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';
import { generateQrToken } from '../services/qrService.js';
import { getLevel, participantRatingScore, isUnifiedRatingEnabled } from '../services/pointsService.js';
import { buildOutcomesHeuristic } from '../services/profileOutcomes.js';
import {
  PIGGYBANK_TAGS,
  PIGGYBANK_SOURCES,
  entryHasTag,
  formatTagsForExport,
} from '../services/piggybankDict.js';
import { createPiggybankEntry, filterPiggybankEntries } from '../services/piggybankService.js';
import { gatherProfileBundle, streamProfilePdf } from '../services/profilePdfBuilder.js';
import { answerText } from '../services/exports/exportCommon.js';
import { getForumSettings } from '../services/helpers.js';
import { parseEditablePersonName } from '../services/participantName.js';
import { isSecondShift, normalizeInterestList } from '../services/shift2InterestsGate.js';
import { getShiftById } from '../services/shiftService.js';
import { buildPointARequestItems } from '../services/pointARequest.js';

export const getProfile = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const bundle = await gatherProfileBundle(req.participant!.id);
    if (!bundle) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    let p = bundle.participant;
    // Ensure every participant has a QR token (needed for volunteer scan)
    if (!p.qrToken) {
      const token = generateQrToken();
      const [updated] = await db.update(participants)
        .set({ qrToken: token })
        .where(eq(participants.id, p.id))
        .returning();
      if (updated) p = { ...p, qrToken: updated.qrToken };
    }
    const role = p.pedagogicalRole ? getRoleMeta(p.pedagogicalRole) : null;
    const pathLevel = await getLevel(p.pathPoints ?? 0, 'path');
    const experienceLevel = await getLevel(p.experiencePoints ?? 0, 'experience');
    const ideas = bundle.allPiggy.filter(e => entryHasTag(e, 'идея'));
    const unifiedRating = isUnifiedRatingEnabled();
    const ratingScore = participantRatingScore({
      pathPoints: p.pathPoints,
      experiencePoints: p.experiencePoints,
      bonusPoints: p.bonusPoints,
      forumPoints: p.forumPoints,
    });
    const ratingLevel = await getLevel(ratingScore, 'experience');
    const settings = await getForumSettings(p.shiftId);
    const onboarding = normalizeOnboardingConfig(
      (settings as { roleDiagnosticsConfig?: unknown }).roleDiagnosticsConfig,
    );
    const goalRequestItems = buildPointARequestItems(onboarding.goalQuestions, bundle.goals);

    res.json({
      user: {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        direction: p.direction,
        age: p.age,
        workplace: p.workplace,
        position: p.position,
        region: p.region,
        groupId: p.groupId,
        groupName: p.groupName,
        shiftId: p.shiftId,
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
        avatarUrl: p.avatarUrl || null,
      },
      stats: {
        activities: bundle.userAnswers.length + bundle.userTasks.length,
        tasksDone: bundle.userTasks.filter(t => t.status === 'approved').length,
        ideas: ideas.length,
        answers: bundle.userAnswers.length,
      },
      metrics: bundle.metrics,
      points: {
        unified: unifiedRating,
        rating: ratingScore,
        path: p.pathPoints ?? 0,
        experience: p.experiencePoints ?? 0,
        bonus: p.bonusPoints ?? 0,
        total: ratingScore,
        pathLevel,
        experienceLevel,
        ratingLevel: unifiedRating ? ratingLevel : undefined,
      },
      trajectory: bundle.trajectory,
      myRequest: goalRequestItems[0]?.answer || bundle.goals[0] || null,
      goalAnswers: bundle.goals,
      goalQuestions: onboarding.goalQuestions,
      goalRequestItems,
      goalSetting: p.interests ? { interests: p.interests } : null,
      interests: Array.isArray(p.interests) ? (p.interests as string[]) : [],
      actionStyle: bundle.actionStyle,
      lastExperimentReflection: bundle.lastExperimentReflection ?? null,
      outcomes: bundle.outcomes,
      recentReflections: bundle.recentReflections,
      piggybankCount: bundle.piggybankCount,
      piggybankTags: bundle.piggybankTags,
      piggybankSources: bundle.piggybankSources,
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

export const getMyShiftResults = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string) || 'json';
    const { gatherShiftResults, streamShiftResultsPdf, shiftResultsToCsv } = await import('../services/shiftResultsService.js');
    const data = await gatherShiftResults(req.participant!.id);
    if (!data) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="shift_results.csv"');
      res.send('\uFEFF' + shiftResultsToCsv(data));
      return;
    }
    if (format === 'pdf') {
      await streamShiftResultsPdf(data, res);
      return;
    }
    res.json(data);
  } catch (error) {
    console.error('getMyShiftResults:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tag = req.query.tag as string | undefined;
    const source = req.query.source as string | undefined;
    const day = req.query.day as string | undefined;
    const q = req.query.q as string | undefined;

    // Активные (не скрытые) + снятые модератором в архив (deletedAt) — их показываем с пометкой
    const rows = await db.select({
      e: piggybank,
      logPoints: pointsLog.points,
      logRevokedAt: pointsLog.revokedAt,
    })
      .from(piggybank)
      .leftJoin(pointsLog, eq(piggybank.pointsLogId, pointsLog.id))
      .where(and(
        eq(piggybank.participantId, req.participant!.id),
        or(
          isNotNull(piggybank.deletedAt),
          and(
            isNull(piggybank.deletedAt),
            or(eq(piggybank.isHidden, false), isNull(piggybank.isHidden)),
          ),
        ),
      ))
      .orderBy(desc(piggybank.createdAt));

    const entries = rows.map(({ e, logPoints, logRevokedAt }) => {
      const removed = e.deletedAt != null;
      const absPoints = typeof logPoints === 'number' ? Math.abs(logPoints) : 0;
      const pointsDelta = removed
        ? (absPoints > 0 ? -absPoints : 0)
        : (logRevokedAt ? 0 : absPoints);
      return {
        ...e,
        removed,
        pointsDelta,
        pointsLabel: pointsDelta < 0
          ? `${pointsDelta}`
          : pointsDelta > 0
            ? `+${pointsDelta}`
            : null,
      };
    });

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
    const me = req.participant!;
    const [updated] = await db.update(participants)
      .set({ selfDeletedAt: new Date() })
      .where(eq(participants.id, me.id))
      .returning({
        id: participants.id,
        selfDeletedAt: participants.selfDeletedAt,
        firstName: participants.firstName,
        lastName: participants.lastName,
        vkId: participants.vkId,
      });
    if (!updated?.selfDeletedAt) {
      res.status(500).json({ error: 'Не удалось отметить профиль удалённым' });
      return;
    }
    const { logAdminAction } = await import('../services/adminActionsLog.js');
    await logAdminAction({
      adminLogin: 'participant',
      actionType: 'participant_self_delete',
      section: 'participants',
      objectId: me.id,
      oldValue: {
        vkId: me.vkId,
        firstName: me.firstName,
        lastName: me.lastName,
        shiftId: me.shiftId,
      },
      newValue: { selfDeletedAt: updated.selfDeletedAt },
      isCritical: true,
    });
    res.json({ status: 'ok', deletedAt: updated.selfDeletedAt });
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

export const updateParticipantName = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const parsed = parseEditablePersonName(req.body?.firstName, req.body?.lastName);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const [updated] = await db.update(participants)
      .set({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
      })
      .where(eq(participants.id, req.participant!.id))
      .returning({
        firstName: participants.firstName,
        lastName: participants.lastName,
      });
    res.json({
      status: 'ok',
      user: {
        firstName: updated.firstName,
        lastName: updated.lastName,
      },
    });
  } catch (error) {
    console.error('updateParticipantName:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateParticipantInterests = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const me = req.participant!;
    const shift = await getShiftById(me.shiftId);
    if (!isSecondShift(shift)) {
      res.status(400).json({ error: 'Повторный выбор интересов доступен только во второй смене' });
      return;
    }
    const config = normalizeOnboardingConfig((await getForumSettings(me.shiftId))?.roleDiagnosticsConfig);
    const picked = normalizeInterestList(req.body?.interests);
    if (picked.length < config.interestMin || picked.length > config.interestMax) {
      res.status(400).json({
        error: `Выберите от ${config.interestMin} до ${config.interestMax} интересов`,
      });
      return;
    }
    const allowed = interestTagsFromConfig(config);
    if (picked.some(tag => !allowed.has(tag))) {
      res.status(400).json({ error: 'Выберите интересы из списка смены' });
      return;
    }
    const [updated] = await db.update(participants)
      .set({ interests: picked, interestsReselectedAt: new Date() })
      .where(eq(participants.id, me.id))
      .returning();
    res.json({
      status: 'ok',
      interests: Array.isArray(updated.interests) ? updated.interests : picked,
      interestsReselectedAt: updated.interestsReselectedAt,
    });
  } catch (error) {
    console.error('updateParticipantInterests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicLeaderboard = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { parseLeaderboardQuery } = await import('../services/leaderboardQuery.js');
    const { buildLeaderboardResult } = await import('../services/leaderboardBuild.js');
    const { getForumSettings } = await import('../services/helpers.js');
    const {
      normalizeLeaderboardScopes,
      isLeaderboardScopeEnabled,
      NOMINATION_LEADERBOARD_KEYS,
    } = await import('../services/leaderboardService.js');

    const query = parseLeaderboardQuery(req.query as Record<string, unknown>);
    const settings = await getForumSettings(req.participant!.shiftId);
    const scopes = normalizeLeaderboardScopes(settings?.leaderboardScopes);
    const me = req.participant!.id;

    if (query.mode === 'nomination' && query.nomination) {
      if (!NOMINATION_LEADERBOARD_KEYS.includes(query.nomination as typeof NOMINATION_LEADERBOARD_KEYS[number])) {
        res.status(400).json({ error: 'Invalid nomination' });
        return;
      }
    } else if (query.mode === 'points' && query.medalMode !== 'count' && !isLeaderboardScopeEnabled(scopes, query.scope, query.track)) {
      res.status(400).json({ error: 'Leaderboard scope disabled' });
      return;
    }

    // Same shift scope as admin rating — without this, old shift copies of the same VK
    // user appear with stale direction/points.
    const shiftId = req.participant!.shiftId;
    const list = await db.select({
      id: participants.id,
      firstName: participants.firstName,
      lastName: participants.lastName,
      direction: sql<string | null>`COALESCE(${directions.name}, ${participants.direction})`,
      directionStored: participants.direction,
      directionId: participants.directionId,
      groupId: participants.groupId,
      groupName: participants.groupName,
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
      bonusPoints: participants.bonusPoints,
      forumPoints: participants.forumPoints,
      hideFromLeaderboard: participants.hideFromLeaderboard,
      selfDeletedAt: participants.selfDeletedAt,
      avatarUrl: participants.avatarUrl,
      vkId: participants.vkId,
    }).from(participants)
      .leftJoin(directions, eq(participants.directionId, directions.id))
      .where(eq(participants.shiftId, shiftId));

    const { collectOrganizerDirectionIds } = await import('../services/leaderboardQuery.js');
    const allDirections = await db.select({
      id: directions.id,
      name: directions.name,
      isOrganizer: directions.isOrganizer,
    }).from(directions).where(eq(directions.shiftId, shiftId));
    const organizerDirectionIds = collectOrganizerDirectionIds(allDirections);

    const { enrichParticipantsWithAvatarUrls } = await import('../services/participantAvatarSync.js');
    const withAvatars = await enrichParticipantsWithAvatarUrls(list);

    const full = await buildLeaderboardResult(withAvatars, { ...query, limit: 0 }, {
      keepParticipantId: me,
      hideFromLeaderboard: true,
      organizerDirectionIds,
    });
    const myRank = full.leaders.find(r => r.id === me)?.rank ?? null;
    const leaders = query.limit > 0 ? full.leaders.slice(0, query.limit) : full.leaders;

    res.json({
      mode: full.mode,
      track: full.track,
      scope: full.scope,
      nomination: full.nomination,
      day: full.day,
      direction: full.direction,
      groupId: full.groupId,
      medalId: full.medalId,
      medalMode: full.medalMode,
      medalFilter: full.medalFilter,
      sort: full.sort,
      directions: full.directions,
      groups: full.groups,
      myRank,
      participantCount: full.participantCount,
      leaders: leaders.map(r => ({
        ...r,
        name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
        isMe: r.id === me,
      })),
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
      .where(and(eq(piggybank.participantId, req.participant!.id), isNull(piggybank.deletedAt)))
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

export const regenerateMyQr = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const token = generateQrToken();
    const [updated] = await db.update(participants)
      .set({ qrToken: token })
      .where(eq(participants.id, req.participant!.id))
      .returning({ qrToken: participants.qrToken, id: participants.id });
    res.json({ qrToken: updated.qrToken, participantId: updated.id });
  } catch (error) {
    console.error('regenerateMyQr:', error);
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
      eveningNotes: bundle.eveningNotes ?? [],
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
