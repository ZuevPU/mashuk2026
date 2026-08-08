/** ТЗ §5: 5 зон эмоций для аналитики + 11 эмоций чекина */

export type EmotionZoneKey = 'risk' | 'fatigue' | 'neutral' | 'engagement' | 'lift';

export const EMOTION_ZONE_LABELS: Record<EmotionZoneKey, string> = {
  risk: 'Риск',
  fatigue: 'Усталость',
  neutral: 'Нейтраль',
  engagement: 'Включение',
  lift: 'Подъём',
};

/** Порядок как у участника в форме проверки состояния */
export const CHECKIN_EMOTION_IDS = [
  'joy',
  'calm',
  'interest',
  'inspiration',
  'confidence',
  'tired',
  'anxiety',
  'irritation',
  'sadness',
  'surprise',
  'focus',
] as const;

export type CheckinEmotionId = (typeof CHECKIN_EMOTION_IDS)[number];

export const CHECKIN_EMOTION_LABELS: Record<CheckinEmotionId, string> = {
  joy: 'Радость',
  calm: 'Спокойствие',
  interest: 'Интерес',
  inspiration: 'Вдохновение',
  confidence: 'Уверенность',
  tired: 'Усталость',
  anxiety: 'Тревога',
  irritation: 'Раздражение',
  sadness: 'Грусть',
  surprise: 'Удивление',
  focus: 'Сосредоточенность',
};

const EMOTION_TO_ZONE: Record<string, EmotionZoneKey> = {
  anxiety: 'risk',
  irritation: 'risk',
  sadness: 'risk',
  tired: 'fatigue',
  calm: 'neutral',
  surprise: 'neutral',
  joy: 'lift',
  inspiration: 'lift',
  confidence: 'lift',
  interest: 'engagement',
  focus: 'engagement',
};

export function emotionIdToZone(emotionId: string | undefined | null): EmotionZoneKey | null {
  if (!emotionId) return null;
  return EMOTION_TO_ZONE[emotionId] ?? null;
}

export function emotionIdToLabel(emotionId: string | undefined | null): string {
  if (!emotionId) return '';
  const key = emotionId.trim().toLowerCase();
  if (key in CHECKIN_EMOTION_LABELS) {
    return CHECKIN_EMOTION_LABELS[key as CheckinEmotionId];
  }
  return emotionId.trim();
}

export function emotionZoneToLabel(zone: string | undefined | null): string {
  if (!zone) return '';
  const key = zone.trim().toLowerCase() as EmotionZoneKey;
  return EMOTION_ZONE_LABELS[key] ?? zone.trim();
}

/** Full 11-emotion distribution (zeros included) + any unknown ids at the end. */
export function buildEmotionDistribution(
  counts: Map<string, number>,
  total: number,
): { id: string; label: string; count: number; pct: number }[] {
  const known = new Set<string>(CHECKIN_EMOTION_IDS);
  const rows: { id: string; label: string; count: number; pct: number }[] = CHECKIN_EMOTION_IDS.map(id => {
    const count = counts.get(id) || 0;
    return {
      id: id as string,
      label: CHECKIN_EMOTION_LABELS[id],
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
  for (const [id, count] of counts) {
    if (known.has(id) || !count) continue;
    rows.push({
      id,
      label: emotionIdToLabel(id),
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    });
  }
  return rows;
}

export function emptyZoneDistribution(): Record<EmotionZoneKey, number> {
  return { risk: 0, fatigue: 0, neutral: 0, engagement: 0, lift: 0 };
}

export function incrementZone(
  dist: Record<EmotionZoneKey, number>,
  zone: EmotionZoneKey | null,
): void {
  if (zone) dist[zone] += 1;
}

/** For frontend checkin UI grouping */
export const CHECKIN_EMOTIONS_BY_ZONE: { zone: EmotionZoneKey; items: { id: string; label: string; icon: string }[] }[] = [
  {
    zone: 'risk',
    items: [
      { id: 'anxiety', label: 'Тревога', icon: '😰' },
      { id: 'irritation', label: 'Раздражение', icon: '😤' },
      { id: 'sadness', label: 'Грусть', icon: '😢' },
    ],
  },
  {
    zone: 'fatigue',
    items: [{ id: 'tired', label: 'Усталость', icon: '😴' }],
  },
  {
    zone: 'neutral',
    items: [
      { id: 'calm', label: 'Спокойствие', icon: '😌' },
      { id: 'surprise', label: 'Удивление', icon: '😮' },
    ],
  },
  {
    zone: 'engagement',
    items: [
      { id: 'interest', label: 'Интерес', icon: '🤔' },
      { id: 'focus', label: 'Сосредоточенность', icon: '🎯' },
    ],
  },
  {
    zone: 'lift',
    items: [
      { id: 'joy', label: 'Радость', icon: '😊' },
      { id: 'inspiration', label: 'Вдохновение', icon: '✨' },
      { id: 'confidence', label: 'Уверенность', icon: '💪' },
    ],
  },
];
