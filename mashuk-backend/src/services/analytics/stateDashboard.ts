import type { AdminRequest } from '../../middlewares/adminAuth.js';
import { getForumSettings } from '../helpers.js';
import { isOrganizerDirection } from '../leaderboardQuery.js';
import {
  CHECKIN_EMOTION_LABELS,
  emotionIdToLabel,
  emotionIdToZone,
  type EmotionZoneKey,
} from '../emotionZones.js';
import type { AnalyticsFilters } from './analyticsQuery.js';
import { resolveDayRange } from './analyticsQuery.js';
import { loadCohortParticipants } from './cohort.js';
import {
  collectKindAnswerRows,
  type KindAnswerRow,
} from './questionKindDashboard.js';
import { stateCheckPhaseFromQuestion } from './analyticsQuestionLive.js';
import {
  buildEmotionDayPhaseDynamics,
  buildEnergyDayPhaseDynamics,
  buildParticipantPathAcrossDays,
  buildParticipantPathSeries,
  type PathAnswerInput,
} from './participantPathSeries.js';
import {
  PHASE_ORDER,
  PHASE_RU,
  ZONE_ORDER,
  ZONE_RU,
  buildTransition,
  cellNeg,
  countThemes,
  energyHist,
  isNegZone,
  isPsychoReason,
  median,
  negSharePct,
  quotePolarity,
  round1,
  zoneDistCounts,
  type PhaseKey,
  type ZoneKey,
} from './stateDashboardMetrics.js';

function resolvePhase(r: KindAnswerRow): PhaseKey {
  return stateCheckPhaseFromQuestion(
    { timePoint: r.timePoint, title: r.questionTitle },
    r.createdAt,
  );
}

function zoneOf(r: KindAnswerRow): ZoneKey | null {
  const z = (r.emotionZone as EmotionZoneKey | null)
    ?? emotionIdToZone(r.emotion);
  if (!z) return null;
  if ((ZONE_ORDER as readonly string[]).includes(z)) return z as ZoneKey;
  return null;
}

function withoutOrganizers(rows: KindAnswerRow[]): KindAnswerRow[] {
  return rows.filter(r => !isOrganizerDirection(r.direction));
}

function pct(n: number, d: number): number {
  return d ? round1((n / d) * 100) : 0;
}

function toPathAnswers(rows: KindAnswerRow[]): PathAnswerInput[] {
  return rows.map(r => ({
    participantId: r.participantId,
    energy: r.energy,
    emotion: r.emotion,
    emotionZone: r.emotionZone ?? null,
    timePoint: r.timePoint ?? null,
    createdAt: r.createdAt ?? null,
    day: r.day ?? null,
  }));
}

export async function buildStateDashboard(filters: AnalyticsFilters, req?: AdminRequest) {
  const settings = await getForumSettings(filters.shiftId);
  const currentDay = settings.currentDay ?? 1;
  const totalDays = Math.min(Math.max(settings.totalDays ?? 8, 1), 8);
  const days = resolveDayRange(filters, currentDay);
  const dayFilter = days.length === 1 ? days[0] : null;

  const cohort = await loadCohortParticipants(filters, req);
  const registered = cohort.filter(
    p => p.onboardingCompletedAt && !isOrganizerDirection(p.direction),
  );

  const { rows: rawRows } = await collectKindAnswerRows('state_check', filters);
  const rows = withoutOrganizers(
    dayFilter != null ? rawRows.filter(r => r.day === dayFilter) : rawRows,
  );

  /** Путь участника — всегда за смену (1…totalDays), с учётом направления/группы фильтров. */
  const needShiftCollect = dayFilter != null;
  const shiftRows = withoutOrganizers(
    needShiftCollect
      ? (await collectKindAnswerRows('state_check', {
        ...filters,
        mode: 'shift',
        day: null,
        compareDays: [],
      })).rows
      : rawRows,
  );
  const pathAnswersDay = toPathAnswers(rows);
  const pathAnswersShift = toPathAnswers(shiftRows);
  const participantPath = buildParticipantPathSeries(pathAnswersDay, {
    dayFilter: dayFilter,
  });
  const participantPathShift = buildParticipantPathAcrossDays(pathAnswersShift, {
    maxDay: totalDays,
  });
  const emotionDynamics = buildEmotionDayPhaseDynamics(pathAnswersShift, { maxDay: totalDays });
  emotionDynamics.note = 'Доля эмоции по фазам утро / день / вечер за все дни смены.';
  const energyDynamics = buildEnergyDayPhaseDynamics(pathAnswersShift, { maxDay: totalDays });

  const participantIds = new Set(rows.map(r => r.participantId));
  const reasonsAll = rows.map(r => (r.answer || '').trim()).filter(Boolean);
  const answers = rows.length;

  // Phase stacks
  const byPhase: Record<PhaseKey, KindAnswerRow[]> = {
    morning: [], day: [], evening: [],
  };
  for (const r of rows) byPhase[resolvePhase(r)].push(r);

  const zoneByPhase = PHASE_ORDER.map(phase => {
    const slice = byPhase[phase];
    const zones = slice.map(zoneOf);
    const dist = zoneDistCounts(zones);
    const energies = slice.map(r => r.energy).filter((e): e is number => e != null && Number.isFinite(e));
    return {
      phase: PHASE_RU[phase],
      phaseKey: phase,
      dist,
      n: slice.length,
      energy: median(energies),
      neg: negSharePct(dist),
    };
  });

  const phaseCov = PHASE_ORDER.map(phase => ({
    phase: PHASE_RU[phase],
    n: byPhase[phase].length,
  }));

  // Current phase for KPI: last non-empty
  let currentPhase: PhaseKey = 'morning';
  for (const p of PHASE_ORDER) {
    if (byPhase[p].length) currentPhase = p;
  }
  const prevPhase: PhaseKey | null = currentPhase === 'evening'
    ? 'day'
    : currentPhase === 'day'
      ? 'morning'
      : null;
  const currentNeg = zoneByPhase.find(z => z.phaseKey === currentPhase)?.neg ?? 0;
  const prevNeg = prevPhase
    ? (zoneByPhase.find(z => z.phaseKey === prevPhase)?.neg ?? null)
    : null;

  // Directions
  const regByDir = new Map<string, number>();
  for (const p of registered) {
    const d = (p.direction || '—').trim() || '—';
    if (isOrganizerDirection(d)) continue;
    regByDir.set(d, (regByDir.get(d) || 0) + 1);
  }
  const dirBuckets = new Map<string, KindAnswerRow[]>();
  for (const r of rows) {
    const d = (r.direction || '—').trim() || '—';
    if (!dirBuckets.has(d)) dirBuckets.set(d, []);
    dirBuckets.get(d)!.push(r);
  }
  const dirs = [...new Set([...regByDir.keys(), ...dirBuckets.keys()])]
    .filter(d => !isOrganizerDirection(d))
    .map(dir => {
      const slice = dirBuckets.get(dir) ?? [];
      const people = new Set(slice.map(r => r.participantId)).size;
      const registeredN = regByDir.get(dir) ?? 0;
      const dist = zoneDistCounts(slice.map(zoneOf));
      const tot = dist.reduce((a, b) => a + b, 0) || 1;
      const withReason = slice.filter(r => (r.answer || '').trim()).length;
      return {
        dir,
        n: slice.length,
        people,
        registered: registeredN,
        cov: pct(people, registeredN),
        risk: round1(((dist[4] ?? 0) / tot) * 100),
        tired: round1(((dist[3] ?? 0) / tot) * 100),
        up: round1(((dist[0] ?? 0) / tot) * 100),
        reason: pct(withReason, slice.length),
      };
    })
    .sort((a, b) => a.cov - b.cov || a.dir.localeCompare(b.dir, 'ru'));

  // Groups: day total n ≥ 15
  const groupMap = new Map<string, KindAnswerRow[]>();
  for (const r of rows) {
    const g = (r.group || '').trim();
    if (!g || g === '—' || g === 'без группы') continue;
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(r);
  }
  const groups = [...groupMap.entries()]
    .map(([group, slice]) => {
      if (slice.length < 15) return null;
      const cells = PHASE_ORDER.map(phase => {
        const ph = slice.filter(r => resolvePhase(r) === phase);
        const negCount = ph.filter(r => isNegZone(zoneOf(r))).length;
        return cellNeg(ph.length, negCount, 5);
      });
      const dayNegCount = slice.filter(r => isNegZone(zoneOf(r))).length;
      const energies = slice.map(r => r.energy).filter((e): e is number => e != null && Number.isFinite(e));
      return {
        group,
        n: slice.length,
        dir: (slice[0].direction || '—').trim() || '—',
        neg: round1((dayNegCount / slice.length) * 100),
        energy: median(energies) ?? 0,
        cells,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null)
    .sort((a, b) => b.neg - a.neg);

  const attentionGroups = groups.filter(g => g.neg >= 25).length;

  // Emotions
  const emoCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.emotion) continue;
    const id = r.emotion.trim().toLowerCase();
    emoCounts.set(id, (emoCounts.get(id) || 0) + 1);
  }
  const emotions = [...emoCounts.entries()]
    .map(([id, n]) => ({
      name: (id in CHECKIN_EMOTION_LABELS
        ? CHECKIN_EMOTION_LABELS[id as keyof typeof CHECKIN_EMOTION_LABELS]
        : emotionIdToLabel(id)),
      n,
      zone: ZONE_RU[(emotionIdToZone(id) as ZoneKey) ?? 'neutral'] ?? 'Нейтраль',
    }))
    .sort((a, b) => b.n - a.n);

  // Reasons / themes — neg themes from risk+fatigue; quotes = all polarities
  const negReasons = rows
    .filter(r => isNegZone(zoneOf(r)) && (r.answer || '').trim())
    .map(r => ({
      text: r.answer.trim(),
      phase: PHASE_RU[resolvePhase(r)],
      zone: ZONE_RU[zoneOf(r)!],
      dir: (r.direction || '—').trim() || '—',
      psycho: isPsychoReason(r.answer),
    }));
  const posReasons = rows
    .filter(r => !isNegZone(zoneOf(r)) && (r.answer || '').trim())
    .map(r => r.answer.trim());

  const themesNeg = countThemes(negReasons.filter(r => !r.psycho).map(r => r.text));
  const themesPos = countThemes(posReasons);
  const allQuotes = rows
    .filter(r => (r.answer || '').trim())
    .map(r => {
      const zone = zoneOf(r);
      const phase = resolvePhase(r);
      const text = r.answer.trim();
      return {
        text,
        phase: PHASE_RU[phase],
        phaseKey: phase,
        zone: zone ? ZONE_RU[zone] : '—',
        zoneKey: zone,
        dir: (r.direction || '—').trim() || '—',
        polarity: quotePolarity(zone),
        psycho: isPsychoReason(text),
        at: r.createdAt?.getTime() ?? 0,
      };
    })
    .filter(r => !r.psycho)
    .sort((a, b) => b.at - a.at || b.text.length - a.text.length);
  const quotes = allQuotes.slice(0, 500).map(r => ({
    text: r.text.slice(0, 400),
    meta: `${r.phase} · ${r.zone} · ${r.dir}`,
    phase: r.phase,
    phaseKey: r.phaseKey,
    zone: r.zone,
    zoneKey: r.zoneKey,
    dir: r.dir,
    polarity: r.polarity,
  }));
  const psychoCount = negReasons.filter(r => r.psycho).length;
  const reasonCoveragePct = pct(reasonsAll.length, answers || 1);
  const noReasonPct = pct(Math.max(0, answers - reasonsAll.length), answers || 1);

  // Energy
  const energies = rows
    .map(r => r.energy)
    .filter((e): e is number => e != null && Number.isFinite(e) && e >= 0 && e <= 10);
  const hist = energyHist(energies);

  // Transition morning → evening
  type PidDay = string;
  const byPidDay = new Map<PidDay, Partial<Record<PhaseKey, ZoneKey>>>();
  for (const r of rows) {
    const z = zoneOf(r);
    if (!z) continue;
    const key = `${r.participantId}:${r.day}`;
    if (!byPidDay.has(key)) byPidDay.set(key, {});
    const bucket = byPidDay.get(key)!;
    // last write wins within phase
    bucket[resolvePhase(r)] = z;
  }
  const pairs: Array<{ from: ZoneKey; to: ZoneKey }> = [];
  const phaseHits = new Map<number, Set<PhaseKey>>();
  for (const [key, phases] of byPidDay) {
    const pid = Number(key.split(':')[0]);
    if (!phaseHits.has(pid)) phaseHits.set(pid, new Set());
    for (const p of PHASE_ORDER) {
      if (phases[p]) phaseHits.get(pid)!.add(p);
    }
    if (phases.morning && phases.evening) {
      pairs.push({ from: phases.morning, to: phases.evening });
    }
  }
  const transition = buildTransition(pairs);

  const coverageMap = new Map<number, number>();
  for (const set of phaseHits.values()) {
    const k = set.size;
    if (k >= 1 && k <= 3) coverageMap.set(k, (coverageMap.get(k) || 0) + 1);
  }
  const coverage = [1, 2, 3].map(k => ({ k, n: coverageMap.get(k) || 0 }));

  // Day series (coverage / evening neg) across 1–8
  const { rows: allRaw } = dayFilter != null
    ? await collectKindAnswerRows('state_check', {
      ...filters,
      mode: 'shift',
      day: null,
      compareDays: [],
    })
    : { rows: rawRows };
  const allRows = withoutOrganizers(allRaw);
  const daySeries = [1, 2, 3, 4, 5, 6, 7, 8].map(day => {
    const dayRows = allRows.filter(r => r.day === day);
    const people = new Set(dayRows.map(r => r.participantId)).size;
    const evening = dayRows.filter(r => resolvePhase(r) === 'evening');
    const eveningDist = zoneDistCounts(evening.map(zoneOf));
    return {
      day,
      coveragePct: registered.length ? pct(people, registered.length) : null,
      eveningNeg: negSharePct(eveningDist),
      answers: dayRows.length,
      participants: people,
    };
  });

  const zones = ZONE_ORDER.map(k => ZONE_RU[k]);

  return {
    filters,
    currentForumDay: currentDay,
    meta: {
      day: dayFilter ?? currentDay,
      answers,
      participants: participantIds.size,
      registered: registered.length,
      reasons: reasonsAll.length,
      attentionGroups,
      currentPhase: PHASE_RU[currentPhase],
      currentNeg: currentNeg ?? 0,
      prevNeg,
      psychoCount,
      coveragePct: pct(participantIds.size, registered.length),
      reasonCoveragePct,
      noReasonPct,
    },
    zones,
    phaseCov,
    zoneByPhase,
    dirs,
    groups: groups.slice(0, 20),
    emotions,
    energyHist: hist,
    energyMedian: median(energies),
    themesNeg,
    themesPos,
    negCount: negReasons.filter(r => !r.psycho).length,
    posCount: posReasons.length,
    quotes,
    quotesTotal: allQuotes.length,
    transition,
    coverage,
    daySeries,
    participantPath: {
      path: participantPath,
      pathShift: participantPathShift,
      emotionDynamics,
      energyDynamics,
    },
    protocol: [
      { when: 'Немедленно', what: 'Участник дважды подряд в зоне «Риск» — куратор группы получает имя. Штаб видит только счётчик.' },
      { when: 'В течение часа', what: 'Группа: ≥25% ответов фазы в минусе при n ≥ 5 — куратор в группу, вопрос на вечернем разборе.' },
      { when: 'К вечернему штабу', what: 'Тема причин выросла вдвое к вчерашнему — отвечающий за блок готовит решение к утру.' },
      { when: 'К утреннему штабу', what: 'Охват направления ниже 65% — проблема доставки анкеты, не состояния.' },
      { when: 'Психологу, не в дашборд', what: 'Упоминания внешних событий и тревоги за близких выводятся из общей ленты.' },
    ],
    exportPath: dayFilter
      ? `/exports/state-checks?mode=day&day=${dayFilter}`
      : '/exports/state-checks?mode=shift',
  };
}
