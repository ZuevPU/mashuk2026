export const GOAL_PROGRESS_STEPS = [
  {
    score: 1,
    short: 'Там же',
    full: 'Ничего не изменилось: я остался(ась) примерно там же',
    match: /ничего не изменилось|остал\S* примерно там же/,
  },
  {
    score: 2,
    short: 'Понимание',
    full: 'Появилось понимание, куда двигаться',
    match: /появилось понимание/,
  },
  {
    score: 3,
    short: 'Первые шаги',
    full: 'Я сделал(а) первые конкретные шаги',
    match: /первые конкретные шаги/,
  },
  {
    score: 4,
    short: 'Результаты',
    full: 'Я уже продвинулся(ась) и получил(а) первые результаты',
    match: /первые результаты|продвинул/,
  },
  {
    score: 5,
    short: 'Ближе к цели',
    full: 'Я существенно приблизился(ась) к цели / достиг(ла) значимого результата',
    match: /существенно приблизил|значимого результата/,
  },
] as const;

const LABEL_NEEDLE = /движен\S* к своей цели|находишься в движен/;

export type GoalProgressField = {
  key: string;
  label?: string | null;
  type?: string;
  options?: string[];
};

export function isGoalProgressField(field: GoalProgressField): boolean {
  const label = (field.label || '').toLowerCase();
  if (LABEL_NEEDLE.test(label)) return true;
  const blob = [field.label, ...(field.options ?? [])].join(' ').toLowerCase();
  const hits = GOAL_PROGRESS_STEPS.filter(s => s.match.test(blob)).length;
  return hits >= 2;
}

export function parseGoalProgressScore(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n >= 1 && n <= 5 ? n : null;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    const prefixed = t.match(/^([1-5])\b/);
    if (prefixed) return Number(prefixed[1]);
    const num = Number(t);
    if (Number.isFinite(num)) {
      const n = Math.round(num);
      return n >= 1 && n <= 5 ? n : null;
    }
    const lower = t.toLowerCase();
    for (const step of GOAL_PROGRESS_STEPS) {
      if (step.match.test(lower)) return step.score;
    }
  }
  return null;
}

export type GoalProgressDirRow = {
  direction: string;
  answered: number;
  avg: number | null;
  dist: { score: number; count: number; pct: number }[];
};

export type GoalProgressByDirection = {
  key: string;
  label: string;
  answered: number;
  avg: number | null;
  byDirection: GoalProgressDirRow[];
};

function withPct(counts: number[]): { score: number; count: number; pct: number }[] {
  const n = counts.reduce((s, c) => s + c, 0);
  return GOAL_PROGRESS_STEPS.map((s, i) => ({
    score: s.score,
    count: counts[i] ?? 0,
    pct: n ? Math.round(((counts[i] ?? 0) / n) * 1000) / 10 : 0,
  }));
}

export function buildGoalProgressByDirection(
  fields: GoalProgressField[],
  rows: Array<{
    ratings: Record<string, unknown>;
    directionName?: string | null;
    p?: { direction?: string | null };
  }>,
): GoalProgressByDirection | null {
  const matched = fields.filter(isGoalProgressField);
  if (!matched.length) return null;
  const keys = [...new Set(matched.map(f => f.key))];
  const label = matched.find(f => (f.label || '').trim())?.label?.trim()
    || 'Где ты сейчас находишься в движении к своей цели';

  const byDir = new Map<string, { sum: number; n: number; counts: number[] }>();
  let allSum = 0;
  let allN = 0;

  for (const row of rows) {
    let score: number | null = null;
    for (const key of keys) {
      score = parseGoalProgressScore(row.ratings?.[key]);
      if (score != null) break;
    }
    if (score == null) continue;
    const direction = (row.directionName || row.p?.direction || '—').trim() || '—';
    const cur = byDir.get(direction) ?? { sum: 0, n: 0, counts: [0, 0, 0, 0, 0] };
    cur.sum += score;
    cur.n += 1;
    cur.counts[score - 1] += 1;
    byDir.set(direction, cur);
    allSum += score;
    allN += 1;
  }

  if (!allN) {
    return {
      key: keys[0] ?? 'goalProgress',
      label,
      answered: 0,
      avg: null,
      byDirection: [],
    };
  }

  const byDirection = [...byDir.entries()]
    .map(([direction, v]) => ({
      direction,
      answered: v.n,
      avg: Math.round((v.sum / v.n) * 10) / 10,
      dist: withPct(v.counts),
    }))
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || a.direction.localeCompare(b.direction, 'ru'));

  return {
    key: keys[0] ?? 'goalProgress',
    label,
    answered: allN,
    avg: Math.round((allSum / allN) * 10) / 10,
    byDirection,
  };
}
