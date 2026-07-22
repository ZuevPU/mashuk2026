import { Response } from 'express';
import { eq, desc, and, or, isNull, lte, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  piggybank, answers, taskSubmissions, tasks, questions, participantDayState, participants,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getLevel, awardPoints } from '../services/pointsService.js';
import { getForumSettings, resolveEffectiveCurrentDay } from '../services/helpers.js';
import { getRoleMeta, ROLE_KEYS } from '../services/roleService.js';
import {
  normalizePiggybankTag,
  normalizePiggybankSource,
  isAllowedPiggybankTag,
  isAllowedPiggybankSource,
  pointsActionForTag,
  ORG_TAG,
  PIGGYBANK_TAGS,
  PIGGYBANK_SOURCES,
} from '../services/piggybankDict.js';
import { inferReflectionDepth } from '../services/reflectionDepth.js';

function buildRoleRoute(startKey: string | null, dayRoles: string[], growthKey: string | null): string {
  const start = startKey ? getRoleMeta(startKey)?.name : null;
  const counts = new Map<string, number>();
  for (const k of dayRoles) {
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let topKey: string | null = null;
  let topN = 0;
  for (const [k, n] of counts) {
    if (n > topN) { topKey = k; topN = n; }
  }
  const explored = topKey ? getRoleMeta(topKey)?.name : null;
  const growth = growthKey ? getRoleMeta(growthKey)?.name : null;
  const parts: string[] = [];
  if (start) parts.push(`от ${start}`);
  if (explored && explored !== start) parts.push(`через ${explored}`);
  if (growth) parts.push(`рост · ${growth}`);
  return parts.join(' → ') || 'Маршрут ролей появится по ходу смены';
}

export const getProfile = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const p = req.participant!;
    const settings = await getForumSettings();
    const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
    const userTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.participantId, p.id));
    const allPiggy = await db.select().from(piggybank).where(eq(piggybank.participantId, p.id));
    const ideas = allPiggy.filter(e => e.tag === 'идея');

    const pathLevel = await getLevel(p.pathPoints ?? 0, 'path');
    const experienceLevel = await getLevel(p.experiencePoints ?? 0, 'experience');
    const role = p.pedagogicalRole ? getRoleMeta(p.pedagogicalRole) : null;
    const goals = Array.isArray(p.goalAnswers) ? (p.goalAnswers as string[]) : [];

    const startDate = settings.startDate ? new Date(settings.startDate) : new Date('2026-08-12');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + ((settings.totalDays ?? 8) - 1));

    const tagCounts: Record<string, number> = {};
    for (const e of allPiggy) {
      if (!e.tag) continue;
      tagCounts[e.tag] = (tagCounts[e.tag] || 0) + 1;
    }

    const openTasks = await db.select().from(tasks)
      .where(or(isNull(tasks.dayNumber), eq(tasks.dayNumber, settings.currentDay ?? 1)));
    const submittedIds = new Set(userTasks.map(t => t.taskId));
    const nextSteps = openTasks
      .filter(t => !submittedIds.has(t.id))
      .slice(0, 3)
      .map(t => t.title);

    const unanswered = await db.select().from(questions)
      .where(and(
        eq(questions.status, 'published'),
        or(isNull(questions.publishTime), lte(questions.publishTime, new Date())),
      ));
    const answeredIds = new Set(userAnswers.map(a => a.questionId));
    for (const q of unanswered) {
      if (!answeredIds.has(q.id) && nextSteps.length < 5) {
        nextSteps.push(`Ответить: ${q.title}`);
      }
    }

    const dayStates = await db.select().from(participantDayState)
      .where(eq(participantDayState.participantId, p.id))
      .orderBy(asc(participantDayState.dayNumber));

    const roleByDay = dayStates.map(s => ({
      dayNumber: s.dayNumber,
      activeRoleKey: s.activeRoleKey,
      activeRoleName: s.activeRoleKey ? getRoleMeta(s.activeRoleKey)?.name ?? s.activeRoleKey : null,
      tomorrowRoleKey: s.tomorrowRoleKey,
      experimentStatus: s.experimentStatus,
      eveningNote: (s.eveningRatings as { note?: string } | null)?.note ?? null,
    }));

    const roleCounts: Record<string, number> = {};
    for (const k of ROLE_KEYS) roleCounts[k] = 0;
    for (const s of dayStates) {
      if (s.activeRoleKey && roleCounts[s.activeRoleKey] !== undefined) {
        roleCounts[s.activeRoleKey] += 1;
      }
    }

    // Точка Б: из профиля или из answers блока «Точка Б»
    let pointBAnswers = p.pointBAnswers ?? null;
    if (!pointBAnswers) {
      const pointBQs = await db.select().from(questions).where(eq(questions.block, 'Точка Б'));
      const pbIds = new Set(pointBQs.map(q => q.id));
      const pbAnswers = userAnswers.filter(a => pbIds.has(a.questionId));
      if (pbAnswers.length > 0) {
        pointBAnswers = pbAnswers.map(a => a.answerData);
      }
    }

    const hasPointB = !!(pointBAnswers && (
      Array.isArray(pointBAnswers) ? pointBAnswers.length > 0 : Object.keys(pointBAnswers as object).length > 0
    ));

    const pointAList = goals;
    const pointBList = Array.isArray(pointBAnswers)
      ? pointBAnswers.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
      : [];

    const comparison = pointAList.map((a, i) => ({
      index: i + 1,
      pointA: a,
      pointB: pointBList[i] ?? null,
    }));

    const keyFindings = allPiggy
      .filter(e => e.tag === 'идея' || e.tag === 'мысль')
      .slice(0, 5)
      .map(e => ({ id: e.id, tag: e.tag, text: e.text, source: e.source, createdAt: e.createdAt }));

    const plans = allPiggy
      .filter(e => e.tag === 'в работу')
      .map(e => ({ id: e.id, text: e.text, source: e.source, createdAt: e.createdAt }));

    const strongMeta = p.strongRole ? getRoleMeta(p.strongRole) : null;
    const growthMeta = p.growthRole ? getRoleMeta(p.growthRole) : null;
    const roleRoute = buildRoleRoute(
      p.pedagogicalRole,
      dayStates.map(s => s.activeRoleKey).filter(Boolean) as string[],
      p.growthRole,
    );

    const outcomesSummary = p.outcomesEdited
      ?? (userAnswers.length >= 3
        ? `Вы ответили на ${userAnswers.length} вопросов и выполнили ${userTasks.filter(t => t.status === 'approved').length} заданий`
        : null);

    const editedNextSteps = Array.isArray(p.nextStepsEdited) ? p.nextStepsEdited as string[] : null;
    const currentDay = resolveEffectiveCurrentDay(settings);
    const showNextSteps = !!editedNextSteps || (currentDay >= 6 && currentDay <= 7);
    const visibleNextSteps = showNextSteps ? (editedNextSteps ?? nextSteps) : [];

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
        pedagogicalRole: p.pedagogicalRole,
        pedagogicalRoleName: role?.name ?? null,
        pedagogicalRoleQuadrant: role?.quadrant ?? null,
        strongRole: p.strongRole,
        strongRoleName: strongMeta?.name ?? null,
        growthRole: p.growthRole,
        growthRoleName: growthMeta?.name ?? null,
        nextExperiment: p.nextExperiment,
        qrToken: p.qrToken || null,
        hideFromLeaderboard: !!p.hideFromLeaderboard,
        pushOptOut: (p.pushOptOut as Record<string, boolean>) || {},
      },
      stats: {
        activities: userAnswers.length + userTasks.length,
        tasksDone: userTasks.filter(t => t.status === 'approved').length,
        ideas: ideas.length,
        answers: userAnswers.length,
      },
      points: {
        path: p.pathPoints ?? 0,
        experience: p.experiencePoints ?? 0,
        pathLevel,
        experienceLevel,
      },
      trajectory: {
        from: 'Точка А',
        to: 'Точка Б',
        fromDate: startDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        toDate: endDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        progressPercent: Math.min(100, Math.round(((settings.currentDay ?? 1) - 1) / Math.max(1, (settings.totalDays ?? 8) - 1) * 100)),
      },
      myRequest: goals[2] || null,
      goalAnswers: goals,
      goalSetting: p.interests ? { interests: p.interests } : null,
      outcomes: {
        summary: typeof outcomesSummary === 'string'
          ? outcomesSummary
          : (outcomesSummary as { summary?: string } | null)?.summary ?? null,
      },
      piggybankCount: allPiggy.length,
      piggybankTags: tagCounts,
      nextSteps: visibleNextSteps,
      showNextSteps,
      dict: { tags: PIGGYBANK_TAGS, sources: PIGGYBANK_SOURCES },
      roleTrajectory: {
        byDay: roleByDay,
        counts: roleCounts,
        route: roleRoute,
      },
      finalCard: {
        available: hasPointB,
        pointA: pointAList,
        pointB: pointBList,
        comparison,
        keyFindings,
        plans,
        roles: {
          start: role ? { key: role.roleKey, name: role.name } : null,
          strong: strongMeta ? { key: strongMeta.roleKey, name: strongMeta.name } : null,
          growth: growthMeta ? { key: growthMeta.roleKey, name: growthMeta.name } : null,
          byDay: roleByDay,
          route: roleRoute,
        },
        points: {
          path: p.pathPoints ?? 0,
          experience: p.experiencePoints ?? 0,
        },
      },
    });
  } catch (error) {
    console.error('getProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tag = req.query.tag as string | undefined;
    const source = req.query.source as string | undefined;

    const entries = await db.select().from(piggybank)
      .where(eq(piggybank.participantId, req.participant!.id))
      .orderBy(desc(piggybank.createdAt));

    const filtered = entries.filter(e => {
      if (tag && e.tag !== tag) return false;
      if (source && e.source !== source) return false;
      return true;
    });

    res.json({ entries: filtered, dict: { tags: PIGGYBANK_TAGS, sources: PIGGYBANK_SOURCES } });
  } catch (error) {
    console.error('listPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const tag = normalizePiggybankTag(String(req.body.tag || ''));
    const text = req.body.text;
    let source = normalizePiggybankSource(req.body.source);

    if (!tag || !text) {
      res.status(400).json({ error: 'tag and text required' });
      return;
    }
    if (!isAllowedPiggybankTag(tag)) {
      res.status(400).json({ error: 'Invalid tag' });
      return;
    }
    if (tag !== ORG_TAG) {
      if (!source || !isAllowedPiggybankSource(source)) {
        res.status(400).json({ error: 'source required' });
        return;
      }
    } else {
      source = source || 'Своя мысль';
    }

    const [entry] = await db.insert(piggybank).values({
      participantId: req.participant!.id,
      tag,
      text,
      source,
    }).returning();

    await awardPoints(req.participant!.id, pointsActionForTag(tag));

    res.json({ entry });
  } catch (error) {
    console.error('createPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Внутренний хелпер для админ-экспортов / аналитики глубины */
export function depthForAnswerText(text: string) {
  return inferReflectionDepth(text);
}

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
    const list = await db.select({
      id: participants.id,
      firstName: participants.firstName,
      lastName: participants.lastName,
      direction: participants.direction,
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
      hideFromLeaderboard: participants.hideFromLeaderboard,
    }).from(participants);

    const me = req.participant!.id;
    const directions = [...new Set(list.map(p => p.direction).filter(Boolean))] as string[];
    const rows = list
      .filter(p => !p.hideFromLeaderboard || p.id === me)
      .filter(p => !directionFilter || p.direction === directionFilter)
      .map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        direction: p.direction,
        score: track === 'path' ? (p.pathPoints ?? 0)
          : track === 'experience' ? (p.experiencePoints ?? 0)
            : (p.pathPoints ?? 0) + (p.experiencePoints ?? 0),
        isMe: p.id === me,
      }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, ...p }));

    const myRank = rows.find(r => r.isMe)?.rank ?? null;
    res.json({ track, direction: directionFilter || null, directions, myRank, leaders: rows.slice(0, 50) });
  } catch (error) {
    console.error('getPublicLeaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const exportPiggybankText = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const entries = await db.select().from(piggybank)
      .where(eq(piggybank.participantId, req.participant!.id))
      .orderBy(desc(piggybank.createdAt));
    const body = entries.map(e =>
      `[${e.createdAt?.toISOString() || ''}] #${e.tag} · ${e.source}\n${e.text}`
    ).join('\n\n');
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

export const synthesizeMyOutcomes = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { synthesizeOutcomes, isGigachatConfigured } = await import('../services/gigachatService.js');
    const p = req.participant!;
    const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
    const texts = userAnswers
      .map(a => (typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData)))
      .filter(Boolean) as string[];

    if (!isGigachatConfigured()) {
      const fallback = texts.length >= 3
        ? `Вы ответили на ${texts.length} вопросов. Ключевые темы ещё обрабатываются без ИИ.`
        : 'Недостаточно ответов для синтеза.';
      res.json({ summary: fallback, source: 'heuristic', configured: false });
      return;
    }

    const summary = await synthesizeOutcomes(texts);
    if (summary) {
      await db.update(participants)
        .set({ outcomesEdited: { summary, generatedAt: new Date().toISOString() } })
        .where(eq(participants.id, p.id));
    }
    res.json({ summary, source: 'gigachat', configured: true });
  } catch (error) {
    console.error('synthesizeMyOutcomes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
