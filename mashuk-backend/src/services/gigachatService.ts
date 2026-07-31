/**
 * Heuristic analytics helpers (no external LLM).
 * Formerly gigachatService — GigaChat removed; product runs on heuristics only.
 */

export async function synthesizeOutcomes(texts: string[]): Promise<string | null> {
  if (texts.length === 0) return null;
  const bullets = texts
    .map(t => t.trim().replace(/\s+/g, ' '))
    .filter(t => t.length > 20)
    .slice(0, 5)
    .map(t => t.slice(0, 160));
  if (!bullets.length) return null;
  return bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
}

/**
 * Смысловая аналитика дня/смены: 4 качественных слоя (не баллы).
 */
export async function synthesizeSemanticLayers(input: {
  depths: Record<string, number>;
  sampleTexts: string[];
  day?: number | null;
}): Promise<{
  layers: { id: string; title: string; count: number; note: string }[];
  summary: string;
  source: 'heuristic';
}> {
  const layers = [
    {
      id: 'fixation',
      title: 'Фиксация события',
      count: input.depths['Фиксация события'] || 0,
      note: 'Описание того, что произошло',
    },
    {
      id: 'insight',
      title: 'Личный вывод',
      count: input.depths['Личный вывод'] || 0,
      note: 'Рефлексия ощущений и мыслей',
    },
    {
      id: 'transfer',
      title: 'Перенос в практику',
      count: input.depths['Перенос в практику'] || 0,
      note: 'Как использовать в своей деятельности',
    },
    {
      id: 'open',
      title: 'Открытые тексты',
      count: input.sampleTexts.length,
      note: 'Объём корпуса для смыслового анализа',
    },
  ];

  const dayLabel = input.day ? `дня ${input.day}` : 'смены';
  const summary = `По ${dayLabel}: фиксация ${layers[0].count}, личные выводы ${layers[1].count}, перенос в практику ${layers[2].count}.`;
  return { layers, summary, source: 'heuristic' };
}

/**
 * Nightly keyword match participants → clubs (batched piggybank load).
 */
export async function clubMatchNightly(): Promise<{ matched: number; usedLlm: boolean }> {
  const { db } = await import('../db/index.js');
  const { participants, clubMatches, piggybank, forumClubs } = await import('../db/schema.js');
  const { isNotNull, eq, inArray } = await import('drizzle-orm');
  const { resolveActiveShiftId } = await import('./shiftService.js');

  const dbClubs = await db.select().from(forumClubs).where(eq(forumClubs.isActive, true));
  const CLUBS = dbClubs.length
    ? dbClubs.map(c => ({
      id: c.id,
      name: c.name,
      keywords: (c.description || c.name).toLowerCase().split(/[\s,.;]+/).filter(w => w.length > 3).slice(0, 12),
    }))
    : [
      { id: 'club_future', name: 'Будущее', keywords: ['будущ', 'образован', 'школ'] },
      { id: 'club_human', name: 'Образование вокруг человека', keywords: ['человек', 'среда', 'отношен'] },
      { id: 'club_unity', name: 'Единство', keywords: ['единств', 'сообществ', 'коман'] },
    ];

  let shiftId: number | null = null;
  try {
    shiftId = await resolveActiveShiftId();
  } catch {
    shiftId = null;
  }

  const list = shiftId != null
    ? await db.select().from(participants).where(eq(participants.shiftId, shiftId))
    : await db.select().from(participants).where(isNotNull(participants.onboardingCompletedAt));
  const onboarded = list.filter(p => p.onboardingCompletedAt);
  const ids = onboarded.map(p => p.id);
  const pigAll = ids.length
    ? await db.select().from(piggybank).where(inArray(piggybank.participantId, ids))
    : [];
  const pigByPid = new Map<number, string[]>();
  for (const e of pigAll) {
    if (!pigByPid.has(e.participantId)) pigByPid.set(e.participantId, []);
    if (e.text) pigByPid.get(e.participantId)!.push(e.text);
  }

  let matched = 0;
  for (const p of onboarded) {
    const interests = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    const pig = (pigByPid.get(p.id) || []).slice(0, 30);
    const corpus = [...interests, ...pig].join(' ').toLowerCase();

    let best = CLUBS[0];
    let bestScore = 0;
    for (const club of CLUBS) {
      let score = 0;
      for (const kw of club.keywords) {
        if (corpus.includes(kw)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = club; }
    }

    const verdict = `Рекомендация: ${best.name} (совпадение по ключевым словам: ${bestScore})`;
    const similarity = Math.min(95, 40 + bestScore * 15);

    await db.delete(clubMatches).where(eq(clubMatches.participantId, p.id));
    await db.insert(clubMatches).values({
      participantId: p.id,
      clubId: best.id,
      similarity,
      verdict,
    });
    matched += 1;
  }

  return { matched, usedLlm: false };
}

/** @deprecated Always false — LLM removed */
export function isGigachatConfigured(): boolean {
  return false;
}

export function tokenVector(text: string, dim = 64): number[] {
  const vec = new Array(dim).fill(0);
  for (const token of text.toLowerCase().split(/[\s,.;:!?«»"()\-—/]+/).filter(w => w.length > 2)) {
    let h = 0;
    for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) % dim;
    vec[h] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}
