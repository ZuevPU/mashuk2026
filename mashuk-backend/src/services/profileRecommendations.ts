import { createHash } from 'crypto';

export type RecommendationRule = {
  id: string;
  minDay?: number;
  maxDay?: number;
  kind: 'daily' | 'finale';
  when: 'low_answers' | 'low_piggybank' | 'missed_touchpoints' | 'default' | 'finale';
  text: string;
};

export const DEFAULT_RECOMMENDATION_TEMPLATES: RecommendationRule[] = [
  { id: 'd1_welcome', minDay: 1, maxDay: 1, kind: 'daily', when: 'default', text: 'Начни с утренней проверки состояния — это задаёт тон дню на форуме.' },
  { id: 'd_low_answers', minDay: 2, maxDay: 6, kind: 'daily', when: 'low_answers', text: 'Ответь хотя бы на один рефлексивный вопрос сегодня — так откроются точки осмысления.' },
  { id: 'd_low_piggy', minDay: 2, maxDay: 7, kind: 'daily', when: 'low_piggybank', text: 'Зафиксируй одну идею в копилку после блока — пригодится к итогам смены.' },
  { id: 'd_missed_tp', minDay: 3, maxDay: 7, kind: 'daily', when: 'missed_touchpoints', text: 'Есть пропущенные точки осмысления — их ещё можно закрыть сегодня.' },
  { id: 'd_default_mid', minDay: 2, maxDay: 5, kind: 'daily', when: 'default', text: 'Следи за ролью дня и экспериментом — так формируется твой способ действия.' },
  { id: 'd_default_late', minDay: 6, maxDay: 6, kind: 'daily', when: 'default', text: 'На финальной неделе собери «в работу» и подумай о следующем шаге после форума.' },
  { id: 'finale_roles', minDay: 7, maxDay: 8, kind: 'finale', when: 'finale', text: 'Оглянись на роли, которые пробовал: выбери сильную и роль роста — они станут опорой после смены.' },
  { id: 'finale_path', minDay: 7, maxDay: 8, kind: 'finale', when: 'finale', text: 'Заполни Точку Б и скачай итоговый PDF — это твоя карта изменений за смену.' },
];

export function resolveRecommendationTemplates(raw: unknown): RecommendationRule[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_RECOMMENDATION_TEMPLATES];
  return raw.filter((r): r is RecommendationRule =>
    r && typeof r === 'object' && typeof (r as RecommendationRule).id === 'string'
    && typeof (r as RecommendationRule).text === 'string',
  );
}

export function pickProfileRecommendation(input: {
  participantId: number;
  currentDay: number;
  answersCount: number;
  piggyCount: number;
  missedTouchpoints: number;
  recommendationThreshold: number;
  growthRoleName?: string | null;
  templates?: RecommendationRule[];
}): { text: string; kind: 'daily' | 'finale' } {
  const templates = input.templates ?? DEFAULT_RECOMMENDATION_TEMPLATES;
  const day = input.currentDay;
  const isFinale = day >= 7;

  const candidates = templates.filter(t => {
    if (t.minDay != null && day < t.minDay) return false;
    if (t.maxDay != null && day > t.maxDay) return false;
    if (isFinale && t.kind === 'finale') return true;
    if (!isFinale && t.kind === 'daily') return true;
    return false;
  });

  let chosen: RecommendationRule | null = null;
  if (isFinale) {
    chosen = candidates.find(c => c.when === 'finale') ?? candidates[0] ?? null;
  } else if (input.answersCount < input.recommendationThreshold) {
    chosen = candidates.find(c => c.when === 'low_answers') ?? null;
  } else if (input.piggyCount < 2) {
    chosen = candidates.find(c => c.when === 'low_piggybank') ?? null;
  } else if (input.missedTouchpoints > 0) {
    chosen = candidates.find(c => c.when === 'missed_touchpoints') ?? null;
  }
  if (!chosen) chosen = candidates.find(c => c.when === 'default') ?? candidates[0] ?? null;

  const text = chosen?.text ?? 'Продолжай участвовать в программе — каждый день добавляет смысл.';
  const kind = chosen?.kind ?? (isFinale ? 'finale' : 'daily');

  const hash = createHash('sha256')
    .update(`${input.participantId}:${day}:${chosen?.id ?? 'fallback'}`)
    .digest('hex')
    .slice(0, 8);
  void hash;

  if (kind === 'finale' && input.growthRoleName) {
    return { text: `${text} Роль роста: ${input.growthRoleName}.`, kind };
  }
  return { text, kind };
}
