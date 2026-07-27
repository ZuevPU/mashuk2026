/** ТЗ §5: 5 зон эмоций для аналитики */

export type EmotionZoneKey = 'risk' | 'fatigue' | 'neutral' | 'engagement' | 'lift';

export const EMOTION_ZONE_LABELS: Record<EmotionZoneKey, string> = {
  risk: 'Риск',
  fatigue: 'Усталость',
  neutral: 'Нейтраль',
  engagement: 'Включение',
  lift: 'Подъём',
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
