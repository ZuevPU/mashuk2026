import type { EveningQuestionnaireConfig } from './eveningQuestionnaireConfig.js';
import { resolveEveningConfigForDay } from './eveningQuestionnaireConfig.js';
import type { forumSettings, participantDayState } from '../db/schema.js';

/** Preferred UX labels when the evening config / question title is missing. */
export const EXPERIMENT_REFLECTION_CANONICAL = [
  'Как включился(ась) в эксперимент',
  'Что понял(а) о своём способе действия',
] as const;

export type ExperimentReflectionItem = {
  key: string;
  question: string;
  answer: string;
};

export type LastExperimentReflection = {
  dayNumber: number | null;
  items: ExperimentReflectionItem[];
};

const ENGAGEMENT_KEYS = new Set(['experimentResult']);
const INSIGHT_KEYS = new Set(['actionStyleInsight', 'wayOfActing', 'roleInsight']);

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isEngagementLabel(text: string): boolean {
  const t = norm(text);
  return /включился|включилась|эксперимент/.test(t)
    && !/способ\w*\s+действ|понял/.test(t);
}

function isInsightLabel(text: string): boolean {
  const t = norm(text);
  return /способ\w*\s+действ|о\s+сво(ём|ем)\s+способ|ролев\w*\s+эксперимент/.test(t)
    || (/понял/.test(t) && /роль|действ|эксперимент/.test(t));
}

function isExperimentRelatedLabel(key: string, label: string): boolean {
  if (ENGAGEMENT_KEYS.has(key) || INSIGHT_KEYS.has(key)) return true;
  if (key === 'experimentResult') return true;
  const hay = `${key} ${label}`;
  return isEngagementLabel(hay) || isInsightLabel(hay)
    || /эксперимент|ролев/.test(norm(hay));
}

/** Day-summary open fields that must NOT appear as «experiment reflection». */
function isGenericDayField(key: string): boolean {
  return [
    'mainThesis',
    'likedMost',
    'improveTomorrow',
    'freeNote',
    'note',
    'understandingChange',
    'practiceName',
  ].includes(key);
}

function labelMapFromConfig(config: EveningQuestionnaireConfig): Map<string, string> {
  const map = new Map<string, string>();
  for (const step of config.steps) {
    for (const field of step.fields) {
      if (field.label?.trim()) map.set(field.key, field.label.trim());
    }
  }
  return map;
}

function pickQuestionLabel(key: string, configLabel: string | undefined): string {
  if (configLabel?.trim()) return configLabel.trim();
  if (ENGAGEMENT_KEYS.has(key) || key === 'experimentResult') {
    return EXPERIMENT_REFLECTION_CANONICAL[0];
  }
  if (INSIGHT_KEYS.has(key) || isInsightLabel(key)) {
    return EXPERIMENT_REFLECTION_CANONICAL[1];
  }
  return key;
}

function classifySlot(key: string, question: string): 'engagement' | 'insight' | 'other' {
  if (ENGAGEMENT_KEYS.has(key) || key === 'experimentResult') return 'engagement';
  if (INSIGHT_KEYS.has(key)) return 'insight';
  if (isInsightLabel(question) || isInsightLabel(key)) return 'insight';
  if (isEngagementLabel(question) || isEngagementLabel(key)) return 'engagement';
  return 'other';
}

type DayRow = typeof participantDayState.$inferSelect;

function ratingsFromDay(s: DayRow): Record<string, unknown> {
  const ratings = (s.eveningRatings && typeof s.eveningRatings === 'object')
    ? { ...(s.eveningRatings as Record<string, unknown>) }
    : {};
  const draft = s.eveningDraft as { form?: Record<string, unknown> } | null;
  if (draft?.form && typeof draft.form === 'object') {
    for (const [k, v] of Object.entries(draft.form)) {
      if (ratings[k] == null && v != null) ratings[k] = v;
    }
  }
  return ratings;
}

function itemsFromRatings(
  ratings: Record<string, unknown>,
  labels: Map<string, string>,
): ExperimentReflectionItem[] {
  const items: ExperimentReflectionItem[] = [];
  const seen = new Set<string>();

  const keys = [
    ...ENGAGEMENT_KEYS,
    ...INSIGHT_KEYS,
    ...Object.keys(ratings),
  ];

  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = ratings[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const configLabel = labels.get(key);
    if (isGenericDayField(key) && !isExperimentRelatedLabel(key, configLabel || '')) continue;
    if (!isExperimentRelatedLabel(key, configLabel || key)) continue;
    const answer = raw.trim().slice(0, 500);
    if (answer.length < 2) continue;
    items.push({
      key,
      question: pickQuestionLabel(key, configLabel),
      answer,
    });
  }
  return items;
}

function preferTwoSlots(items: ExperimentReflectionItem[]): ExperimentReflectionItem[] {
  if (items.length <= 2) return items;
  const engagement = items.find(i => classifySlot(i.key, i.question) === 'engagement');
  const insight = items.find(i => classifySlot(i.key, i.question) === 'insight' && i !== engagement);
  const picked = [engagement, insight].filter(Boolean) as ExperimentReflectionItem[];
  if (picked.length >= 1) {
    const rest = items.filter(i => !picked.includes(i));
    return [...picked, ...rest].slice(0, 2);
  }
  return items.slice(0, 2);
}

export type AnswerReflectionSeed = {
  title: string;
  preview: string;
  block?: string | null;
  answeredAt?: Date | null;
};

/**
 * Build labeled Q↔A for the latest role-experiment reflection.
 * Uses evening-config field labels when present; falls back to canonical UX titles.
 * Does not pull generic day notes (likedMost / freeNote / «Ценю каждого…»).
 */
export function buildLastExperimentReflection(input: {
  dayStates: DayRow[];
  settings: typeof forumSettings.$inferSelect | null;
  answerReflections?: AnswerReflectionSeed[];
}): LastExperimentReflection | null {
  const days = [...input.dayStates].sort((a, b) => b.dayNumber - a.dayNumber);

  for (const s of days) {
    if (s.dayNumber < 1 || s.dayNumber > 7) continue;
    const ratings = ratingsFromDay(s);
    const config = resolveEveningConfigForDay(input.settings, s.dayNumber);
    const labels = labelMapFromConfig(config);
    const fromEvening = itemsFromRatings(ratings, labels);
    if (fromEvening.length > 0) {
      return {
        dayNumber: s.dayNumber,
        items: preferTwoSlots(fromEvening),
      };
    }
  }

  // Fallback: open questions whose titles clearly ask about the experiment / action style
  const seeds = (input.answerReflections || [])
    .filter(r => {
      const title = r.title || '';
      if (!isExperimentRelatedLabel('q', title)) return false;
      // Keep day-summary blobs out unless the title itself is experiment-specific
      const block = (r.block || '').toLowerCase();
      if (block.includes('итог') && !isExperimentRelatedLabel('q', title)) return false;
      return (r.preview || '').trim().length >= 2;
    })
    .sort((a, b) =>
      new Date(b.answeredAt ?? 0).getTime() - new Date(a.answeredAt ?? 0).getTime());

  if (seeds.length === 0) return null;

  const items: ExperimentReflectionItem[] = [];
  const used = new Set<string>();
  for (const seed of seeds) {
    const slot = classifySlot('q', seed.title);
    const key = slot === 'insight' ? 'insight' : slot === 'engagement' ? 'engagement' : `q_${items.length}`;
    if (used.has(key) && (key === 'engagement' || key === 'insight')) continue;
    used.add(key);
    items.push({
      key,
      question: seed.title.trim() || EXPERIMENT_REFLECTION_CANONICAL[items.length] || 'Вопрос',
      answer: seed.preview.trim().slice(0, 500),
    });
    if (items.length >= 2) break;
  }

  return items.length ? { dayNumber: null, items } : null;
}
