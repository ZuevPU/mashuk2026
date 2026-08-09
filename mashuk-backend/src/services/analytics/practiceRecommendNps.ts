/** NPS по практикам из итоговой анкеты: recommendScore × выбранная практика. */

export type PracticeRecommendNpsRow = {
  practice: string;
  /** Сколько человек поставили оценку этой практике */
  responses: number;
  /** Количество оценок 10…1 */
  scores: Record<string, number>;
  avgScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** Эталонный NPS: %промоутеров − %детракторов (−100…100) */
  nps: number;
};

export type PracticeRecommendNpsResult = {
  available: boolean;
  note: string;
  byPractice: PracticeRecommendNpsRow[];
};

const SCORE_KEYS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'] as const;

function emptyScores(): Record<string, number> {
  return Object.fromEntries(SCORE_KEYS.map(k => [k, 0]));
}

function practiceTitleFromEvent(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as {
    eventTitle?: string;
    parentEventTitle?: string;
    title?: string;
    name?: string;
  };
  const title = String(o.eventTitle || o.title || o.name || '').trim();
  const parent = String(o.parentEventTitle || '').trim();
  if (title && parent && parent !== title) return `${parent} → ${title}`;
  if (title) return title;
  if (parent) return parent;
  return null;
}

function coerceScore(raw: unknown): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const n = Math.round(num);
  if (n < 1 || n > 10) return null;
  return n;
}

type ScoreHit = { practice: string; score: number };

/** Достаёт пары «практика → оценка» из одной сданной анкеты. */
export function extractPracticeScores(ratings: Record<string, unknown> | null | undefined): ScoreHit[] {
  if (!ratings || typeof ratings !== 'object') return [];

  const hits: ScoreHit[] = [];
  const pe = ratings.practiceEvent;

  // Мульти-выбор: items[{ eventTitle, score }]
  if (pe && typeof pe === 'object' && !Array.isArray(pe)) {
    const items = (pe as { items?: unknown }).items;
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const row = it as Record<string, unknown>;
        const practice = practiceTitleFromEvent(row);
        const score = coerceScore(row.score);
        if (practice && score != null) hits.push({ practice, score });
      }
      if (hits.length) return hits;
    }
  }

  const score = coerceScore(ratings.recommendScore);
  if (score == null) return [];

  const fromName = typeof ratings.practiceName === 'string' && ratings.practiceName.trim()
    ? ratings.practiceName.trim()
    : null;
  const fromEvent = practiceTitleFromEvent(pe);
  const practice = fromName || fromEvent;
  if (!practice) return [];

  // Если recommendYes явно «нет» — оценку не учитываем
  const ry = ratings.recommendYes;
  if (ry === false || ry === 'false' || ry === 'no' || ry === 0 || ry === '0') return [];

  return [{ practice, score }];
}

/**
 * Эталонный NPS на шкале 1–10:
 * промоутеры 9–10, нейтралы 7–8, детракторы 1–6.
 * NPS = round((promoters − detractors) / n × 100).
 */
export function buildPracticeRecommendNps(
  ratingRows: Array<Record<string, unknown> | null | undefined>,
): PracticeRecommendNpsResult {
  type Agg = {
    n: number;
    sum: number;
    scores: Record<string, number>;
    promoters: number;
    passives: number;
    detractors: number;
  };
  const byPractice = new Map<string, Agg>();

  for (const ratings of ratingRows) {
    for (const hit of extractPracticeScores(ratings)) {
      const agg = byPractice.get(hit.practice) ?? {
        n: 0,
        sum: 0,
        scores: emptyScores(),
        promoters: 0,
        passives: 0,
        detractors: 0,
      };
      agg.n += 1;
      agg.sum += hit.score;
      agg.scores[String(hit.score)] = (agg.scores[String(hit.score)] || 0) + 1;
      if (hit.score >= 9) agg.promoters += 1;
      else if (hit.score >= 7) agg.passives += 1;
      else agg.detractors += 1;
      byPractice.set(hit.practice, agg);
    }
  }

  const byPracticeRows = [...byPractice.entries()]
    .map(([practice, agg]) => ({
      practice,
      responses: agg.n,
      scores: { ...emptyScores(), ...agg.scores },
      avgScore: agg.n ? Math.round((agg.sum / agg.n) * 10) / 10 : 0,
      promoters: agg.promoters,
      passives: agg.passives,
      detractors: agg.detractors,
      nps: agg.n ? Math.round(((agg.promoters - agg.detractors) / agg.n) * 100) : 0,
    }))
    .sort((a, b) => b.responses - a.responses || a.practice.localeCompare(b.practice, 'ru'));

  return {
    available: byPracticeRows.length > 0,
    note: byPracticeRows.length > 0
      ? 'Эталонный NPS (1–10): промоутеры 9–10, нейтралы 7–8, детракторы 1–6. NPS = %промоутеров − %детракторов. Только практики с оценкой.'
      : 'Таблица появится, когда участники выберут практику и поставят оценку 1–10.',
    byPractice: byPracticeRows,
  };
}

export const PRACTICE_NPS_SCORE_KEYS = SCORE_KEYS;
