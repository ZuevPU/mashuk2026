import type { Response } from 'express';
import { eq, asc, and, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  participants, answers, taskSubmissions, tasks, questions, participantDayState,
  piggybank, eventAttendance, events, exchangeQuestions, userMedals, participantPdfDrafts,
} from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import { getRoleMeta, ROLE_KEYS } from './roleService.js';
import {
  loadPublishedTouchpointQuestions,
  buildTouchpointItemsForDay,
  touchpointCompletionRatio,
} from './touchpointProgress.js';
import {
  computeAbProgressPercent,
  resolveProfileProgressWeights,
} from './profileProgress.js';
import {
  buildOutcomesHeuristic,
  buildNextStepsFromSources,
  parseOutcomesForDisplay,
} from './profileOutcomes.js';
import {
  pickProfileRecommendation,
  resolveRecommendationTemplates,
} from './profileRecommendations.js';
import { PIGGYBANK_TAGS, PIGGYBANK_SOURCES, entryHasTag, entryTags, formatTagsForExport, primaryTag } from './piggybankDict.js';

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

function extractEveningNotes(dayStates: typeof participantDayState.$inferSelect[]): string[] {
  const notes: string[] = [];
  for (const s of dayStates) {
    const r = s.eveningRatings as Record<string, unknown> | null;
    if (!r) continue;
    for (const key of ['likedMost', 'improveTomorrow', 'experimentResult', 'note', 'mainThesis']) {
      const v = r[key];
      if (typeof v === 'string' && v.trim()) notes.push(v.trim());
    }
    const draft = s.eveningDraft as { form?: Record<string, unknown> } | null;
    const form = draft?.form;
    if (form) {
      for (const v of Object.values(form)) {
        if (typeof v === 'string' && v.trim().length > 10) notes.push(v.trim());
      }
    }
  }
  return notes;
}

function eveningCompletedCount(dayStates: typeof participantDayState.$inferSelect[]): number {
  return dayStates.filter(s => s.dayNumber >= 1 && s.dayNumber <= 7 && s.eveningRatings).length;
}

function stateCurve(dayStates: typeof participantDayState.$inferSelect[]) {
  return dayStates
    .filter(s => s.dayNumber >= 1 && s.dayNumber <= 7)
    .map(s => {
      const r = s.eveningRatings as { energy?: number; morningHealth?: number } | null;
      const energy = r?.energy ?? r?.morningHealth ?? null;
      return { dayNumber: s.dayNumber, energy };
    });
}

export async function gatherProfileBundle(participantId: number) {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return null;

  const settings = await getForumSettings();
  const currentDay = resolveEffectiveCurrentDay(settings);
  const weights = resolveProfileProgressWeights((settings as { profileProgressWeights?: unknown }).profileProgressWeights);
  const shiftLabel = (settings as { shiftLabel?: string }).shiftLabel || 'Смена 1';

  const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
  const userTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.participantId, p.id));
  const allPiggy = await db.select().from(piggybank).where(eq(piggybank.participantId, p.id));
  const dayStates = await db.select().from(participantDayState)
    .where(eq(participantDayState.participantId, p.id))
    .orderBy(asc(participantDayState.dayNumber));
  const answeredIds = new Set(userAnswers.map(a => a.questionId));

  const touchpointQuestions = await loadPublishedTouchpointQuestions(currentDay);
  const { completed: tpDone, expected: tpExpected } = touchpointCompletionRatio(touchpointQuestions, answeredIds);
  const tpRatio = tpDone / tpExpected;

  const publishedTasks = await db.select().from(tasks).where(
    or(isNull(tasks.dayNumber), lte(tasks.dayNumber, currentDay)),
  );
  const tasksApproved = userTasks.filter(t => t.status === 'approved').length;
  const piggyInWork = allPiggy.filter(e => entryHasTag(e, 'в работу')).length;

  const abProgress = computeAbProgressPercent({
    touchpointRatio: tpRatio,
    eveningDone: eveningCompletedCount(dayStates),
    eveningTotal: 7,
    tasksApproved,
    tasksTotal: Math.max(1, publishedTasks.length),
    piggyInWorkCount: piggyInWork,
    weights,
  });

  const attendanceRows = await db.select().from(eventAttendance).where(eq(eventAttendance.participantId, p.id));
  const activitiesVisited = new Set(attendanceRows.map(a => a.eventId)).size;
  const publishedEvents = await db.select({ id: events.id }).from(events).where(eq(events.isPublished, true));
  const activitiesTotal = Math.max(1, publishedEvents.length);

  const touchpointItems = buildTouchpointItemsForDay(
    touchpointQuestions,
    answeredIds,
    currentDay,
    Math.min(currentDay, 7),
  );
  const missedTouchpoints = touchpointItems.filter(i => i.state === 'overdue' || i.state === 'locked').length;

  const myExchange = await db.select().from(exchangeQuestions).where(eq(exchangeQuestions.participantId, p.id));

  const tagCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  for (const e of allPiggy) {
    for (const t of entryTags(e)) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
  }

  const goals = Array.isArray(p.goalAnswers) ? (p.goalAnswers as string[]) : [];
  let pointBAnswers = p.pointBAnswers ?? null;
  if (!pointBAnswers) {
    const pointBQs = await db.select().from(questions).where(eq(questions.block, 'Точка Б'));
    const pbIds = new Set(pointBQs.map(q => q.id));
    const pbAnswers = userAnswers.filter(a => pbIds.has(a.questionId));
    if (pbAnswers.length > 0) pointBAnswers = pbAnswers.map(a => a.answerData);
  }
  const hasPointB = !!(pointBAnswers && (
    Array.isArray(pointBAnswers) ? pointBAnswers.length > 0 : Object.keys(pointBAnswers as object).length > 0
  ));

  const roleCounts: Record<string, number> = {};
  for (const k of ROLE_KEYS) roleCounts[k] = 0;
  for (const s of dayStates) {
    if (s.activeRoleKey && roleCounts[s.activeRoleKey] !== undefined) roleCounts[s.activeRoleKey] += 1;
  }

  const roleByDay = dayStates.map(s => ({
    dayNumber: s.dayNumber,
    activeRoleKey: s.activeRoleKey,
    activeRoleName: s.activeRoleKey ? getRoleMeta(s.activeRoleKey)?.name ?? s.activeRoleKey : null,
    tomorrowRoleKey: s.tomorrowRoleKey,
    experimentStatus: s.experimentStatus,
    eveningNote: (s.eveningRatings as { note?: string } | null)?.note ?? null,
  }));

  const role = p.pedagogicalRole ? getRoleMeta(p.pedagogicalRole) : null;
  const strongMeta = p.strongRole ? getRoleMeta(p.strongRole) : null;
  const growthMeta = p.growthRole ? getRoleMeta(p.growthRole) : null;
  const roleRoute = buildRoleRoute(
    p.pedagogicalRole,
    dayStates.map(s => s.activeRoleKey).filter(Boolean) as string[],
    p.growthRole,
  );

  const eveningNotes = extractEveningNotes(dayStates);
  const heuristicOutcomes = buildOutcomesHeuristic({
    answersCount: userAnswers.length,
    tasksApproved,
    piggyTotal: allPiggy.length,
    piggyInWork,
    eveningNotes,
  });
  const outcomeBullets = parseOutcomesForDisplay(p.outcomesEdited, heuristicOutcomes);

  const piggyPlans = allPiggy.filter(e => entryHasTag(e, 'в работу')).map(e => e.text);
  const fallbackTasks = publishedTasks
    .filter(t => !userTasks.some(u => u.taskId === t.id && u.status === 'approved'))
    .slice(0, 2)
    .map(t => t.title);
  const autoNext = buildNextStepsFromSources({
    piggyPlans,
    nextExperiment: p.nextExperiment,
    pointBNextStep: null,
    fallbackTasks,
  });
  const editedNextSteps = Array.isArray(p.nextStepsEdited) ? p.nextStepsEdited as string[] : null;
  const showNextSteps = !!editedNextSteps || (currentDay >= 6 && currentDay <= 7);
  const visibleNextSteps = showNextSteps ? (editedNextSteps ?? autoNext) : [];

  const recTemplates = resolveRecommendationTemplates(
    (settings as { recommendationTemplates?: unknown }).recommendationTemplates,
  );
  const recommendation = pickProfileRecommendation({
    participantId: p.id,
    currentDay,
    answersCount: userAnswers.length,
    piggyCount: allPiggy.length,
    missedTouchpoints,
    recommendationThreshold: settings.recommendationThreshold ?? 1,
    growthRoleName: growthMeta?.name,
    templates: recTemplates,
  });

  const startDate = settings.startDate ? new Date(settings.startDate) : new Date('2026-08-12');
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + ((settings.totalDays ?? 8) - 1));

  const medalCount = await db.select().from(userMedals).where(eq(userMedals.participantId, p.id));

  const [pdfDraft] = await db.select().from(participantPdfDrafts)
    .where(eq(participantPdfDrafts.participantId, p.id)).limit(1);

  const pointBList = Array.isArray(pointBAnswers)
    ? pointBAnswers.map(x => (typeof x === 'string' ? x : JSON.stringify(x)))
    : [];
  const pointAList = goals;
  const comparison = pointAList.map((a, i) => ({
    index: i + 1,
    pointA: a,
    pointB: pointBList[i] ?? null,
  }));

  const todayState = roleByDay.find(r => r.dayNumber === Math.min(currentDay, 7));

  return {
    participant: p,
    settings,
    currentDay,
    shiftLabel,
    weights,
    goals,
    userAnswers,
    userTasks,
    allPiggy,
    abProgress,
    metrics: {
      abProgress,
      activitiesVisited,
      activitiesTotal,
      piggybankTotal: allPiggy.length,
      eveningReflectionsDone: eveningCompletedCount(dayStates),
      eveningReflectionsTotal: 7,
    },
    trajectory: {
      from: 'Точка А',
      to: 'Точка Б',
      fromDate: startDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      toDate: endDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      progressPercent: abProgress,
    },
    actionStyle: {
      startRole: role ? { key: role.roleKey, name: role.name, essence: role.essence, keywords: role.keywords } : null,
      roleCounts: ROLE_KEYS.map(k => ({
        key: k,
        name: getRoleMeta(k)?.name ?? k,
        count: roleCounts[k] ?? 0,
      })),
      route: roleRoute,
      selfInsights: eveningNotes.slice(0, 5),
      strongRole: strongMeta ? { key: strongMeta.roleKey, name: strongMeta.name } : null,
      growthRole: growthMeta ? { key: growthMeta.roleKey, name: growthMeta.name } : null,
      nextExperiment: p.nextExperiment,
    },
    outcomes: {
      bullets: outcomeBullets,
      showFromDay: 3,
      visible: currentDay >= 3,
    },
    nextSteps: visibleNextSteps,
    showNextSteps,
    recommendation,
    dailyTracker: {
      stateCurve: stateCurve(dayStates),
      piggybankTags: tagCounts,
      piggybankSources: sourceCounts,
      tasksDone: tasksApproved,
      tasksTotal: publishedTasks.length,
      experiencePoints: p.experiencePoints ?? 0,
      myExchangeQuestions: myExchange.map(q => ({ id: q.id, text: q.text, moderationStatus: q.moderationStatus })),
      touchpointsToday: touchpointItems,
      roleOfDay: todayState ?? null,
    },
    piggybankTags: tagCounts,
    piggybankCount: allPiggy.length,
    roleTrajectory: { byDay: roleByDay, counts: roleCounts, route: roleRoute },
    finalCard: {
      available: hasPointB,
      pointA: pointAList,
      pointB: pointBList,
      comparison,
      keyFindings: allPiggy.filter(e => entryHasTag(e, 'идея') || entryHasTag(e, 'мысль')).slice(0, 5)
        .map(e => ({ id: e.id, tag: entryTags(e).join(', '), text: e.text, source: e.source, createdAt: e.createdAt })),
      plans: allPiggy.filter(e => entryHasTag(e, 'в работу'))
        .map(e => ({ id: e.id, text: e.text, source: e.source, createdAt: e.createdAt })),
      piggybankAll: allPiggy.map(e => ({
        id: e.id, tag: primaryTag(e), tags: entryTags(e), text: e.text, source: e.source, createdAt: e.createdAt, forumDay: e.forumDay,
      })),
      experienceSummary: {
        tasksApproved,
        medalsCount: medalCount.length,
        attendanceCount: activitiesVisited,
        path: p.pathPoints ?? 0,
        experience: p.experiencePoints ?? 0,
      },
      roles: {
        start: role ? { key: role.roleKey, name: role.name } : null,
        strong: strongMeta ? { key: strongMeta.roleKey, name: strongMeta.name } : null,
        growth: growthMeta ? { key: growthMeta.roleKey, name: growthMeta.name } : null,
        byDay: roleByDay,
        route: roleRoute,
      },
      points: { path: p.pathPoints ?? 0, experience: p.experiencePoints ?? 0 },
    },
    pdf: {
      available: currentDay >= 7 && (hasPointB || pdfDraft?.status === 'published'),
      published: pdfDraft?.status === 'published',
      draftBlocks: pdfDraft?.blocks ?? {},
    },
    dict: { tags: PIGGYBANK_TAGS, sources: PIGGYBANK_SOURCES },
  };
}

export type ProfileBundle = NonNullable<Awaited<ReturnType<typeof gatherProfileBundle>>>;

export async function streamProfilePdf(
  bundle: ProfileBundle,
  res: Response,
  blockOverrides?: Record<string, unknown>,
): Promise<void> {
  const p = bundle.participant;
  const overrides = blockOverrides ?? (bundle.pdf.draftBlocks as Record<string, unknown>) ?? {};
  const outcomesText = (overrides.outcomes as string)
    ?? bundle.outcomes.bullets.join('\n• ');
  const nextStepsText = (overrides.nextSteps as string)
    ?? bundle.nextSteps.join('\n• ');

  const PDFDocument = (await import('pdfkit')).default;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=profile_${p.id}.pdf`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('Машук — итоговый профиль', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`${p.firstName} ${p.lastName} · ${p.direction || '—'} · ${bundle.shiftLabel}`);
  doc.text(`Группа: ${p.groupName || '—'}`);
  doc.text(`Прогресс A→B: ${bundle.abProgress}% (${bundle.trajectory.fromDate} — ${bundle.trajectory.toDate})`);
  doc.moveDown();

  doc.fontSize(13).text('Точка А → Точка Б', { underline: true });
  doc.fontSize(10);
  for (const row of bundle.finalCard.comparison) {
    doc.text(`Вопрос ${row.index}`);
    doc.text(`Было: ${row.pointA || '—'}`);
    doc.text(`Стало: ${row.pointB || '—'}`);
    doc.moveDown(0.3);
  }

  doc.moveDown().fontSize(13).text('Кривая состояния (энергия по дням)', { underline: true });
  doc.fontSize(10);
  for (const pt of bundle.dailyTracker.stateCurve) {
    doc.text(`Д${pt.dayNumber}: ${pt.energy ?? '—'}`);
  }

  doc.moveDown().fontSize(13).text('Твой способ действия', { underline: true });
  doc.fontSize(10).text(bundle.actionStyle.route);
  if (bundle.actionStyle.strongRole) doc.text(`Сильная роль: ${bundle.actionStyle.strongRole.name}`);
  if (bundle.actionStyle.growthRole) doc.text(`Роль роста: ${bundle.actionStyle.growthRole.name}`);
  if (p.nextExperiment) doc.text(`Следующий эксперимент: ${p.nextExperiment}`);

  doc.moveDown().fontSize(13).text('Что получилось', { underline: true });
  doc.fontSize(10).text(outcomesText || '—');

  doc.moveDown().fontSize(13).text('Следующие шаги', { underline: true });
  doc.fontSize(10).text(nextStepsText || '—');

  doc.moveDown().fontSize(13).text('Копилка', { underline: true });
  doc.fontSize(9);
  for (const e of bundle.allPiggy.slice(0, 25)) {
    doc.text(`#${formatTagsForExport(e)} · ${e.source}: ${(e.text || '').slice(0, 100)}`);
  }

  doc.end();
}
