/** Human-readable answer preview for admin tables (mirrors backend participantAnswerFormat). */

const EVENING_SCALE_KEYS = [
  'direction', 'lessonsImportant', 'openLessons', 'morningHealth',
  'workshops', 'eveningAtmosphere', 'food', 'housing', 'curator',
] as const;

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

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

export function formatAnswerPreview(data: unknown): string {
  if (data == null) return '—';
  if (typeof data === 'string') {
    const t = data.trim();
    if (!t) return '—';
    if (looksLikeJson(t)) {
      try {
        return formatAnswerPreview(JSON.parse(t));
      } catch {
        return t.startsWith('{') ? 'Ответ сохранён' : t;
      }
    }
    return t;
  }
  if (typeof data !== 'object') return String(data);

  const o = data as Record<string, unknown>;

  if (typeof o.choice === 'string' && o.choice.trim()) return o.choice.trim();
  if (Array.isArray(o.choices)) return o.choices.map(String).filter(Boolean).join(', ') || '—';
  if (typeof o.masterChoice === 'string' && o.masterChoice.trim()) {
    const dep = typeof o.dependentAnswer === 'string' && o.dependentAnswer.trim()
      ? ` · ${o.dependentAnswer.trim()}`
      : '';
    return `${o.masterChoice.trim()}${dep}`;
  }
  if (typeof o.text === 'string' && o.text.trim()) {
    return o.eventTitle ? `${o.eventTitle}: ${o.text.trim()}` : o.text.trim();
  }
  if (Array.isArray(o.interests)) return o.interests.map(String).filter(Boolean).join(', ') || '—';
  if (o.emotion != null || o.energy != null) {
    const parts: string[] = [];
    if (o.emotionZoneLabel) parts.push(String(o.emotionZoneLabel));
    else if (o.emotion) parts.push(String(o.emotion));
    if (o.energy != null) parts.push(`энергия ${o.energy}/10`);
    if (typeof o.reason === 'string' && o.reason.trim()) parts.push(o.reason.trim());
    if (parts.length) return parts.join(' · ');
  }

  const hasEvening = EVENING_SCALE_KEYS.some(k => o[k] != null)
    || o.tripYes != null || o.practiceYes != null;
  if (hasEvening) {
    const parts: string[] = [];
    for (const key of ['mainThesis', 'likedMost', 'freeNote'] as const) {
      if (typeof o[key] === 'string' && String(o[key]).trim()) {
        parts.push(String(o[key]).trim());
        break;
      }
    }
    const nums = EVENING_SCALE_KEYS
      .map(k => Number(o[k]))
      .filter(n => Number.isFinite(n));
    if (!parts.length && nums.length) {
      if (nums.every(n => n === nums[0]) && nums.length >= 3) {
        parts.push(`Оценки программ ${nums[0]}/5`);
      } else {
        parts.push(
          EVENING_SCALE_KEYS
            .filter(k => o[k] != null)
            .slice(0, 4)
            .map(k => `${EVENING_SCALE_SHORT[k]} ${o[k]}/5`)
            .join(' · '),
        );
      }
    }
    if (o.tripYes === true) parts.push('Выезд: да');
    if (o.tripYes === false) parts.push('Выезд: нет');
    if (o.practiceYes === true) parts.push('Практика: да');
    if (o.practiceYes === false) parts.push('Практика: нет');
    return parts.filter(Boolean).join(' · ') || 'Итоговая анкета заполнена';
  }

  for (const key of ['mainThesis', 'likedMost', 'freeNote', 'label', 'goal']) {
    if (typeof o[key] === 'string' && String(o[key]).trim()) return String(o[key]).trim();
  }

  const strings = Object.values(o).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (strings.length === 1) return strings[0].trim();
  if (strings.length > 1 && strings.length <= 4) return strings.map(s => s.trim()).join(' · ');

  return 'Ответ сохранён';
}
