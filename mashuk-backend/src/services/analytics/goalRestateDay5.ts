import { isFormalAnswer } from './dayResultsMetrics.js';
import { tokenizeForTagCloud } from '../wordCloudTokens.js';

const LABEL_NEEDLE = /цель изменилась|уточнилась|сформулировал/;
const MAX_COMMENTS = 1500;
const MIN_TEXT_LEN = 8;

export type GoalRestateField = {
  key: string;
  label?: string | null;
  type?: string;
};

export function isGoalRestateField(field: GoalRestateField): boolean {
  const label = (field.label || '').toLowerCase();
  if (!label) return false;
  if (/сформулировал/.test(label) && (/цель/.test(label) || /уточнил/.test(label))) return true;
  return LABEL_NEEDLE.test(label) && /цель/.test(label);
}

function topCounts(freq: Map<string, number>, limit: number, min = 1): { token: string; count: number }[] {
  return [...freq.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}

function collectThemes(texts: string[], tokenLimit = 24, phraseLimit = 16) {
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  for (const text of texts) {
    const tokens = tokenizeForTagCloud(text);
    for (const w of tokens) uni.set(w, (uni.get(w) || 0) + 1);
    for (let i = 0; i < tokens.length - 1; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      bi.set(phrase, (bi.get(phrase) || 0) + 1);
    }
  }
  return {
    themes: topCounts(uni, tokenLimit),
    phrases: topCounts(bi, phraseLimit, 2),
  };
}

export type GoalRestateComment = {
  text: string;
  direction: string;
  group: string;
};

export type GoalRestateDay5 = {
  key: string;
  label: string;
  day: 5;
  answered: number;
  skipped: number;
  summary: string;
  themes: { token: string; count: number }[];
  phrases: { token: string; count: number }[];
  byDirection: {
    direction: string;
    answered: number;
    themes: { token: string; count: number }[];
  }[];
  comments: GoalRestateComment[];
};

export function buildGoalRestateDay5(
  fields: GoalRestateField[],
  rows: Array<{
    ratings: Record<string, unknown>;
    dayNumber?: number;
    directionName?: string | null;
    p?: { direction?: string | null; groupName?: string | null };
  }>,
): GoalRestateDay5 | null {
  const matched = fields.filter(isGoalRestateField);
  if (!matched.length) return null;
  const keys = [...new Set(matched.map(f => f.key))];
  const label = matched.find(f => (f.label || '').trim())?.label?.trim()
    || 'Если цель изменилась / уточнилась, как бы ты сформулировал(а) её сейчас?';

  const dayRows = rows.filter(r => r.dayNumber == null || r.dayNumber === 5);
  const comments: GoalRestateComment[] = [];
  let skipped = 0;
  const texts: string[] = [];
  const byDirTexts = new Map<string, string[]>();

  for (const row of dayRows) {
    let text = '';
    for (const key of keys) {
      const raw = row.ratings?.[key];
      if (typeof raw === 'string' && raw.trim()) {
        text = raw.trim();
        break;
      }
    }
    if (!text) {
      skipped += 1;
      continue;
    }
    if (text.length < MIN_TEXT_LEN || isFormalAnswer(text)) {
      skipped += 1;
      continue;
    }
    const direction = (row.directionName || row.p?.direction || '—').trim() || '—';
    const group = (row.p?.groupName || '').trim();
    comments.push({
      text: text.length > 1200 ? `${text.slice(0, 1198).trim()}…` : text,
      direction,
      group,
    });
    texts.push(text);
    const bucket = byDirTexts.get(direction) ?? [];
    bucket.push(text);
    byDirTexts.set(direction, bucket);
  }

  comments.sort((a, b) => b.text.length - a.text.length || a.direction.localeCompare(b.direction, 'ru'));
  const clipped = comments.slice(0, MAX_COMMENTS);
  const { themes, phrases } = collectThemes(texts);
  const byDirection = [...byDirTexts.entries()]
    .map(([direction, dirTexts]) => ({
      direction,
      answered: dirTexts.length,
      themes: collectThemes(dirTexts, 6, 4).themes,
    }))
    .sort((a, b) => b.answered - a.answered || a.direction.localeCompare(b.direction, 'ru'));

  const top = themes.slice(0, 5).map(t => t.token).join(', ') || '—';
  const summary = clipped.length
    ? `День 5 · ${clipped.length} формулировок цели. Частые темы: ${top}.`
    : 'День 5 · развёрнутых формулировок цели пока нет.';

  return {
    key: keys[0] ?? 'goalRestate',
    label,
    day: 5,
    answered: clipped.length,
    skipped,
    summary,
    themes,
    phrases,
    byDirection,
    comments: clipped,
  };
}
