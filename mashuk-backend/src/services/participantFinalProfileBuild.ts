/**
 * Сборка PROFILE для итогового HTML-профиля участника.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { PARTICIPANT_FINAL_PROFILE_TEMPLATE } from './participantFinalProfile/templateHtml.js';
import {
  answers,
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
import { participantAnswerSummary } from './participantAnswerFormat.js';
import {
  goalQuestionTexts,
  normalizeOnboardingConfig,
  type GoalQuestion,
} from './roleService.js';
import { stateCheckPhaseForAnswer } from './analytics/touchpointMetrics.js';
import {
  isTouchpointQuestionForForumDay,
  loadPublishedTouchpointQuestions,
  touchpointCompletionRatio,
} from './touchpointProgress.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import {
  assembleGoalMidFromQa,
  assemblePointB,
  buildProfileAiCopy,
  clampText,
  classifyPiggyThemesDetailed,
  emptyEnergy,
  emptyParticipation,
  emptyState,
  filterProfilePiggy,
  formatRuDayMonth,
  isSubstantiveReflection,
  mapExperimentResult,
  pairPointAtoB,
  pickCriterionAnswer,
  profileDensity,
  shiftDateRange,
  type FinalProfile,
  type FinalProfileQa,
  type ProfileZone,
} from './participantFinalProfileLogic.js';
import {
  collectPointBEveningFieldDays,
  collectPointZhEveningFieldDays,
  type EveningField,
  type ForumFinalQuestion,
} from './eveningQuestionnaireConfig.js';
import { formatEveningFieldValue } from './exports/eveningExportData.js';

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

function parseEnergy(answerData: unknown): number | null {
  if (!answerData || typeof answerData !== 'object') return null;
  const e = (answerData as { energy?: unknown }).energy;
  const n = typeof e === 'number' ? e : Number(e);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

function flattenUnknownAnswers(raw: unknown): FinalProfileQa[] {
  const items: FinalProfileQa[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((row, i) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        const o = row as Record<string, unknown>;
        const q = String(o.q || o.question || o.label || `Вопрос ${i + 1}`);
        const a = humanizeAnswer(o.a ?? o.answer ?? o.value ?? o);
        if (a) items.push({ q, a: clampText(a, 320) });
        return;
      }
      const a = humanizeAnswer(row);
      if (a) items.push({ q: `Вопрос ${i + 1}`, a: clampText(a, 320) });
    });
    return items;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const a = humanizeAnswer(v);
      if (!a) continue;
      items.push({ q: k, a: clampText(a, 320) });
    }
  }
  return items;
}

function ratingsText(ratings: Record<string, unknown>, key: string): string | null {
  const v = ratings[key];
  if (typeof v === 'string' && v.trim()) return clampText(v.trim(), 320);
  return null;
}

function mergeQa(primary: FinalProfileQa[], secondary: FinalProfileQa[]): FinalProfileQa[] {
  const out = [...primary];
  const seen = new Set(primary.map(x => `${(x.key || '').toLowerCase()}|${x.q.toLowerCase()}`));
  for (const item of secondary) {
    const key = `${(item.key || '').toLowerCase()}|${item.q.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectMarkedEveningQa(
  questions: ForumFinalQuestion[],
  states: Array<{
    dayNumber: number;
    eveningRatings: unknown;
    tomorrowRoleKey?: string | null;
  }>,
): FinalProfileQa[] {
  const latest = new Map<string, FinalProfileQa>();
  const ordered = [...states].sort((a, b) => a.dayNumber - b.dayNumber);
  for (const q of questions) {
    for (const s of ordered) {
      if (!q.days.includes(s.dayNumber)) continue;
      const ratings = (s.eveningRatings && typeof s.eveningRatings === 'object')
        ? s.eveningRatings as Record<string, unknown>
        : null;
      if (!ratings) continue;
      const field: EveningField = q.field;
      const raw = formatEveningFieldValue(field, ratings, s.tomorrowRoleKey ?? null);
      const a = String(raw ?? '').trim();
      if (!a) continue;
      latest.set(q.id || field.key, {
        q: field.label || field.key,
        a: clampText(a, 320),
        kind: field.type === 'text' || field.type === 'experiment_text' ? 'open' : 'closed',
        key: field.key,
      });
    }
  }
  return [...latest.values()];
}

function pickGoalMid(states: Array<{ eveningRatings: unknown }>): FinalProfile['goalMid'] {
  for (const s of states) {
    const r = (s.eveningRatings && typeof s.eveningRatings === 'object')
      ? s.eveningRatings as Record<string, unknown>
      : null;
    if (!r) continue;
    const changed = ratingsText(r, 'goalChanged')
      || ratingsText(r, 'goalMidChanged')
      || ratingsText(r, 'pointZhChanged');
    const note = ratingsText(r, 'goalMidNote')
      || ratingsText(r, 'pointZhNote')
      || ratingsText(r, 'goalNote');
    const scaleRaw = r.goalScale ?? r.goalMidScale ?? r.pointZhScale;
    const scale = typeof scaleRaw === 'number' ? scaleRaw : Number(scaleRaw);
    const scaleOk = Number.isFinite(scale) ? Math.round(scale) : null;
    if (changed || note || scaleOk != null) {
      return { changed, scale: scaleOk, note };
    }
  }
  return null;
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

  const settings = await getForumSettings(p.shiftId);
  const currentDay = resolveEffectiveCurrentDay(settings);
  const totalDays = Math.min(8, Math.max(1, Number(settings.totalDays) || 8));
  const shiftLabel = (settings as { shiftLabel?: string }).shiftLabel || 'Смена';
  const startDate = settings.startDate ? new Date(settings.startDate) : null;
  const range = shiftDateRange(startDate, totalDays);
  const onboarding = normalizeOnboardingConfig(
    (settings as { roleDiagnosticsConfig?: unknown }).roleDiagnosticsConfig,
  );
  const goalDefs: GoalQuestion[] = onboarding.goalQuestions || [];
  const goalQs = goalQuestionTexts(goalDefs);

  const goals = Array.isArray(p.goalAnswers) ? (p.goalAnswers as unknown[]) : [];
  const pointA: FinalProfileQa[] = [];
  for (let i = 0; i < goalDefs.length; i++) {
    const a = humanizeAnswer(goals[i]);
    if (!a) continue;
    const q = goalDefs[i];
    pointA.push({
      q: q.text || goalQs[i] || `Вопрос ${i + 1}`,
      a: clampText(a, 300),
      kind: q.type === 'open' ? 'open' : 'closed',
    });
  }

  if (!pointA.length && goals.length) {
    for (let i = 0; i < goals.length; i++) {
      const a = humanizeAnswer(goals[i]);
      if (!a) continue;
      const def = goalDefs[i];
      pointA.push({
        q: goalQs[i] || `Вопрос ${i + 1}`,
        a: clampText(a, 300),
        kind: def && def.type !== 'open' ? 'closed' : 'open',
      });
    }
  }

  const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
  const pointBItems: FinalProfileQa[] = flattenUnknownAnswers(p.pointBAnswers);
  if (!pointBItems.length) {
    const pointBQs = await db.select().from(questions).where(eq(questions.block, 'Точка Б'));
    const pbIds = new Set(pointBQs.map(q => q.id));
    const qById = new Map(pointBQs.map(q => [q.id, q]));
    const pbAnswers = userAnswers
      .filter(a => pbIds.has(a.questionId))
      .sort((a, b) => a.questionId - b.questionId);
    for (const a of pbAnswers) {
      const q = qById.get(a.questionId);
      const text = humanizeAnswer(a.answerData);
      if (!text) continue;
      pointBItems.push({
        q: q?.text || q?.title || 'Точка Б',
        a: clampText(text, 320),
      });
    }
  }
  const pointB = assemblePointB(pointBItems);

  const answerQuestionIds = [...new Set(userAnswers.map(a => a.questionId))];
  const answerQuestions = answerQuestionIds.length
    ? await db.select().from(questions).where(inArray(questions.id, answerQuestionIds))
    : [];
  const questionById = new Map(answerQuestions.map(q => [q.id, q]));

  // State by day/phase + energy
  const state = emptyState(8);
  const energy = emptyEnergy(8);
  const energyAcc = Array.from({ length: 8 }, () => ({ sum: 0, n: 0, evening: null as number | null }));
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
    const energyVal = parseEnergy(a.answerData);
    const phase = resolvePhase(q.timePoint, a.createdAt);
    for (const day of days) {
      const slot = state[day - 1];
      if (zone) {
        if (phase === 'morning') slot.morning = zone;
        else if (phase === 'day') slot.day_ = zone;
        else slot.evening = zone;
      }
      if (energyVal != null) {
        const acc = energyAcc[day - 1];
        acc.sum += energyVal;
        acc.n += 1;
        if (phase === 'evening') acc.evening = energyVal;
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    const acc = energyAcc[i];
    energy[i].value = acc.evening != null
      ? acc.evening
      : (acc.n ? Math.round((acc.sum / acc.n) * 10) / 10 : null);
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

  const substantive = reflections.filter(r => isSubstantiveReflection(r.text));
  const reflection = {
    total: reflections.length,
    transfer: reflections.filter(r => r.level === 'Перенос в практику').length,
    self: reflections.filter(r => r.level === 'Связь с собой').length,
    thesis: reflections.filter(r => r.level === 'Тезис').length,
    reaction: reflections.filter(r => r.level === 'Реакция').length,
    best: [...substantive]
      .filter(r => r.level === 'Перенос в практику' || r.level === 'Связь с собой' || r.text.length >= 60)
      .sort((a, b) => {
        const rank = (l: string) => (l === 'Перенос в практику' ? 2 : l === 'Связь с собой' ? 1 : 0);
        return rank(b.level) - rank(a.level) || b.text.length - a.text.length;
      })
      .slice(0, 3)
      .map(r => ({ event: r.event, text: clampText(r.text, 300) })),
    items: substantive
      .slice()
      .sort((a, b) => a.at - b.at)
      .slice(0, 8)
      .map(r => ({ event: r.event, text: clampText(r.text, 300) })),
    theses: [] as { day: number; thesis: string | null; change: string | null }[],
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
  const themePack = classifyPiggyThemesDetailed(
    piggy.usable.map(r => ({ text: r.text, tags: r.tags })),
    3,
  );

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
    const ideaN = piggy.idea;
    const met = critPick.target != null ? uniq.length >= critPick.target : ideaN > 0;
    const note = ideaN > 0
      ? `Есть след по критерию из Точки А. Критерий «${clampText(critPick.text, 80)}» — ${ideaN} из ${piggy.total || ideaN} записей копилки помечены как «идея».`
      : null;
    criterion = {
      text: clampText(critPick.text, 240),
      target: critPick.target,
      found: uniq,
      met,
      note,
    };
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

  // Roles + evening theses
  const roles: FinalProfile['roles'] = [];
  const theses: { day: number; thesis: string | null; change: string | null }[] = [];
  for (const s of dayStates) {
    const ratings = (s.eveningRatings && typeof s.eveningRatings === 'object')
      ? s.eveningRatings as Record<string, unknown>
      : {};
    const thesis = ratingsText(ratings, 'mainThesis');
    const change = ratingsText(ratings, 'understandingChange');
    if ((thesis || change) && s.dayNumber >= 2 && s.dayNumber <= 8) {
      theses.push({ day: s.dayNumber, thesis, change });
    }
    if (!s.activeRoleKey) continue;
    if (s.dayNumber < 1 || s.dayNumber > 8) continue;
    const rawComment = typeof ratings.experimentResult === 'string'
      ? ratings.experimentResult.trim()
      : '';
    const result = mapExperimentResult(s.experimentStatus, rawComment);
    const comment = rawComment.length >= 16 && rawComment !== result
      ? clampText(rawComment, 320)
      : null;
    roles.push({
      day: s.dayNumber,
      role: roleLabel(s.activeRoleKey) || s.activeRoleKey,
      result,
      comment,
    });
  }
  roles.sort((a, b) => a.day - b.day);
  theses.sort((a, b) => a.day - b.day);
  reflection.theses = theses;

  const markedDays = Array.from({ length: totalDays }, (_, i) => i + 1);
  const eveningSettings = settings as Parameters<typeof collectPointBEveningFieldDays>[0];
  const eveningPointB = collectMarkedEveningQa(
    collectPointBEveningFieldDays(eveningSettings, markedDays).questions,
    dayStates,
  );
  const eveningPointZh = collectMarkedEveningQa(
    collectPointZhEveningFieldDays(eveningSettings, markedDays).questions,
    dayStates,
  );
  const mergedPointBItems = mergeQa(eveningPointB, pointB.items);
  Object.assign(pointB, assemblePointB(mergedPointBItems));
  const paired = pairPointAtoB(pointA, pointB.items);
  pointB.leftover = paired.leftoverB;
  const compare = paired.pairs;
  const goalMid = assembleGoalMidFromQa(eveningPointZh) || pickGoalMid(dayStates);
  const { nextStep, nextStepWhen } = nextStepFromParticipant(p);
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || `Участник ${p.id}`;
  const dirName = p.direction || '—';
  const startRole = roleLabel(p.strongRole) || p.strongRole || null;
  const touchDone = participation.reduce((s, d) => s + (d.done || 0), 0);
  const touchTotal = participation.reduce((s, d) => s + (d.total || 0), 0);
  const roleDone = roles.filter(r => r.result && r.result !== 'Не получилось попробовать').length;
  const roleComments = roles.filter(r => r.comment).length;
  const toWork = piggy.toWork + piggy.later;
  const ai = buildProfileAiCopy({
    roleComments,
    reflectionCount: reflection.items.length,
    thesisCount: theses.filter(t => t.thesis || t.change).length,
    touchDone,
    touchTotal,
    roles: [...new Set(roles.map(r => r.role))],
    kopilkaTotal: piggy.total,
    toWork,
    themeNames: themePack.themes.map(t => t.name),
    pointBDone: pointB.completed,
  });

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
    updatedAt: formatRuDayMonth(new Date()),
    startRole,
    snapshot: {
      touchpointsDone: touchDone,
      touchpointsTotal: touchTotal,
      reflections: reflection.total,
      roleTries: roles.length,
      roleDone,
    },
    pointA,
    pointB,
    compare,
    criterion,
    participation,
    state,
    energy,
    roles,
    kopilka: {
      total: piggy.total,
      thought: piggy.thought,
      idea: piggy.idea,
      toWork: piggy.toWork,
      later: piggy.later,
      contacts: piggy.contacts,
      picked: piggy.picked,
      themes: themePack.themes,
      otherCount: themePack.otherCount,
    },
    reflection,
    goalMid,
    nextStep: nextStep || pointB.plan,
    nextStepWhen: nextStepWhen || pointB.planWhen,
    ai,
  };

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
    contributionAnswers: profile.roles.length,
  });
  const html = renderFinalProfileHtml(profile);
  const pagesHint = 8;
  console.info('[participant-profile]', {
    participantId,
    mode,
    density,
    pagesHint,
    name: profile.person.name,
  });
  return { html, profile, mode, pagesHint };
}
