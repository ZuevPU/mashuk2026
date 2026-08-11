/**
 * Сборка PROFILE для итогового HTML-профиля участника.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { PARTICIPANT_FINAL_PROFILE_TEMPLATE } from './participantFinalProfile/templateHtml.js';
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
  classifyPiggyThemes,
  emptyParticipation,
  emptyState,
  filterProfilePiggy,
  mapExperimentResult,
  pickCriterionAnswer,
  profileDensity,
  resolveExpRank,
  shiftDateRange,
  type FinalProfile,
  type ProfileZone,
} from './participantFinalProfileLogic.js';

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

function pointBList(raw: unknown, len: number): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: len }, () => null);
  if (Array.isArray(raw)) {
    for (let i = 0; i < len; i++) {
      const v = humanizeAnswer(raw[i]);
      out[i] = v || null;
    }
    return out;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    keys.forEach((k, i) => {
      if (i >= len) return;
      const v = humanizeAnswer(obj[k]);
      out[i] = v || null;
    });
  }
  return out;
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

export async function buildFinalProfile(participantId: number): Promise<FinalProfile | null> {
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

  // If goals shorter than answers stored without config texts
  if (!pointA.length && goals.length) {
    for (let i = 0; i < goals.length; i++) {
      const a = humanizeAnswer(goals[i]);
      if (!a) continue;
      pointA.push({ q: goalQs[i] || `Вопрос ${i + 1}`, a: clampText(a, 300) });
    }
  }

  let pointBRaw = p.pointBAnswers ?? null;
  const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
  if (!pointBRaw) {
    const pointBQs = await db.select().from(questions).where(eq(questions.block, 'Точка Б'));
    const pbIds = new Set(pointBQs.map(q => q.id));
    const pbAnswers = userAnswers
      .filter(a => pbIds.has(a.questionId))
      .sort((a, b) => a.questionId - b.questionId);
    if (pbAnswers.length) pointBRaw = pbAnswers.map(a => a.answerData);
  }
  const pointB = pointBList(pointBRaw, Math.max(pointA.length, 1));

  const answerQuestionIds = [...new Set(userAnswers.map(a => a.questionId))];
  const answerQuestions = answerQuestionIds.length
    ? await db.select().from(questions).where(inArray(questions.id, answerQuestionIds))
    : [];
  const questionById = new Map(answerQuestions.map(q => [q.id, q]));

  // State by day/phase
  const state = emptyState(8);
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
    if (!zone) continue;
    const phase = resolvePhase(q.timePoint, a.createdAt);
    for (const day of days) {
      const slot = state[day - 1];
      if (phase === 'morning') slot.morning = zone;
      else if (phase === 'day') slot.day_ = zone;
      else slot.evening = zone;
    }
  }

  // After-blocks reflections
  type RefItem = {
    text: string;
    event: string;
    level: ReturnType<typeof classifyReflection>;
    at: number;
  };
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

  const reflection = {
    total: reflections.length,
    transfer: reflections.filter(r => r.level === 'Перенос в практику').length,
    self: reflections.filter(r => r.level === 'Связь с собой').length,
    thesis: reflections.filter(r => r.level === 'Тезис').length,
    reaction: reflections.filter(r => r.level === 'Реакция').length,
    best: [...reflections]
      .filter(r => r.level === 'Перенос в практику' || r.level === 'Связь с собой' || r.text.length >= 60)
      .sort((a, b) => {
        const rank = (l: string) => (l === 'Перенос в практику' ? 2 : l === 'Связь с собой' ? 1 : 0);
        return rank(b.level) - rank(a.level) || b.text.length - a.text.length;
      })
      .slice(0, 3)
      .map(r => ({ event: r.event, text: clampText(r.text, 300) })),
  };

  // Piggybank
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
  const themes = classifyPiggyThemes(piggy.usable.map(r => r.text), 3);

  // Criterion
  const critPick = pickCriterionAnswer(pointA);
  let criterion: FinalProfile['criterion'] = null;
  if (critPick) {
    const found: { name: string; src: string; at: number }[] = [];
    for (const row of piggy.usable) {
      const tags = new Set(row.tags.map(t => t.trim().toLowerCase()));
      if (![...tags].some(t => t === 'идея' || t === 'в работу' || t === 'на будущее')) continue;
      found.push({
        name: clampText(row.text, 140),
        src: (row.source || 'Копилка').trim() || 'Копилка',
        at: row.createdAt?.getTime() ?? 0,
      });
    }
    for (const r of reflections) {
      if (r.level !== 'Перенос в практику') continue;
      found.push({
        name: clampText(r.text, 140),
        src: r.event,
        at: r.at,
      });
    }
    found.sort((a, b) => a.at - b.at);
    const uniq: { name: string; src: string }[] = [];
    const seen = new Set<string>();
    for (const f of found) {
      const key = f.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push({ name: f.name, src: f.src });
      if (uniq.length >= 8) break;
    }
    criterion = { text: clampText(critPick.text, 240), target: critPick.target, found: uniq };
  }

  // Participation (touchpoints per day)
  const answeredIds = new Set(userAnswers.map(a => a.questionId));
  const dayStates = await db.select().from(participantDayState)
    .where(eq(participantDayState.participantId, p.id))
    .orderBy(asc(participantDayState.dayNumber));
  const eveningDoneDays = new Set(
    dayStates.filter(s => s.eveningRatings).map(s => s.dayNumber),
  );
  const tpQuestions = await loadPublishedTouchpointQuestions(Math.max(currentDay, totalDays), p.shiftId);
  const participation = emptyParticipation(8);
  for (let d = 1; d <= 8; d++) {
    if (d > currentDay && !eveningDoneDays.has(d) && !userAnswers.some(a => {
      const q = questionById.get(a.questionId);
      return q ? questionMatchesDay(q, d) : false;
    })) {
      continue;
    }
    const dayQs = tpQuestions.filter(q => questionMatchesDay(q, d) && isTouchpointQuestionForForumDay(q, d));
    if (!dayQs.length && !eveningDoneDays.has(d)) continue;
    const { completed, expected } = touchpointCompletionRatio(tpQuestions, answeredIds, d, {
      eveningDone: eveningDoneDays.has(d),
    });
    if (expected <= 0) continue;
    participation[d - 1] = { day: d, done: completed, total: expected };
  }

  // Roles
  const roles: FinalProfile['roles'] = [];
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

  // Exchange contribution
  const myAnswers = await db.select().from(exchangeAnswers)
    .where(eq(exchangeAnswers.participantId, p.id))
    .orderBy(desc(exchangeAnswers.createdAt));
  const myQuestions = await db.select({ id: exchangeQuestions.id })
    .from(exchangeQuestions)
    .where(eq(exchangeQuestions.participantId, p.id));

  let peopleReached = 0;
  let bestAnswer = '';
  let bestScore = -1;
  if (myAnswers.length) {
    const qIds = [...new Set(myAnswers.map(a => a.questionId))];
    const qRows = qIds.length
      ? await db.select({
        id: exchangeQuestions.id,
        authorId: exchangeQuestions.participantId,
      }).from(exchangeQuestions).where(inArray(exchangeQuestions.id, qIds))
      : [];
    peopleReached = new Set(qRows.map(q => q.authorId).filter(id => id !== p.id)).size;
    for (const a of myAnswers) {
      const reactions = (a.reactions || {}) as Record<string, unknown>;
      const score = typeof reactions === 'object'
        ? Object.values(reactions).reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0)
        : 0;
      if (score > bestScore && (a.text || '').trim().length >= 8) {
        bestScore = score;
        bestAnswer = clampText(a.text, 240);
      }
    }
    if (!bestAnswer && myAnswers[0]?.text) bestAnswer = clampText(myAnswers[0].text, 240);
  }

  // Direction cohort context + exp rank
  const dirName = p.direction || '—';
  const cohortFilter = p.shiftId != null
    ? and(eq(participants.shiftId, p.shiftId), eq(participants.direction, dirName))
    : eq(participants.direction, dirName);
  const cohort = await db.select({
    id: participants.id,
    experiencePoints: participants.experiencePoints,
    onboardingCompletedAt: participants.onboardingCompletedAt,
    direction: participants.direction,
  }).from(participants).where(cohortFilter);

  const cohortPeers = cohort.filter(
    c => c.onboardingCompletedAt && !isOrganizerDirection(c.direction) && c.id !== p.id,
  );
  const expRank = resolveExpRank(
    p.experiencePoints ?? 0,
    [p.experiencePoints ?? 0, ...cohortPeers.map(c => c.experiencePoints ?? 0)],
  );

  // Lightweight direction averages (own / points / kop)
  let dirOwn: number | null = null;
  let dirPoints: number | null = null;
  let dirKop: number | null = null;
  const peerIds = cohortPeers.map(c => c.id).slice(0, 400);
  if (peerIds.length >= 5) {
    const peerPiggy = await db.select({
      participantId: piggybank.participantId,
    }).from(piggybank).where(and(
      inArray(piggybank.participantId, peerIds),
      isNull(piggybank.deletedAt),
    ));
    const kopByPid = new Map<number, number>();
    for (const row of peerPiggy) {
      kopByPid.set(row.participantId, (kopByPid.get(row.participantId) || 0) + 1);
    }
    const kopVals = peerIds.map(id => kopByPid.get(id) || 0);
    dirKop = Math.round((kopVals.reduce((a, b) => a + b, 0) / kopVals.length) * 10) / 10;

    // Appropriation proxy: share of after_blocks answers with transfer/self among peers is expensive;
    // use participant's own reflection appropriation as context only when we have peer after-blocks sample.
    const afterQs = await db.select({ id: questions.id }).from(questions).where(
      sql`(${questions.questionKind} = 'after_blocks' OR lower(coalesce(${questions.block}, '')) LIKE '%точки осмысления%')`,
    );
    const afterIds = afterQs.map(q => q.id);
    if (afterIds.length) {
      const peerAnswers = await db.select({
        participantId: answers.participantId,
        answerData: answers.answerData,
      }).from(answers).where(and(
        inArray(answers.participantId, peerIds),
        inArray(answers.questionId, afterIds),
      )).limit(2000);
      let ownN = 0;
      let totN = 0;
      for (const row of peerAnswers) {
        const picks = parseAfterBlocksPicks(row.answerData);
        const texts = picks.length
          ? picks.map(x => x.text || '').filter(Boolean)
          : [participantAnswerSummary(row.answerData)].filter(Boolean);
        for (const t of texts) {
          if (String(t).trim().length < 8) continue;
          totN += 1;
          const level = classifyReflection(String(t));
          if (level === 'Перенос в практику' || level === 'Связь с собой') ownN += 1;
        }
      }
      if (totN >= 10) dirOwn = Math.round((ownN / totN) * 1000) / 10;
    }

    // Average closed touchpoints / day as "dirPoints" orientir (нейтральный)
    const filled = participation.filter(d => d.done != null && d.total);
    if (filled.length) {
      const avg = filled.reduce((s, d) => s + (d.done! / (d.total || 1)), 0) / filled.length;
      dirPoints = Math.round(avg * 10 * 10) / 10; // scale-ish 0–10 feel from ratio*10
    }
  }

  const { nextStep, nextStepWhen } = nextStepFromParticipant(p);
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || `Участник ${p.id}`;

  const profile: FinalProfile = {
    person: {
      name,
      direction: dirName,
      shift: shiftLabel,
      group: p.groupName || '—',
      from: range.from,
      to: range.to,
      days: range.days,
    },
    pointA,
    pointB,
    criterion,
    participation,
    state,
    roles,
    kopilka: {
      total: piggy.total,
      thought: piggy.thought,
      idea: piggy.idea,
      toWork: piggy.toWork,
      later: piggy.later,
      contacts: piggy.contacts,
      picked: piggy.picked,
      themes,
    },
    reflection,
    contribution: {
      answers: myAnswers.length,
      questions: myQuestions.length,
      peopleReached,
      expRank,
      bestAnswer,
    },
    context: {
      dirName,
      dirPoints,
      dirOwn,
      dirKop,
    },
    nextStep,
    nextStepWhen,
  };

  // density logged by caller via profileDensity
  void profileDensity({
    stateDays: state.filter(s => s.morning || s.day_ || s.evening).length,
    reflectionTotal: reflection.total,
    kopilkaTotal: piggy.total,
    contributionAnswers: myAnswers.length,
  });

  return profile;
}

export function renderFinalProfileHtml(profile: FinalProfile): string {
  const template = PARTICIPANT_FINAL_PROFILE_TEMPLATE;
  const json = JSON.stringify(profile).replace(/</g, '\\u003c');
  if (!template.includes('__PROFILE_JSON__')) {
    throw new Error('participant profile template missing __PROFILE_JSON__ placeholder');
  }
  return template.replace('__PROFILE_JSON__', json);
}

export async function buildFinalProfileHtml(participantId: number): Promise<{
  html: string;
  profile: FinalProfile;
  mode: string;
  pagesHint: number;
} | null> {
  const profile = await buildFinalProfile(participantId);
  if (!profile) return null;
  const { mode, density } = profileDensity({
    stateDays: profile.state.filter(s => s.morning || s.day_ || s.evening).length,
    reflectionTotal: profile.reflection.total,
    kopilkaTotal: profile.kopilka.total,
    contributionAnswers: profile.contribution.answers,
  });
  const html = renderFinalProfileHtml(profile);
  const pagesHint = mode === 'full' ? 5 : mode === 'short' ? 4 : mode === 'brief' ? 3 : 1;
  console.info('[participant-profile]', {
    participantId,
    mode,
    density,
    pagesHint,
    name: profile.person.name,
  });
  return { html, profile, mode, pagesHint };
}
