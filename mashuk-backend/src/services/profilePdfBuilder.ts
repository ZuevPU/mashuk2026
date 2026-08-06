import type { Response } from 'express';
import { eq, asc, and, lte, or, isNull, inArray } from 'drizzle-orm';
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
  touchpointCompletionRatioCumulative,
  TOUCHPOINT_BLOCKS,
  isTouchpointQuestionForForumDay,
} from './touchpointProgress.js';
import { resolveActiveShiftId } from './shiftService.js';
import { backfillPathPointsForAnswers } from './pointsService.js';
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
import { participantAnswerSummary } from './participantAnswerFormat.js';

const NON_SUBSTANTIVE_TYPES = new Set([
  'checkin',
  'scale_5',
  'scale_10',
  'choice',
  'multi',
  'emotion',
  'dependent',
]);

/** Open-text reflections for profile — skip scales, check-ins, short rating dumps. */
export function isSubstantiveProfileReflection(input: {
  type?: string | null;
  questionKind?: string | null;
  reflectionKind?: string | null;
  block?: string | null;
  answerType?: string | null;
  preview: string;
}): boolean {
  const preview = (input.preview || '').trim();
  if (preview.length < 16) return false;
  // Pure numeric / rating lists like "7 · 8 · 5"
  if (/^[\d\s·.,/\-–—]+$/.test(preview)) return false;

  const kind = `${input.questionKind || ''} ${input.reflectionKind || ''}`.toLowerCase();
  if (kind.includes('state_check')) return false;

  const block = (input.block || '').toLowerCase();
  if (block.includes('проверк')) return false;

  const type = (input.type || '').toLowerCase();
  const answerType = (input.answerType || '').toLowerCase();
  if (NON_SUBSTANTIVE_TYPES.has(type) || NON_SUBSTANTIVE_TYPES.has(answerType)) return false;
  if (answerType.startsWith('scale') || type.startsWith('scale')) return false;

  // Prefer open / text; allow day_summary open forms with real prose
  if (type === 'open' || type === 'text' || answerType === 'text' || !type) return true;
  // Unknown custom types: keep only if preview looks like a sentence
  return /[а-яёa-z]{4,}/i.test(preview) && preview.split(/\s+/).length >= 3;
}

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
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = raw.trim();
    if (t.length < 8) return;
    const key = t.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    notes.push(t);
  };
  for (const s of dayStates) {
    const r = s.eveningRatings as Record<string, unknown> | null;
    if (!r) continue;
    for (const key of ['likedMost', 'improveTomorrow', 'experimentResult', 'note', 'mainThesis', 'freeNote']) {
      const v = r[key];
      if (typeof v === 'string') push(v);
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
      return { day: s.dayNumber, dayNumber: s.dayNumber, energy, emotion: energy };
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
  const answerQuestionIds = [...new Set(userAnswers.map(a => a.questionId))];
  const answerQuestions = answerQuestionIds.length
    ? await db.select().from(questions).where(inArray(questions.id, answerQuestionIds))
    : [];
  const questionById = new Map(answerQuestions.map(q => [q.id, q]));
  const recentReflections: Array<{
    questionId: number;
    title: string;
    block: string | null;
    answeredAt: Date | null;
    preview: string;
  }> = [];

  for (const a of userAnswers) {
    const q = questionById.get(a.questionId);
    const preview = participantAnswerSummary(a.answerData, q?.type).slice(0, 320);
    if (!isSubstantiveProfileReflection({
      type: q?.type,
      questionKind: q?.questionKind,
      reflectionKind: q?.reflectionKind,
      block: q?.block,
      answerType: q?.answerType,
      preview,
    })) continue;
    recentReflections.push({
      questionId: a.questionId,
      title: q?.title ?? 'Вопрос',
      block: q?.block ?? null,
      answeredAt: a.createdAt,
      preview,
    });
  }

  const userTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.participantId, p.id));
  const allPiggy = await db.select().from(piggybank).where(eq(piggybank.participantId, p.id));
  const dayStates = await db.select().from(participantDayState)
    .where(eq(participantDayState.participantId, p.id))
    .orderBy(asc(participantDayState.dayNumber));

  // Evening free-text already lives in answers («Итоги дня») — don't re-add from day_state
  // (that duplicated the same phrase in profile «Мои ответы»).
  const reflectionPreviews = new Set(
    recentReflections.map(r => r.preview.toLowerCase().replace(/\s+/g, ' ')),
  );
  const hasEveningAnswer = recentReflections.some(r => (r.block || '').includes('Итоги'));
  if (!hasEveningAnswer) {
    for (const s of dayStates) {
      const r = s.eveningRatings as Record<string, unknown> | null;
      if (!r) continue;
      const labels: Record<string, string> = {
        mainThesis: 'Главный тезис дня',
        likedMost: 'Что понравилось',
        freeNote: 'Заметка',
        experimentResult: 'Эксперимент с ролью',
      };
      for (const [key, label] of Object.entries(labels)) {
        const v = r[key];
        if (typeof v !== 'string' || !v.trim()) continue;
        const preview = v.trim().slice(0, 320);
        const norm = preview.toLowerCase().replace(/\s+/g, ' ');
        if (reflectionPreviews.has(norm)) continue;
        if (!isSubstantiveProfileReflection({
          type: 'open',
          block: 'Итоги дня',
          preview,
        })) continue;
        reflectionPreviews.add(norm);
        recentReflections.push({
          questionId: 0,
          title: `Итоговая анкета · день ${s.dayNumber} · ${label}`,
          block: 'Итоги дня',
          answeredAt: s.updatedAt ?? s.createdAt,
          preview,
        });
      }
    }
  }
  recentReflections.sort((a, b) =>
    new Date(b.answeredAt ?? 0).getTime() - new Date(a.answeredAt ?? 0).getTime());
  // Dedupe identical previews (same text from twin questions / copies)
  const dedupedReflections: typeof recentReflections = [];
  const seenPreview = new Set<string>();
  for (const r of recentReflections) {
    const key = r.preview.toLowerCase().replace(/\s+/g, ' ');
    if (seenPreview.has(key)) continue;
    seenPreview.add(key);
    dedupedReflections.push(r);
  }
  const recentReflectionsForClient = dedupedReflections.slice(0, 24);

  const answeredIds = new Set(userAnswers.map(a => a.questionId));

  // Repair path points if answers were submitted when levels_config was empty
  await backfillPathPointsForAnswers(
    p.id,
    userAnswers.map(a => ({ questionId: a.questionId })),
    questionById,
  );
  const [pFresh] = await db.select().from(participants).where(eq(participants.id, p.id)).limit(1);
  if (pFresh) Object.assign(p, pFresh);

  const shiftId = await resolveActiveShiftId();
  const touchpointQuestions = await loadPublishedTouchpointQuestions(currentDay, shiftId);
  // Include answered touchpoint questions even if from another shift / older twin
  for (const q of answerQuestions) {
    if (touchpointQuestions.some(t => t.id === q.id)) continue;
    if ([1, 2, 3, 4, 5, 6, 7].some(d => isTouchpointQuestionForForumDay(q, d))) {
      touchpointQuestions.push(q);
    }
  }
  const dayForTp = Math.min(currentDay, 7);
  const { completed: tpDone, expected: tpExpected } = touchpointCompletionRatioCumulative(
    touchpointQuestions,
    answeredIds,
    dayForTp,
  );
  const tpRatio = tpDone / tpExpected;

  const touchpointAnswerCount = userAnswers.filter(a => {
    const q = questionById.get(a.questionId);
    if (!q) return false;
    if (!TOUCHPOINT_BLOCKS.has(q.block || '')) return false;
    return [1, 2, 3, 4, 5, 6, 7].some(d => isTouchpointQuestionForForumDay(q, d));
  }).length;
  const eveningDone = eveningCompletedCount(dayStates);

  const publishedTasks = await db.select().from(tasks).where(
    or(isNull(tasks.dayNumber), lte(tasks.dayNumber, currentDay)),
  );
  const tasksApproved = userTasks.filter(t => t.status === 'approved').length;
  const piggyInWork = allPiggy.filter(e => entryHasTag(e, 'в работу')).length;

  // Evening weight: day-state forms + credit for answered touchpoints / state checks
  const reflectionProgressUnits = Math.min(
    7,
    eveningDone + Math.min(7, touchpointAnswerCount),
  );

  const abProgress = computeAbProgressPercent({
    touchpointRatio: tpRatio,
    eveningDone: reflectionProgressUnits,
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
    recentAnswerTexts: recentReflectionsForClient.map(r => r.preview),
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

  const humanize = (x: unknown) => {
    if (x == null || x === '') return '';
    if (typeof x === 'string') {
      const t = x.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try { return participantAnswerSummary(JSON.parse(t)) || t; } catch { return t; }
      }
      return t;
    }
    return participantAnswerSummary(x) || '—';
  };
  const pointBList = Array.isArray(pointBAnswers)
    ? pointBAnswers.map(humanize).filter(Boolean)
    : pointBAnswers && typeof pointBAnswers === 'object'
      ? [humanize(pointBAnswers)].filter(Boolean)
      : [];
  const pointAList = goals.map(humanize).filter(Boolean);
  const pairCount = Math.max(pointAList.length, pointBList.length, 1);
  const comparison = Array.from({ length: pairCount }, (_, i) => ({
    index: i + 1,
    pointA: pointAList[i] || '—',
    pointB: pointBList[i] || '—',
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
      eveningReflectionsDone: tpDone,
      eveningReflectionsTotal: tpExpected,
      touchpointsDone: tpDone,
      touchpointsExpected: tpExpected,
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
      selfInsights: [] as string[],
      strongRole: strongMeta ? { key: strongMeta.roleKey, name: strongMeta.name } : null,
      growthRole: growthMeta ? { key: growthMeta.roleKey, name: growthMeta.name } : null,
      nextExperiment: p.nextExperiment,
    },
    outcomes: {
      bullets: outcomeBullets,
      showFromDay: 3,
      visible: currentDay >= 3,
    },
    eveningNotes,
    recentReflections: recentReflectionsForClient,
    nextSteps: visibleNextSteps,
    showNextSteps,
    recommendation,
    piggybankSources: sourceCounts,
    dailyTracker: {
      stateCurve: stateCurve(dayStates),
      tasksDone: tasksApproved,
      tasksTotal: publishedTasks.length,
      experiencePoints: p.experiencePoints ?? 0,
      myExchangeQuestions: myExchange.map(q => ({ id: q.id, text: q.text, moderationStatus: q.moderationStatus })),
      touchpointsToday: touchpointItems.map(i => ({
        title: i.title,
        done: i.state === 'done',
        state: i.state,
      })),
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
  res: import('express').Response | NodeJS.WritableStream,
  blockOverrides?: Record<string, unknown>,
): Promise<void> {
  const p = bundle.participant;
  const overrides = blockOverrides ?? (bundle.pdf.draftBlocks as Record<string, unknown>) ?? {};
  const outcomesLines = (typeof overrides.outcomes === 'string' && overrides.outcomes.trim())
    ? overrides.outcomes.split(/\n+/).map(s => s.replace(/^[•\-\s]+/, '').trim()).filter(Boolean)
    : bundle.outcomes.bullets;
  const nextStepLines = (typeof overrides.nextSteps === 'string' && overrides.nextSteps.trim())
    ? overrides.nextSteps.split(/\n+/).map(s => s.replace(/^[•\-\s]+/, '').trim()).filter(Boolean)
    : bundle.nextSteps;

  const {
    resolvePdfFonts, paintPageBackground, drawHeroHeader, drawContinuedHeader,
    ensureSpace, drawProgressBar, sectionTitle, mutedLine, bodyText, bullet, comparisonCard, COLORS,
  } = await import('./profilePdfLayout.js');

  const fonts = resolvePdfFonts();
  const PDFDocument = (await import('pdfkit')).default;
  if ('setHeader' in res && typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=profile_${p.id}.pdf`);
  }

  const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
  doc.registerFont('Mashuk', fonts.regular);
  doc.registerFont('Mashuk-Bold', fonts.bold);
  doc.pipe(res);

  paintPageBackground(doc);
  drawHeroHeader(doc, 'Итоговый профиль участника');
  doc.on('pageAdded', () => {
    paintPageBackground(doc);
    drawContinuedHeader(doc);
  });

  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || `Участник #${p.id}`;
  doc.font('Mashuk-Bold').fontSize(18).fillColor(COLORS.text);
  doc.text(fullName, 40, doc.y, { width: doc.page.width - 80 });
  mutedLine(doc, [
    p.direction || 'Без направления',
    bundle.shiftLabel,
    p.groupName ? `Группа: ${p.groupName}` : null,
  ].filter(Boolean).join('  ·  '));
  doc.moveDown(0.6);

  drawProgressBar(
    doc,
    bundle.abProgress,
    'Прогресс «Точка А → Точка Б»',
    `${bundle.trajectory.fromDate} — ${bundle.trajectory.toDate}`,
  );

  sectionTitle(doc, 'Точка А → Точка Б');
  for (const row of bundle.finalCard.comparison) {
    comparisonCard(doc, row.index, String(row.pointA || '—'), String(row.pointB || '—'));
  }

  sectionTitle(doc, 'Кривая состояния');
  mutedLine(doc, 'Энергия по дням смены');
  doc.moveDown(0.3);
  const curve = bundle.dailyTracker.stateCurve;
  const maxEnergy = Math.max(10, ...curve.map(pt => Number(pt.energy) || 0));
  const barMaxW = doc.page.width - 120;
  for (const pt of curve) {
    ensureSpace(doc, 18);
    const energy = pt.energy == null ? null : Number(pt.energy);
    const y = doc.y;
    doc.font('Mashuk').fontSize(9).fillColor(COLORS.muted);
    doc.text(`День ${pt.dayNumber}`, 40, y, { width: 48 });
    const trackX = 92;
    doc.save();
    doc.roundedRect(trackX, y + 2, barMaxW, 8, 3).fill(COLORS.border);
    if (energy != null && !Number.isNaN(energy)) {
      const fw = Math.max(4, (barMaxW * Math.min(maxEnergy, Math.max(0, energy))) / maxEnergy);
      doc.roundedRect(trackX, y + 2, fw, 8, 3).fill(COLORS.accent);
      doc.restore();
      doc.font('Mashuk-Bold').fontSize(9).fillColor(COLORS.text);
      doc.text(String(energy), trackX + barMaxW + 6, y, { width: 28 });
    } else {
      doc.restore();
      doc.font('Mashuk').fontSize(9).fillColor(COLORS.muted);
      doc.text('—', trackX + barMaxW + 6, y, { width: 28 });
    }
    doc.y = y + 16;
  }
  doc.moveDown(0.4);

  sectionTitle(doc, 'Твой способ действия');
  bodyText(doc, bundle.actionStyle.route || 'Маршрут ролей появится по ходу смены');
  doc.moveDown(0.25);
  if (bundle.actionStyle.strongRole) bullet(doc, `Сильная роль: ${bundle.actionStyle.strongRole.name}`);
  if (bundle.actionStyle.growthRole) bullet(doc, `Роль роста: ${bundle.actionStyle.growthRole.name}`);
  if (p.nextExperiment) bullet(doc, `Следующий эксперимент: ${p.nextExperiment}`);
  doc.moveDown(0.3);

  sectionTitle(doc, 'Что получилось');
  if (outcomesLines.length === 0) bodyText(doc, '—');
  else for (const line of outcomesLines) bullet(doc, line);
  doc.moveDown(0.3);

  sectionTitle(doc, 'Следующие шаги');
  if (nextStepLines.length === 0) bodyText(doc, '—');
  else for (const line of nextStepLines) bullet(doc, line);
  doc.moveDown(0.3);

  sectionTitle(doc, 'Копилка');
  const piggy = bundle.allPiggy.slice(0, 25);
  if (piggy.length === 0) {
    bodyText(doc, 'Записей пока нет');
  } else {
    mutedLine(doc, `${bundle.allPiggy.length} записей · показаны первые ${piggy.length}`);
    doc.moveDown(0.25);
    for (const e of piggy) {
      ensureSpace(doc, 28);
      const tags = formatTagsForExport(e) || 'без тега';
      const src = e.source || 'источник не указан';
      doc.font('Mashuk-Bold').fontSize(8).fillColor(COLORS.accent);
      doc.text(`${tags}  ·  ${src}`, 40, doc.y, { width: doc.page.width - 80 });
      doc.font('Mashuk').fontSize(9).fillColor(COLORS.text);
      doc.text((e.text || '—').slice(0, 160), 40, doc.y, { width: doc.page.width - 80 });
      doc.moveDown(0.35);
    }
  }

  doc.moveDown(0.8);
  mutedLine(doc, 'Сформировано в мини-приложении форума «Машук»');

  doc.end();
}
