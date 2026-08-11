/**
 * Сборка аналитического HTML-профиля участника (Профиль 2).
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers,
  exchangeAnswers,
  exchangeQuestions,
  participantDayState,
  participants,
  piggybank,
  questions,
} from '../db/schema.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import { emotionIdToZone } from './emotionZones.js';
import { entryTags } from './piggybankDict.js';
import { isAutoBookmark } from './analytics/piggybankHubMetrics.js';
import { classifyReflection } from './analytics/afterBlocksHubMetrics.js';
import { ZONE_RU, type ZoneKey } from './analytics/stateDashboardMetrics.js';
import { parseAfterBlocksPicks } from './exports/nestedPickParse.js';
import { roleLabel } from './exports/exportLabels.js';
import { isOrganizerDirection } from './leaderboardQuery.js';
import { participantAnswerSummary } from './participantAnswerFormat.js';
import {
  goalQuestionTexts,
  normalizeOnboardingConfig,
} from './roleService.js';
import { stateCheckPhaseForAnswer } from './analytics/touchpointMetrics.js';
import {
  isTouchpointQuestionForForumDay,
  loadPublishedTouchpointQuestions,
  touchpointCompletionRatio,
} from './touchpointProgress.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import {
  clampText,
  emptyState,
  filterProfilePiggy,
  formatRuDayMonth,
  mapExperimentResult,
  shiftDateRange,
  type ProfileZone,
} from './participantFinalProfileLogic.js';
import {
  buildAnalyticalNarrative,
  classifyThemes,
  type AnalyticalProfile,
} from './participantAnalyticalProfileLogic.js';
import { PARTICIPANT_ANALYTICAL_PROFILE_TEMPLATE } from './participantAnalyticalProfile/templateHtml.js';

function toZoneLabel(zone: string | null | undefined): ProfileZone | undefined {
  if (!zone) return undefined;
  const key = zone.trim().toLowerCase() as ZoneKey;
  const label = ZONE_RU[key];
  return label as ProfileZone | undefined;
}

function parseCheckinZone(answerData: unknown): ProfileZone | undefined {
  if (!answerData || typeof answerData !== 'object') return undefined;
  const o = answerData as {
    emotionZone?: string;
    emotionZoneLabel?: string;
    emotion?: string;
  };
  if (o.emotionZoneLabel) {
    const label = String(o.emotionZoneLabel).trim();
    if (['Подъём', 'Включение', 'Нейтраль', 'Усталость', 'Риск'].includes(label)) {
      return label as ProfileZone;
    }
  }
  const zone = o.emotionZone ?? emotionIdToZone(o.emotion);
  return toZoneLabel(zone);
}

function parseCheckinReason(answerData: unknown): string | null {
  if (!answerData || typeof answerData !== 'object') return null;
  const o = answerData as { reason?: unknown; text?: unknown };
  if (typeof o.reason === 'string' && o.reason.trim()) return o.reason.trim();
  if (typeof o.text === 'string' && o.text.trim() && o.text.trim().length < 200) {
    return o.text.trim();
  }
  return null;
}

function resolvePhase(
  timePoint: string | null | undefined,
  createdAt: Date | null | undefined,
): 'morning' | 'day' | 'evening' {
  const tp = (timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return stateCheckPhaseForAnswer(createdAt ?? null);
}

function humanizeAnswer(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return participantAnswerSummary(raw).trim();
}

function nextStepFromParticipant(p: typeof participants.$inferSelect): {
  nextStep: string | null;
  nextStepWhen: string | null;
} {
  const edited = p.nextStepsEdited as { text?: string; when?: string; items?: string[] } | string | null;
  if (typeof edited === 'string' && edited.trim()) {
    return { nextStep: clampText(edited, 300), nextStepWhen: null };
  }
  if (edited && typeof edited === 'object') {
    const text = typeof edited.text === 'string' ? edited.text.trim()
      : Array.isArray(edited.items) ? edited.items.filter(Boolean).join('; ') : '';
    const when = typeof edited.when === 'string' ? edited.when.trim() : null;
    if (text) return { nextStep: clampText(text, 300), nextStepWhen: when };
  }
  if (p.nextExperiment?.trim()) {
    return { nextStep: clampText(p.nextExperiment, 300), nextStepWhen: null };
  }
  return { nextStep: null, nextStepWhen: null };
}

function phaseFromDate(d: Date | null | undefined): 'утро' | 'день' | 'вечер' | null {
  if (!d) return null;
  const h = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hour12: false,
  }).format(d));
  if (h < 12) return 'утро';
  if (h < 17) return 'день';
  return 'вечер';
}

export async function buildAnalyticalProfile(participantId: number): Promise<AnalyticalProfile | null> {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return null;

  const settings = await getForumSettings();
  const currentDay = resolveEffectiveCurrentDay(settings);
  const totalDays = Math.min(8, Math.max(1, Number(settings.totalDays) || 8));
  const shiftLabel = (settings as { shiftLabel?: string }).shiftLabel || 'Смена';
  const startDate = settings.startDate ? new Date(settings.startDate) : null;
  const range = shiftDateRange(startDate, totalDays);
  const onboarding = normalizeOnboardingConfig(
    (settings as { roleDiagnosticsConfig?: unknown }).roleDiagnosticsConfig,
  );
  const goalQs = goalQuestionTexts(onboarding.goalQuestions);
  const goals = Array.isArray(p.goalAnswers) ? (p.goalAnswers as unknown[]) : [];
  const pointA = goalQs
    .map((q, i) => {
      const a = humanizeAnswer(goals[i]);
      if (!a) return null;
      return { q, a: clampText(a, 300) };
    })
    .filter((x): x is { q: string; a: string } => Boolean(x));
  if (!pointA.length && goals.length) {
    for (let i = 0; i < goals.length; i++) {
      const a = humanizeAnswer(goals[i]);
      if (!a) continue;
      pointA.push({ q: goalQs[i] || `Вопрос ${i + 1}`, a: clampText(a, 300) });
    }
  }

  const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
  const answerQuestionIds = [...new Set(userAnswers.map(a => a.questionId))];
  const answerQuestions = answerQuestionIds.length
    ? await db.select().from(questions).where(inArray(questions.id, answerQuestionIds))
    : [];
  const questionById = new Map(answerQuestions.map(q => [q.id, q]));

  const stateBase = emptyState(8);
  const stateDays: AnalyticalProfile['state']['days'] = stateBase.map(s => ({
    day: s.day,
    reasons: [] as string[],
  }));
  const zoneTally = new Map<ProfileZone, number>();
  const reasonTally = new Map<string, number>();

  for (const a of userAnswers) {
    const q = questionById.get(a.questionId);
    if (!q) continue;
    const isState = q.questionKind === 'state_check'
      || q.type === 'checkin'
      || (q.block || '').toLowerCase().includes('проверк');
    if (!isState) continue;
    const days = (Array.isArray(q.dayNumbers) && q.dayNumbers.length)
      ? q.dayNumbers.filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 8)
      : (q.dayNumber != null && q.dayNumber >= 1 && q.dayNumber <= 8 ? [q.dayNumber] : []);
    if (!days.length) continue;
    const zone = parseCheckinZone(a.answerData);
    const reason = parseCheckinReason(a.answerData);
    const phase = resolvePhase(q.timePoint, a.createdAt);
    for (const day of days) {
      const slot = stateDays[day - 1];
      if (zone) {
        if (phase === 'morning') slot.morning = zone;
        else if (phase === 'day') slot.day_ = zone;
        else slot.evening = zone;
        zoneTally.set(zone, (zoneTally.get(zone) || 0) + 1);
      }
      if (reason) {
        slot.reasons.push(clampText(reason, 120));
        const key = reason.toLowerCase();
        reasonTally.set(key, (reasonTally.get(key) || 0) + 1);
      }
    }
  }

  type RefItem = { text: string; event: string; level: ReturnType<typeof classifyReflection>; at: number };
  const reflections: RefItem[] = [];
  for (const a of userAnswers) {
    const q = questionById.get(a.questionId);
    if (!q) continue;
    const isAfter = q.questionKind === 'after_blocks'
      || (q.block || '').toLowerCase().includes('точки осмысления')
      || (q.block || '').toLowerCase().includes('точек осмысления');
    if (!isAfter) continue;
    if ((q.block || '').toLowerCase().includes('проверк')) continue;
    const picks = parseAfterBlocksPicks(a.answerData);
    if (picks.length) {
      for (const pick of picks) {
        const text = (pick.text || '').trim();
        if (text.length < 8) continue;
        reflections.push({
          text,
          event: pick.pathLabel || pick.eventTitle || pick.parentEventTitle || q.title || 'Блок',
          level: classifyReflection(text),
          at: a.createdAt?.getTime() ?? 0,
        });
      }
      continue;
    }
    const preview = participantAnswerSummary(a.answerData, q.type).trim();
    if (preview.length < 16) continue;
    if (/^[\d\s·.,/\-–—]+$/.test(preview)) continue;
    reflections.push({
      text: preview,
      event: q.title || q.block || 'Осмысление',
      level: classifyReflection(preview),
      at: a.createdAt?.getTime() ?? 0,
    });
  }
  const afterItems = [...reflections]
    .sort((a, b) => {
      const rank = (l: string) => (l === 'Перенос в практику' ? 2 : l === 'Связь с собой' ? 1 : 0);
      return rank(b.level) - rank(a.level) || b.text.length - a.text.length;
    })
    .slice(0, 6)
    .map(r => ({ event: r.event, text: clampText(r.text, 280) }));

  const piggyRows = await db.select().from(piggybank).where(and(
    eq(piggybank.participantId, p.id),
    isNull(piggybank.deletedAt),
  ));
  const piggyMapped = piggyRows.map(e => ({
    text: e.text || '',
    source: e.source,
    tags: entryTags(e),
    createdAt: e.createdAt,
    forumDay: e.forumDay,
  }));
  const piggy = filterProfilePiggy(piggyMapped, isAutoBookmark);
  const tagTally = new Map<string, number>();
  let questionTag = 0;
  for (const row of piggy.usable) {
    for (const raw of row.tags) {
      const tag = String(raw || '').trim().toLowerCase();
      if (!tag) continue;
      tagTally.set(tag, (tagTally.get(tag) || 0) + 1);
      if (tag === 'вопрос') questionTag += 1;
    }
  }
  const favoriteTags = [...tagTally.entries()]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'ru'))
    .slice(0, 6);
  const kopThemes = classifyThemes(piggy.usable.map(r => r.text), 5);

  const answeredIds = new Set(userAnswers.map(a => a.questionId));
  const dayStates = await db.select().from(participantDayState)
    .where(eq(participantDayState.participantId, p.id))
    .orderBy(asc(participantDayState.dayNumber));
  const eveningDoneDays = new Set(dayStates.filter(s => s.eveningRatings).map(s => s.dayNumber));
  const tpQuestions = await loadPublishedTouchpointQuestions(Math.max(currentDay, totalDays), p.shiftId);
  let touchDone = 0;
  let touchTotal = 0;
  for (let d = 1; d <= Math.min(8, Math.max(currentDay, 1)); d++) {
    const dayQs = tpQuestions.filter(q => questionMatchesDay(q, d) && isTouchpointQuestionForForumDay(q, d));
    if (!dayQs.length && !eveningDoneDays.has(d)) continue;
    const { completed, expected } = touchpointCompletionRatio(tpQuestions, answeredIds, d, {
      eveningDone: eveningDoneDays.has(d),
    });
    if (expected <= 0) continue;
    touchDone += completed;
    touchTotal += expected;
  }

  const roles: AnalyticalProfile['roles'] = [];
  for (const s of dayStates) {
    if (!s.activeRoleKey) continue;
    if (s.dayNumber < 1 || s.dayNumber > 8) continue;
    const ratings = (s.eveningRatings || {}) as { experimentResult?: string };
    roles.push({
      day: s.dayNumber,
      role: roleLabel(s.activeRoleKey) || s.activeRoleKey,
      result: mapExperimentResult(s.experimentStatus, ratings.experimentResult),
    });
  }
  roles.sort((a, b) => a.day - b.day);

  const myAnswers = await db.select().from(exchangeAnswers)
    .where(eq(exchangeAnswers.participantId, p.id))
    .orderBy(desc(exchangeAnswers.createdAt));
  const myQuestions = await db.select().from(exchangeQuestions)
    .where(eq(exchangeQuestions.participantId, p.id))
    .orderBy(desc(exchangeQuestions.createdAt));

  const questionSamples = myQuestions
    .map(q => clampText(q.text, 220))
    .filter(t => t.length >= 12)
    .slice(0, 4);
  const answerSamples = myAnswers
    .map(a => clampText(a.text, 220))
    .filter(t => t.length >= 12)
    .slice(0, 4);
  const exchangeThemes = classifyThemes([...questionSamples, ...answerSamples], 5);

  const dirName = p.direction || '—';
  const cohortFilter = p.shiftId != null
    ? and(eq(participants.shiftId, p.shiftId), eq(participants.direction, dirName))
    : eq(participants.direction, dirName);
  const cohort = await db.select({
    id: participants.id,
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    onboardingCompletedAt: participants.onboardingCompletedAt,
    direction: participants.direction,
  }).from(participants).where(cohortFilter);
  const peers = cohort.filter(
    c => c.onboardingCompletedAt && !isOrganizerDirection(c.direction) && c.id !== p.id,
  );
  let dirAvgPath: number | null = null;
  let dirAvgExp: number | null = null;
  if (peers.length >= 5) {
    dirAvgPath = peers.reduce((s, c) => s + (c.pathPoints || 0), 0) / peers.length;
    dirAvgExp = peers.reduce((s, c) => s + (c.experiencePoints || 0), 0) / peers.length;
  }

  const { nextStep, nextStepWhen } = nextStepFromParticipant(p);
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || `Участник ${p.id}`;
  const lastActive = p.lastActiveAt ? new Date(p.lastActiveAt) : null;

  const topReasons = [...reasonTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([r]) => {
      // restore a sample with original casing from state days
      for (const d of stateDays) {
        const hit = d.reasons.find(x => x.toLowerCase() === r);
        if (hit) return hit;
      }
      return r;
    });

  const base: Omit<AnalyticalProfile, 'narrative'> = {
    person: {
      name,
      direction: dirName,
      shift: shiftLabel,
      group: p.groupName || '—',
      from: range.from,
      to: range.to,
      days: range.days,
    },
    activity: {
      pathPoints: p.pathPoints || 0,
      experiencePoints: p.experiencePoints || 0,
      touchpointsDone: touchDone,
      touchpointsTotal: touchTotal,
      lastActiveAt: lastActive ? formatRuDayMonth(lastActive) : null,
      lastActivePhase: phaseFromDate(lastActive),
      dirAvgPath,
      dirAvgExp,
    },
    exchange: {
      questionsCount: myQuestions.length,
      answersCount: myAnswers.length,
      questionSamples,
      answerSamples,
      themes: exchangeThemes,
    },
    kopilka: {
      total: piggy.total,
      thought: piggy.thought,
      idea: piggy.idea,
      toWork: piggy.toWork,
      later: piggy.later,
      question: questionTag,
      favoriteTags,
      quotes: piggy.picked.slice(0, 5),
      themes: kopThemes,
    },
    state: {
      days: stateDays,
      zoneCounts: [...zoneTally.entries()]
        .map(([zone, n]) => ({ zone, n }))
        .sort((a, b) => b.n - a.n),
      topReasons,
    },
    afterBlocks: {
      total: reflections.length,
      items: afterItems,
      themes: classifyThemes(reflections.map(r => `${r.event} ${r.text}`), 5),
    },
    pointA,
    nextStep,
    nextStepWhen,
    roles,
  };

  return {
    ...base,
    narrative: buildAnalyticalNarrative(base),
  };
}

export function renderAnalyticalProfileHtml(profile: AnalyticalProfile): string {
  const template = PARTICIPANT_ANALYTICAL_PROFILE_TEMPLATE;
  const json = JSON.stringify(profile).replace(/</g, '\\u003c');
  if (!template.includes('__PROFILE_JSON__')) {
    throw new Error('analytical profile template missing __PROFILE_JSON__ placeholder');
  }
  return template.replace('__PROFILE_JSON__', json);
}

export async function buildAnalyticalProfileHtml(participantId: number): Promise<{
  html: string;
  profile: AnalyticalProfile;
  pagesHint: number;
} | null> {
  const profile = await buildAnalyticalProfile(participantId);
  if (!profile) return null;
  const html = renderAnalyticalProfileHtml(profile);
  const pagesHint = 3;
  console.info('[participant-profile-2]', {
    participantId,
    pagesHint,
    name: profile.person.name,
    strengths: profile.narrative.strengths.length,
  });
  return { html, profile, pagesHint };
}
