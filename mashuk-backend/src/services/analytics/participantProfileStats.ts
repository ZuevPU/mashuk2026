/** Числовые и сегментные хелперы для «Образа участника». */

export type NumericSummary = {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
};

export const ENGAGEMENT_THRESHOLDS = {
  leaders: 80,
  stable: 60,
  selective: 30,
} as const;

export const PROFILE_RULE_THRESHOLDS = {
  minSample: 5,
  riskFatiguePct: 30,
  energyDrop: 1,
  touchpointCoveragePct: 50,
  eveningFillPct: 60,
  lowScaleAvg5: 3.5,
  directionLagPp: 15,
  highEnergy: 7,
  lowReflectionFillPct: 40,
} as const;

export type EngagementSegmentId =
  | 'leaders'
  | 'stable'
  | 'selective'
  | 'dropout_risk'
  | 'insufficient_data';

export function numericSummary(values: number[]): NumericSummary {
  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) {
    return { avg: null, median: null, min: null, max: null, count: 0 };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    avg: Math.round((sum / sorted.length) * 10) / 10,
    median: Math.round(median * 10) / 10,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

export function engagementSegment(activityPct: number | null): EngagementSegmentId {
  if (activityPct == null || !Number.isFinite(activityPct)) return 'insufficient_data';
  if (activityPct >= ENGAGEMENT_THRESHOLDS.leaders) return 'leaders';
  if (activityPct >= ENGAGEMENT_THRESHOLDS.stable) return 'stable';
  if (activityPct >= ENGAGEMENT_THRESHOLDS.selective) return 'selective';
  return 'dropout_risk';
}

export const SEGMENT_LABELS: Record<EngagementSegmentId, string> = {
  leaders: 'Лидеры вовлечённости',
  stable: 'Стабильно участвуют',
  selective: 'Подключаются выборочно',
  dropout_risk: 'Риск выпадения',
  insufficient_data: 'Недостаточно данных',
};

export type ProfileRecommendation = {
  id: string;
  priority: 'high' | 'medium' | 'watch';
  title: string;
  evidence: string;
};

export function buildProfileRecommendations(input: {
  sampleSize: number;
  riskFatiguePct: number | null;
  energyAvg: number | null;
  energyPrevAvg: number | null;
  touchpointCoveragePct: number | null;
  eveningFillPct: number | null;
  lowestScaleAvg5: number | null;
  lowestScaleLabel: string | null;
  directionLagPp: number | null;
  laggingDirection: string | null;
  highEnergyLowReflection: boolean;
}): ProfileRecommendation[] {
  const t = PROFILE_RULE_THRESHOLDS;
  if (input.sampleSize < t.minSample) return [];

  const out: ProfileRecommendation[] = [];

  if (input.riskFatiguePct != null && input.riskFatiguePct >= t.riskFatiguePct) {
    out.push({
      id: 'risk_fatigue',
      priority: 'high',
      title: 'Проверить нагрузку и восстановительные паузы',
      evidence: `Риск + усталость ${input.riskFatiguePct}% · порог ${t.riskFatiguePct}%`,
    });
  }

  if (
    input.energyAvg != null
    && input.energyPrevAvg != null
    && input.energyPrevAvg - input.energyAvg >= t.energyDrop
  ) {
    out.push({
      id: 'energy_drop',
      priority: 'high',
      title: 'Разобрать причину падения энергии',
      evidence: `Энергия ${input.energyAvg} ← было ${input.energyPrevAvg} · падение ≥ ${t.energyDrop}`,
    });
  }

  if (input.touchpointCoveragePct != null && input.touchpointCoveragePct < t.touchpointCoveragePct) {
    out.push({
      id: 'low_touchpoints',
      priority: 'medium',
      title: 'Напомнить о точках и проверить доступность формы',
      evidence: `Охват точек ${input.touchpointCoveragePct}% · ниже порога ${t.touchpointCoveragePct}%`,
    });
  }

  if (input.eveningFillPct != null && input.eveningFillPct < t.eveningFillPct) {
    out.push({
      id: 'low_evening',
      priority: 'medium',
      title: 'Запустить напоминание перед закрытием анкеты',
      evidence: `Охват evening ${input.eveningFillPct}% · ниже порога ${t.eveningFillPct}%`,
    });
  }

  if (input.lowestScaleAvg5 != null && input.lowestScaleAvg5 < t.lowScaleAvg5 && input.lowestScaleLabel) {
    out.push({
      id: 'low_program_score',
      priority: 'medium',
      title: 'Разобрать этот элемент программы',
      evidence: `«${input.lowestScaleLabel}» · средняя ${input.lowestScaleAvg5}/5 · порог ${t.lowScaleAvg5}`,
    });
  }

  if (
    input.directionLagPp != null
    && input.directionLagPp >= t.directionLagPp
    && input.laggingDirection
  ) {
    out.push({
      id: 'direction_lag',
      priority: 'high',
      title: 'Связаться с куратором направления',
      evidence: `${input.laggingDirection} отстаёт на ${input.directionLagPp} п.п. · порог ${t.directionLagPp}`,
    });
  }

  if (input.highEnergyLowReflection) {
    out.push({
      id: 'high_energy_low_reflection',
      priority: 'watch',
      title: 'Участники включены, но не фиксируют результаты',
      evidence: `Энергия ≥ ${t.highEnergy}, охват рефлексии < ${t.lowReflectionFillPct}%`,
    });
  }

  const order = { high: 0, medium: 1, watch: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function normalizeScaleToPct(avg: number, max: number): number {
  if (!max) return 0;
  return Math.round((avg / max) * 1000) / 10;
}

export type CategoricalTheme = {
  label: string;
  count: number;
  uniqueParticipants: number;
  pct: number | null;
  mode: boolean;
};

/**
 * Категориальная тема: count = упоминания, uniqueParticipants = дедуп по participantId.
 * pct считается только от uniqueParticipants / sampleSize (не от упоминаний).
 */
export function buildCategoricalThemes(
  items: { label: string; count: number; uniqueParticipants: number }[],
  sampleSize: number,
): CategoricalTheme[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.uniqueParticipants - a.uniqueParticipants || b.count - a.count);
  const modeLabel = sorted[0]?.label;
  return sorted.map(it => ({
    label: it.label,
    count: it.count,
    uniqueParticipants: it.uniqueParticipants,
    pct: sampleSize > 0
      ? Math.round((it.uniqueParticipants / sampleSize) * 1000) / 10
      : null,
    mode: it.label === modeLabel,
  }));
}

/** Агрегация тегов/токенов с дедупом участников: Map<label, {count, pids}>. */
export function accumulateThemeMention(
  bag: Map<string, { count: number; pids: Set<number> }>,
  label: string,
  participantId: number,
): void {
  const key = label.trim();
  if (!key) return;
  if (!bag.has(key)) bag.set(key, { count: 0, pids: new Set() });
  const row = bag.get(key)!;
  row.count += 1;
  row.pids.add(participantId);
}

export function themesFromBag(
  bag: Map<string, { count: number; pids: Set<number> }>,
  sampleSize: number,
  limit = 20,
): CategoricalTheme[] {
  const items = [...bag.entries()]
    .map(([label, v]) => ({
      label,
      count: v.count,
      uniqueParticipants: v.pids.size,
    }))
    .sort((a, b) => b.uniqueParticipants - a.uniqueParticipants || b.count - a.count)
    .slice(0, limit);
  return buildCategoricalThemes(items, sampleSize);
}

export type AnswerLengthDayPoint = {
  day: number;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  responses: number;
  uniqueParticipants: number;
};

/** Средняя длина текстовых ответов (символы) по дням 1…maxDay. */
export function buildAnswerLengthByDay(
  items: {
    day: number | null | undefined;
    text: string | null | undefined;
    participantId?: number | null;
  }[],
  maxDay = 8,
): AnswerLengthDayPoint[] {
  const days = Array.from({ length: Math.min(Math.max(maxDay, 1), 8) }, (_, i) => i + 1);
  const byDay = new Map<number, { lengths: number[]; pids: Set<number> }>();
  for (const d of days) byDay.set(d, { lengths: [], pids: new Set() });

  for (const item of items) {
    const day = item.day;
    if (day == null || day < 1 || day > days.length) continue;
    const text = (item.text || '').trim();
    if (!text) continue;
    const bucket = byDay.get(day)!;
    bucket.lengths.push([...text].length);
    if (item.participantId != null) bucket.pids.add(item.participantId);
  }

  return days.map(day => {
    const bucket = byDay.get(day)!;
    const summary = numericSummary(bucket.lengths);
    return {
      day,
      avg: summary.avg,
      median: summary.median,
      min: summary.min,
      max: summary.max,
      responses: summary.count,
      uniqueParticipants: bucket.pids.size,
    };
  });
}
