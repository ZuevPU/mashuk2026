import { answerText } from './exports/exportCommon.js';
import { EVENING_SCALE_KEYS, EVENING_SCALE_LABELS } from './touchpointTemplates.js';

const EMOTION_LABELS: Record<string, string> = {
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

const EVENING_BOOL_LABELS: Record<string, string> = {
  tripYes: 'Выезд',
  practiceYes: 'Практика',
  recommendYes: 'Рекомендация',
};

const EVENING_SCALE_SHORT: Record<string, string> = {
  direction: 'Направление',
  lessonsImportant: 'Уроки о важном',
  openLessons: 'Открытые уроки',
  morningHealth: 'Утро / здоровье',
  workshops: 'Мастер-классы',
  eveningAtmosphere: 'Вечер',
  food: 'Питание',
  housing: 'Быт',
  curator: 'Куратор',
};

const EVENING_TEXT_KEYS = [
  'mainThesis',
  'likedMost',
  'understandingChange',
  'improveTomorrow',
  'freeNote',
  'experimentResult',
  'practiceName',
] as const;

function looksLikeJsonObjectString(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function isEveningRatingsPayload(o: Record<string, unknown>): boolean {
  if (EVENING_SCALE_KEYS.some(k => o[k] != null)) return true;
  if (o.tripYes != null || o.practiceYes != null || o.recommendYes != null) return true;
  if (EVENING_TEXT_KEYS.some(k => typeof o[k] === 'string' && String(o[k]).trim())) return true;
  return false;
}

function formatYesNo(v: unknown): string | null {
  if (v === true) return 'да';
  if (v === false) return 'нет';
  return null;
}

/** Краткая сводка итоговой анкеты дня для списка «Отвечено». */
export function formatEveningRatingsSummary(data: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const key of EVENING_TEXT_KEYS) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) {
      parts.push(v.trim());
      break;
    }
  }

  const scaleBits: string[] = [];
  const nums: number[] = [];
  for (const key of EVENING_SCALE_KEYS) {
    const raw = data[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    nums.push(n);
    const label = EVENING_SCALE_SHORT[key] || EVENING_SCALE_LABELS[key] || key;
    scaleBits.push(`${label} ${n}/5`);
  }

  if (!parts.length && nums.length) {
    const allSame = nums.every(n => n === nums[0]);
    if (allSame && nums.length >= 3) {
      parts.push(`Оценки программ ${nums[0]}/5`);
    } else {
      parts.push(scaleBits.slice(0, 4).join(' · '));
      if (scaleBits.length > 4) parts[0] += '…';
    }
  }

  for (const [key, label] of Object.entries(EVENING_BOOL_LABELS)) {
    const yn = formatYesNo(data[key]);
    if (yn != null) parts.push(`${label}: ${yn}`);
  }

  if (typeof data.tripScore === 'number') parts.push(`Выезд ${data.tripScore}/5`);
  if (typeof data.recommendScore === 'number') parts.push(`Практика ${data.recommendScore}/10`);

  if (typeof data.tomorrowRoleKey === 'string' && data.tomorrowRoleKey.trim()) {
    parts.push(`Роль завтра: ${data.tomorrowRoleKey.trim()}`);
  }

  return parts.filter(Boolean).join(' · ') || 'Итоговая анкета заполнена';
}

/** Короткий текст ответа для участника (список, профиль). */
export function participantAnswerSummary(data: unknown, type?: string | null): string {
  if (data == null) return '';

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return '';
    if (looksLikeJsonObjectString(trimmed)) {
      try {
        return participantAnswerSummary(JSON.parse(trimmed), type);
      } catch {
        return trimmed.startsWith('{') ? 'Ответ сохранён' : trimmed;
      }
    }
    return trimmed;
  }

  if (typeof data !== 'object') return String(data).trim();

  const o = data as Record<string, unknown>;
  const qType = (type || '').toLowerCase();

  if (qType === 'day_summary' || isEveningRatingsPayload(o)) {
    return formatEveningRatingsSummary(o);
  }

  if (qType === 'checkin' || o.emotion != null || o.energy != null) {
    const parts: string[] = [];
    const zone = o.emotionZoneLabel ? String(o.emotionZoneLabel) : '';
    const emo = o.emotion ? String(o.emotion) : '';
    const emoLabel = EMOTION_LABELS[emo] || emo;
    if (zone) parts.push(zone);
    else if (emoLabel) parts.push(emoLabel);
    if (o.energy != null && o.energy !== '') parts.push(`энергия ${o.energy}/10`);
    if (typeof o.reason === 'string' && o.reason.trim()) parts.push(o.reason.trim());
    if (parts.length) return parts.join(' · ');
  }

  if (o.choice === '__other__' && typeof o.otherText === 'string' && o.otherText.trim()) {
    return o.otherText.trim();
  }
  if (typeof o.choice === 'string' && o.choice.trim()) {
    return o.choice.trim();
  }

  if (Array.isArray(o.likedPracticeIds)) {
    const n = o.likedPracticeIds.length;
    return n ? `Отмечено практик: ${n}` : 'Голос не отдан';
  }

  if (Array.isArray(o.choices)) {
    const items = o.choices.map(String).filter(s => s.trim());
    if (items.length) return items.join(', ');
  }

  if (typeof o.masterChoice === 'string' && o.masterChoice.trim()) {
    const dep = typeof o.dependentAnswer === 'string' && o.dependentAnswer.trim()
      ? ` · ${o.dependentAnswer.trim()}`
      : '';
    return `${o.masterChoice.trim()}${dep}`;
  }

  if (typeof o.text === 'string' && o.text.trim()) {
    const prefix = o.eventTitle ? `${o.eventTitle}: ` : '';
    return (prefix + o.text.trim()).trim();
  }

  if (Array.isArray(o.answers)) {
    return o.answers.map(String).filter(s => s.trim()).join(' · ');
  }

  if (Array.isArray(o.interests)) {
    const items = o.interests.map(String).filter(s => s.trim());
    if (items.length) return items.join(', ');
  }

  if (Array.isArray(o.goalAnswers)) {
    const items = o.goalAnswers.map(String).filter(s => s.trim());
    if (items.length) return items.slice(0, 2).join(' · ') + (items.length > 2 ? '…' : '');
  }

  for (const key of ['mainThesis', 'freeNote', 'understandingChange', 'likedMost', 'goal', 'value', 'label']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  const stringVals = Object.values(o)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim());
  if (stringVals.length === 1) return stringVals[0];
  if (stringVals.length > 1 && stringVals.length <= 4) return stringVals.join(' · ');

  // Never leak raw JSON into participant UI
  const raw = answerText(data);
  if (looksLikeJsonObjectString(raw)) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (isEveningRatingsPayload(parsed as Record<string, unknown>)) {
          return formatEveningRatingsSummary(parsed as Record<string, unknown>);
        }
      }
    } catch {
      /* ignore */
    }
    return 'Ответ сохранён';
  }
  return raw.trim();
}
