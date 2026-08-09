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
  key: PathPhase;
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
  energySeries: { step: PathPhase; label: string; avg: number | null; median: number | null; n: number }[];
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
