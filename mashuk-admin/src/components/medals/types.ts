export type MedalLevel = 'bronze' | 'silver' | 'gold';
export type MedalAwardType = 'manual' | 'auto';
export type MedalVisibility = 'open' | 'hidden';

export type Medal = {
  id: number;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  category?: string | null;
  level?: MedalLevel | string | null;
  awardType?: MedalAwardType | string | null;
  visibility?: MedalVisibility | string | null;
  conditionRule?: string | null;
  isActive?: boolean | null;
  awardedCount?: number;
};

export type MedalDraft = {
  name: string;
  descriptionHtml: string;
  iconUrl: string;
  category: string;
  level: MedalLevel;
  awardType: MedalAwardType;
  visibility: MedalVisibility;
  conditionRule: string;
  ruleMetric: string;
  ruleValue: number;
  isActive: boolean;
};

export type RuleMetricOption = {
  key: string;
  label: string;
  example: number;
};

export const MEDAL_CATEGORIES = [
  { value: 'tasks', label: 'Задания' },
  { value: 'piggybank', label: 'Копилка' },
  { value: 'reflection', label: 'Рефлексия' },
  { value: 'points', label: 'Баллы' },
  { value: 'program', label: 'Программа' },
  { value: 'exchange', label: 'Обмен' },
] as const;

export function parseRuleParts(rule: string | null | undefined): { metric: string; value: number } {
  const m = (rule || '').trim().match(/^(\w+)\s*>=\s*(\d+)$/);
  if (!m) return { metric: 'tasks_completed', value: 1 };
  return { metric: m[1], value: Number(m[2]) };
}

export function emptyMedalDraft(): MedalDraft {
  return {
    name: '',
    descriptionHtml: '',
    iconUrl: '',
    category: 'tasks',
    level: 'bronze',
    awardType: 'manual',
    visibility: 'open',
    conditionRule: '',
    ruleMetric: 'tasks_completed',
    ruleValue: 1,
    isActive: true,
  };
}

export function draftFromMedal(m: Medal, defaultMetric: string): MedalDraft {
  const parts = parseRuleParts(m.conditionRule);
  return {
    name: m.name,
    descriptionHtml: m.description || '',
    iconUrl: m.iconUrl || '',
    category: m.category || 'tasks',
    level: (m.level as MedalLevel) || 'bronze',
    awardType: (m.awardType as MedalAwardType) || 'manual',
    visibility: (m.visibility as MedalVisibility) || 'open',
    conditionRule: m.conditionRule || '',
    ruleMetric: parts.metric || defaultMetric,
    ruleValue: parts.value,
    isActive: m.isActive !== false,
  };
}

export function bodyFromDraft(d: MedalDraft): Record<string, unknown> {
  const conditionRule = d.awardType === 'auto' ? `${d.ruleMetric}>=${d.ruleValue}` : null;
  return {
    name: d.name.trim(),
    description: d.descriptionHtml,
    iconUrl: d.iconUrl || null,
    category: d.category,
    level: d.level,
    awardType: d.awardType,
    visibility: d.visibility,
    conditionRule,
    isActive: d.isActive,
  };
}

export type ListTab = 'active' | 'drafts';

export function buildMedalsQuery(params: {
  tab: ListTab;
  category: string;
  level: string;
  awardType: string;
  visibility: string;
}): string {
  const sp = new URLSearchParams();
  if (params.tab === 'active') sp.set('status', 'active');
  if (params.tab === 'drafts') sp.set('status', 'draft');
  if (params.category) sp.set('category', params.category);
  if (params.level) sp.set('level', params.level);
  if (params.awardType) sp.set('awardType', params.awardType);
  if (params.visibility) sp.set('visibility', params.visibility);
  return sp.toString();
}
