import {
  buildEmotionDistribution,
  CHECKIN_EMOTION_IDS,
  CHECKIN_EMOTION_LABELS,
  emotionIdToLabel,
  emotionIdToZone,
  EMOTION_ZONE_LABELS,
  type EmotionZoneKey,
} from '../emotionZones.js';
import { stateCheckPhaseForAnswer } from './touchpointMetrics.js';
import { emptyZoneDistribution, zonesToPercent } from './zoneDistribution.js';
import { numericSummary, type NumericSummary } from './participantProfileStats.js';

export type PathPhase = 'morning' | 'day' | 'evening';

export type PathAnswerInput = {
  participantId: number;
  energy: number | null;
  emotion: string | null;
  emotionZone?: string | null;
  timePoint?: string | null;
  createdAt?: Date | null;
  day?: number | null;
};

export type PathStep = {
  key: string;
  label: string;
  responses: number;
  uniqueParticipants: number;
  energy: NumericSummary;
  modeEmotion: string | null;
  modeZone: string | null;
  emotions: { id: string; label: string; count: number; pct: number }[];
  zonesPercent: Record<EmotionZoneKey, number>;
  riskFatiguePct: number | null;
};

export type ParticipantPathPayload = {
  steps: PathStep[];
  emotionSeries: {
    emotion: string;
    label: string;
    morningPct: number;
    dayPct: number;
    eveningPct: number;
    morningCount: number;
    dayCount: number;
    eveningCount: number;
  }[];
  energySeries: { step: string; label: string; avg: number | null; median: number | null; n: number }[];
  dayFilter: number | null;
  note: string;
};

const PHASE_ORDER: PathPhase[] = ['morning', 'day', 'evening'];
const PHASE_LABELS: Record<PathPhase, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
};

export function resolvePathPhase(input: {
  timePoint?: string | null;
  createdAt?: Date | null;
}): PathPhase {
  const tp = (input.timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return stateCheckPhaseForAnswer(input.createdAt ?? null);
}

function emptyStep(key: PathPhase): PathStep {
  return {
    key,
    label: PHASE_LABELS[key],
    responses: 0,
    uniqueParticipants: 0,
    energy: { avg: null, median: null, min: null, max: null, count: 0 },
    modeEmotion: null,
    modeZone: null,
    emotions: buildEmotionDistribution(new Map(), 0),
    zonesPercent: zonesToPercent(emptyZoneDistribution()),
    riskFatiguePct: null,
  };
}

/**
 * Агрегированный путь когорты по проверкам состояния: утро → день → вечер.
 */
export function buildParticipantPathSeries(
  answers: PathAnswerInput[],
  opts?: { dayFilter?: number | null },
): ParticipantPathPayload {
  const dayFilter = opts?.dayFilter ?? null;
  const rows = dayFilter != null
    ? answers.filter(a => a.day == null || a.day === dayFilter)
    : answers;

  const byPhase = new Map<PathPhase, PathAnswerInput[]>();
  for (const p of PHASE_ORDER) byPhase.set(p, []);
  for (const a of rows) {
    const phase = resolvePathPhase(a);
    byPhase.get(phase)!.push(a);
  }

  const steps: PathStep[] = PHASE_ORDER.map(key => {
    const list = byPhase.get(key) ?? [];
    if (!list.length) return emptyStep(key);

    const pids = new Set(list.map(a => a.participantId));
    const energyVals = list
      .map(a => a.energy)
      .filter((v): v is number => v != null && Number.isFinite(v) && v >= 1 && v <= 10);

    const emotionCounts = new Map<string, number>();
    const zones = emptyZoneDistribution();
    for (const a of list) {
      const emo = (a.emotion || '').trim().toLowerCase();
      if (emo) emotionCounts.set(emo, (emotionCounts.get(emo) || 0) + 1);
      const zone = (a.emotionZone as EmotionZoneKey | null | undefined)
        ?? emotionIdToZone(a.emotion);
      if (zone && zone in zones) zones[zone] += 1;
    }

    const emotions = buildEmotionDistribution(emotionCounts, list.length);
    const zonesPercent = zonesToPercent(zones);
    const modeEmotionRow = [...emotions].sort((a, b) => b.count - a.count)[0];
    const modeEmotion = modeEmotionRow && modeEmotionRow.count > 0
      ? modeEmotionRow.label
      : null;

    let bestZone: EmotionZoneKey | null = null;
    let bestZonePct = -1;
    for (const [zk, pct] of Object.entries(zonesPercent) as [EmotionZoneKey, number][]) {
      if (pct > bestZonePct) {
        bestZonePct = pct;
        bestZone = zk;
      }
    }

    const riskFatiguePct = list.length
      ? Math.round(((zones.risk + zones.fatigue) / list.length) * 1000) / 10
      : null;

    return {
      key,
      label: PHASE_LABELS[key],
      responses: list.length,
      uniqueParticipants: pids.size,
      energy: numericSummary(energyVals),
      modeEmotion,
      modeZone: bestZone ? (EMOTION_ZONE_LABELS[bestZone] ?? bestZone) : null,
      emotions,
      zonesPercent,
      riskFatiguePct,
    };
  });

  const stepByKey = new Map(steps.map(s => [s.key, s]));
  const emotionSeries = CHECKIN_EMOTION_IDS.map(id => {
    const morning = stepByKey.get('morning')!.emotions.find(e => e.id === id);
    const day = stepByKey.get('day')!.emotions.find(e => e.id === id);
    const evening = stepByKey.get('evening')!.emotions.find(e => e.id === id);
    return {
      emotion: id,
      label: CHECKIN_EMOTION_LABELS[id] ?? emotionIdToLabel(id),
      morningPct: morning?.pct ?? 0,
      dayPct: day?.pct ?? 0,
      eveningPct: evening?.pct ?? 0,
      morningCount: morning?.count ?? 0,
      dayCount: day?.count ?? 0,
      eveningCount: evening?.count ?? 0,
    };
  });

  const energySeries = steps.map(s => ({
    step: s.key,
    label: s.label,
    avg: s.energy.avg,
    median: s.energy.median,
    n: s.energy.count,
  }));

  return {
    steps,
    emotionSeries,
    energySeries,
    dayFilter,
    note: 'Эмоция и энергия собираются в проверках состояния утро / день / вечер. Дневной шаг — после дневной программы.',
  };
}

function buildStepFromAnswers(key: string, label: string, list: PathAnswerInput[]): PathStep {
  if (!list.length) {
    return {
      key,
      label,
      responses: 0,
      uniqueParticipants: 0,
      energy: { avg: null, median: null, min: null, max: null, count: 0 },
      modeEmotion: null,
      modeZone: null,
      emotions: buildEmotionDistribution(new Map(), 0),
      zonesPercent: zonesToPercent(emptyZoneDistribution()),
      riskFatiguePct: null,
    };
  }

  const pids = new Set(list.map(a => a.participantId));
  const energyVals = list
    .map(a => a.energy)
    .filter((v): v is number => v != null && Number.isFinite(v) && v >= 1 && v <= 10);

  const emotionCounts = new Map<string, number>();
  const zones = emptyZoneDistribution();
  for (const a of list) {
    const emo = (a.emotion || '').trim().toLowerCase();
    if (emo) emotionCounts.set(emo, (emotionCounts.get(emo) || 0) + 1);
    const zone = (a.emotionZone as EmotionZoneKey | null | undefined)
      ?? emotionIdToZone(a.emotion);
    if (zone && zone in zones) zones[zone] += 1;
  }

  const emotions = buildEmotionDistribution(emotionCounts, list.length);
  const zonesPercent = zonesToPercent(zones);
  const modeEmotionRow = [...emotions].sort((a, b) => b.count - a.count)[0];
  const modeEmotion = modeEmotionRow && modeEmotionRow.count > 0
    ? modeEmotionRow.label
    : null;

  let bestZone: EmotionZoneKey | null = null;
  let bestZonePct = -1;
  for (const [zk, pct] of Object.entries(zonesPercent) as [EmotionZoneKey, number][]) {
    if (pct > bestZonePct) {
      bestZonePct = pct;
      bestZone = zk;
    }
  }

  const riskFatiguePct = list.length
    ? Math.round(((zones.risk + zones.fatigue) / list.length) * 1000) / 10
    : null;

  return {
    key,
    label,
    responses: list.length,
    uniqueParticipants: pids.size,
    energy: numericSummary(energyVals),
    modeEmotion,
    modeZone: bestZone ? (EMOTION_ZONE_LABELS[bestZone] ?? bestZone) : null,
    emotions,
    zonesPercent,
    riskFatiguePct,
  };
}

/**
 * Путь когорты по всей смене: Д1·Утро → Д1·День → Д1·Вечер → Д2·Утро → …
 */
export function buildParticipantPathAcrossDays(
  answers: PathAnswerInput[],
  opts?: { maxDay?: number },
): ParticipantPathPayload {
  const maxDay = Math.min(Math.max(opts?.maxDay ?? 8, 1), 8);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const buckets = new Map<string, PathAnswerInput[]>();

  for (const a of answers) {
    if (a.day == null || a.day < 1 || a.day > maxDay) continue;
    const phase = resolvePathPhase(a);
    const key = `${a.day}::${phase}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }

  const steps: PathStep[] = [];
  for (const day of days) {
    for (const phase of PHASE_ORDER) {
      const key = `d${day}_${phase}`;
      const label = `День ${day} · ${PHASE_LABELS[phase]}`;
      steps.push(buildStepFromAnswers(key, label, buckets.get(`${day}::${phase}`) || []));
    }
  }

  const emotionSeries = CHECKIN_EMOTION_IDS.map(id => {
    const row = {
      emotion: id,
      label: CHECKIN_EMOTION_LABELS[id] ?? emotionIdToLabel(id),
      morningPct: 0,
      dayPct: 0,
      eveningPct: 0,
      morningCount: 0,
      dayCount: 0,
      eveningCount: 0,
    };
    // Aggregate all days into phase totals for the compact series (charts use timeline).
    let morningN = 0;
    let dayN = 0;
    let eveningN = 0;
    let morningCount = 0;
    let dayCount = 0;
    let eveningCount = 0;
    for (const day of days) {
      for (const phase of PHASE_ORDER) {
        const step = steps.find(s => s.key === `d${day}_${phase}`);
        const hit = step?.emotions.find(e => e.id === id);
        const total = step?.responses ?? 0;
        const count = hit?.count ?? 0;
        if (phase === 'morning') {
          morningN += total;
          morningCount += count;
        } else if (phase === 'day') {
          dayN += total;
          dayCount += count;
        } else {
          eveningN += total;
          eveningCount += count;
        }
      }
    }
    row.morningCount = morningCount;
    row.dayCount = dayCount;
    row.eveningCount = eveningCount;
    row.morningPct = morningN ? Math.round((morningCount / morningN) * 1000) / 10 : 0;
    row.dayPct = dayN ? Math.round((dayCount / dayN) * 1000) / 10 : 0;
    row.eveningPct = eveningN ? Math.round((eveningCount / eveningN) * 1000) / 10 : 0;
    return row;
  });

  const energySeries = steps.map(s => ({
    step: s.key,
    label: s.label,
    avg: s.energy.avg,
    median: s.energy.median,
    n: s.energy.count,
  }));

  return {
    steps,
    emotionSeries,
    energySeries,
    dayFilter: null,
    note: 'Путь по всей смене: День N · Утро → День → Вечер, затем следующий день. Эмоция и энергия — из проверок состояния.',
  };
}

export type EmotionDayPhasePoint = {
  day: number;
  morningPct: number | null;
  dayPct: number | null;
  eveningPct: number | null;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
  morningTotal: number;
  dayTotal: number;
  eveningTotal: number;
};

export type EmotionDynamicsPayload = {
  days: number[];
  emotions: {
    id: string;
    label: string;
    byDay: EmotionDayPhasePoint[];
  }[];
  note: string;
};

function normalizeEmotionId(raw: string | null | undefined): string | null {
  const e = (raw || '').trim().toLowerCase();
  if (!e) return null;
  if ((CHECKIN_EMOTION_IDS as readonly string[]).includes(e)) return e;
  for (const id of CHECKIN_EMOTION_IDS) {
    if (CHECKIN_EMOTION_LABELS[id].toLowerCase() === e) return id;
  }
  return e;
}

function pctOf(count: number, total: number): number {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

/**
 * Доля выбранной эмоции по дням 1…8 и фазам утро / день / вечер.
 */
export function buildEmotionDayPhaseDynamics(
  answers: PathAnswerInput[],
  opts?: { maxDay?: number },
): EmotionDynamicsPayload {
  const maxDay = Math.min(Math.max(opts?.maxDay ?? 8, 1), 8);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const a of answers) {
    if (a.day == null || a.day < 1 || a.day > maxDay) continue;
    const phase = resolvePathPhase(a);
    const emo = normalizeEmotionId(a.emotion);
    const totalKey = `${a.day}::${phase}`;
    totals.set(totalKey, (totals.get(totalKey) || 0) + 1);
    if (!emo) continue;
    const countKey = `${emo}::${a.day}::${phase}`;
    counts.set(countKey, (counts.get(countKey) || 0) + 1);
  }

  const cell = (emotion: string, day: number, phase: PathPhase) => {
    const total = totals.get(`${day}::${phase}`) || 0;
    const count = counts.get(`${emotion}::${day}::${phase}`) || 0;
    return { count, pct: total ? pctOf(count, total) : null, total };
  };

  const emotions = CHECKIN_EMOTION_IDS.map(id => ({
    id,
    label: CHECKIN_EMOTION_LABELS[id],
    byDay: days.map(day => {
      const morning = cell(id, day, 'morning');
      const midday = cell(id, day, 'day');
      const evening = cell(id, day, 'evening');
      return {
        day,
        morningPct: morning.pct,
        dayPct: midday.pct,
        eveningPct: evening.pct,
        morningCount: morning.count,
        dayCount: midday.count,
        eveningCount: evening.count,
        morningTotal: morning.total,
        dayTotal: midday.total,
        eveningTotal: evening.total,
      };
    }),
  }));

  return {
    days,
    emotions,
    note: 'Доля выбранной эмоции среди ответов проверки состояния в фазе (утро / день / вечер) каждого дня смены. Серия строится по всей смене.',
  };
}

export type EnergyDayPhasePoint = {
  day: number;
  morningAvg: number | null;
  dayAvg: number | null;
  eveningAvg: number | null;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
};

export type EnergyDynamicsPayload = {
  days: number[];
  byDay: EnergyDayPhasePoint[];
  note: string;
};

function meanOrNull(vals: number[]): number | null {
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
}

/**
 * Средняя энергия по дням 1…N и фазам утро / день / вечер (для непрерывного пути).
 */
export function buildEnergyDayPhaseDynamics(
  answers: PathAnswerInput[],
  opts?: { maxDay?: number },
): EnergyDynamicsPayload {
  const maxDay = Math.min(Math.max(opts?.maxDay ?? 8, 1), 8);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const buckets = new Map<string, number[]>();

  for (const a of answers) {
    if (a.day == null || a.day < 1 || a.day > maxDay) continue;
    if (a.energy == null || !Number.isFinite(a.energy)) continue;
    const phase = resolvePathPhase(a);
    const key = `${a.day}::${phase}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a.energy);
  }

  const cell = (day: number, phase: PathPhase) => {
    const vals = buckets.get(`${day}::${phase}`) || [];
    return { avg: meanOrNull(vals), count: vals.length };
  };

  const byDay = days.map(day => {
    const morning = cell(day, 'morning');
    const midday = cell(day, 'day');
    const evening = cell(day, 'evening');
    return {
      day,
      morningAvg: morning.avg,
      dayAvg: midday.avg,
      eveningAvg: evening.avg,
      morningCount: morning.count,
      dayCount: midday.count,
      eveningCount: evening.count,
    };
  });

  return {
    days,
    byDay,
    note: 'Средняя энергия (1–10) по фазам утро → день → вечер за все дни смены.',
  };
}
