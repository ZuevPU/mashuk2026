import { answerText } from './exports/exportCommon.js';

/** Короткий текст ответа для участника (список, профиль). */
export function participantAnswerSummary(data: unknown, type?: string | null): string {
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data !== 'object') return String(data).trim();

  const o = data as Record<string, unknown>;
  const qType = (type || '').toLowerCase();

  if (qType === 'checkin' || o.emotion != null || o.energy != null) {
    const parts: string[] = [];
    const zone = o.emotionZoneLabel ? String(o.emotionZoneLabel) : '';
    const emo = o.emotion ? String(o.emotion) : '';
    if (zone) parts.push(zone);
    else if (emo) parts.push(emo);
    if (o.energy != null && o.energy !== '') parts.push(`энергия ${o.energy}/10`);
    if (typeof o.reason === 'string' && o.reason.trim()) parts.push(o.reason.trim());
    if (parts.length) return parts.join(' · ');
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

  for (const key of ['mainThesis', 'freeNote', 'understandingChange', 'likedMost', 'goal', 'value', 'label']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  const stringVals = Object.values(o)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim());
  if (stringVals.length === 1) return stringVals[0];
  if (stringVals.length > 1 && stringVals.length <= 4) return stringVals.join(' · ');

  const raw = answerText(data);
  if (raw.startsWith('{')) {
    try {
      return participantAnswerSummary(JSON.parse(raw), type) || '—';
    } catch {
      return raw.slice(0, 200);
    }
  }
  return raw.trim();
}
