import {
  type EmotionZoneKey,
  EMOTION_ZONE_LABELS,
  emptyZoneDistribution,
  emotionIdToZone,
  incrementZone,
} from '../emotionZones.js';

export function zonesToPercent(dist: Record<EmotionZoneKey, number>): Record<EmotionZoneKey, number> {
  const total = Object.values(dist).reduce((s, n) => s + n, 0);
  const out = emptyZoneDistribution();
  if (total === 0) return out;
  for (const k of Object.keys(out) as EmotionZoneKey[]) {
    out[k] = Math.round((dist[k] / total) * 1000) / 10;
  }
  return out;
}

export function parseCheckinPayload(data: unknown): { emotion?: string; reason?: string; energy?: number } {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as { emotion?: string; reason?: string; energy?: number };
    } catch {
      return { reason: data };
    }
  }
  if (data && typeof data === 'object') {
    return data as { emotion?: string; reason?: string; energy?: number };
  }
  return {};
}

export function accumulateZoneFromAnswer(
  dist: Record<EmotionZoneKey, number>,
  answerData: unknown,
): void {
  const p = parseCheckinPayload(answerData);
  const zone = (p as { emotionZone?: EmotionZoneKey }).emotionZone ?? emotionIdToZone(p.emotion);
  incrementZone(dist, zone);
}

export { EMOTION_ZONE_LABELS, emptyZoneDistribution };

const RU_STOP = new Set(['и', 'в', 'на', 'с', 'по', 'не', 'что', 'как', 'это', 'для', 'от', 'до', 'из', 'у', 'я', 'мы', 'он', 'она', 'они', 'бы', 'же', 'ли', 'то', 'все', 'very']);

export function tokenizeReasons(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !RU_STOP.has(w));
}

export function topReasonTokens(texts: string[], limit = 20): { token: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const t of texts) {
    for (const w of tokenizeReasons(t)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}
