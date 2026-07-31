/**
 * GigaChat client (Wave E). Credentials only from env — never hardcode.
 * Without GIGACHAT_CREDENTIALS methods return null / skip.
 */

const AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

let cachedToken: { value: string; exp: number } | null = null;

function getCredentials(): string | null {
  return process.env.GIGACHAT_CREDENTIALS || null;
}

async function getAccessToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;

  try {
    const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: crypto.randomUUID(),
        Authorization: `Basic ${creds}`,
      },
      body: `scope=${encodeURIComponent(scope)}`,
    });
    if (!res.ok) {
      console.error('GigaChat auth failed', res.status);
      return null;
    }
    const data = await res.json() as { access_token?: string; expires_at?: number };
    if (!data.access_token) return null;
    cachedToken = {
      value: data.access_token,
      exp: data.expires_at ? data.expires_at * 1000 : Date.now() + 25 * 60_000,
    };
    return cachedToken.value;
  } catch (err) {
    console.error('GigaChat auth error:', err);
    return null;
  }
}

export async function gigachatComplete(prompt: string, system?: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'GigaChat',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      console.error('GigaChat complete failed', res.status);
      return null;
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error('GigaChat complete error:', err);
    return null;
  }
}

export async function synthesizeOutcomes(texts: string[]): Promise<string | null> {
  if (texts.length === 0) return null;
  return gigachatComplete(
    `Собери 3–5 коротких пунктов «Что получилось» из рефлексий участника форума:\n\n${texts.slice(0, 20).join('\n---\n')}`,
    'Ты аналитик образовательного форума. Пиши по-русски, кратко, без оценок личности.',
  );
}

/**
 * Смысловая аналитика дня/смены: 4 качественных слоя (не баллы).
 * Без credentials — эвристическая сводка.
 */
export async function synthesizeSemanticLayers(input: {
  depths: Record<string, number>;
  sampleTexts: string[];
  day?: number | null;
}): Promise<{
  layers: { id: string; title: string; count: number; note: string }[];
  summary: string;
  source: 'gigachat' | 'heuristic';
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
  let summary = `По ${dayLabel}: фиксация ${layers[0].count}, личные выводы ${layers[1].count}, перенос в практику ${layers[2].count}.`;
  let source: 'gigachat' | 'heuristic' = 'heuristic';

  if (isGigachatConfigured() && input.sampleTexts.length > 0) {
    const llm = await gigachatComplete(
      `Сделай краткую смысловую сводку форума (${dayLabel}) по 4 слоям глубины рефлексии (фиксация / личный вывод / перенос в практику / новые темы).\nРаспределение: ${JSON.stringify(input.depths)}\nПримеры ответов:\n${input.sampleTexts.slice(0, 12).join('\n---\n')}`,
      'Ты аналитик образовательного форума. Не ставь числовые оценки участникам. Пиши по-русски, 4–6 предложений.',
    );
    if (llm) {
      summary = llm.slice(0, 2000);
      source = 'gigachat';
    }
  }

  return { layers, summary, source };
}

/**
 * Nightly stub: match participants to clubs by interest overlap / LLM if configured.
 * Writes rows into club_matches (replaces previous matches for each participant).
 */
export async function clubMatchNightly(): Promise<{ matched: number; usedLlm: boolean }> {
  const { db } = await import('../db/index.js');
  const { participants, clubMatches, piggybank, forumClubs } = await import('../db/schema.js');
  const { isNotNull, eq } = await import('drizzle-orm');

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

  const list = await db.select().from(participants).where(isNotNull(participants.onboardingCompletedAt));
  let matched = 0;
  const usedLlm = isGigachatConfigured();

  for (const p of list) {
    const interests = Array.isArray(p.interests) ? (p.interests as string[]) : [];
    const pig = await db.select().from(piggybank).where(eq(piggybank.participantId, p.id)).limit(30);
    const corpus = [...interests, ...pig.map(e => e.text)].join(' ').toLowerCase();

    let best = CLUBS[0];
    let bestScore = 0;
    for (const club of CLUBS) {
      let score = 0;
      for (const kw of club.keywords) {
        if (corpus.includes(kw)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = club; }
    }

    let verdict = `Рекомендация: ${best.name} (совпадение по ключевым словам: ${bestScore})`;
    let similarity = Math.min(95, 40 + bestScore * 15);

    if (usedLlm && corpus.length > 20) {
      const llm = await gigachatComplete(
        `Подбери один клуб для участника из списка: ${CLUBS.map(c => c.name).join(', ')}.\nИнтересы и заметки:\n${corpus.slice(0, 800)}\nОтветь одной строкой: название клуба — краткий вердикт.`,
        'Ты наставник образовательного форума. Отвечай по-русски.',
      );
      if (llm) {
        verdict = llm.slice(0, 500);
        similarity = Math.min(99, similarity + 5);
      }
    }

    // Dedup: remove previous matches for this participant before insert
    await db.delete(clubMatches).where(eq(clubMatches.participantId, p.id));
    await db.insert(clubMatches).values({
      participantId: p.id,
      clubId: best.id,
      similarity,
      verdict,
    });
    matched += 1;
  }

  return { matched, usedLlm };
}

export function isGigachatConfigured(): boolean {
  return !!getCredentials();
}

const EMBED_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/embeddings';

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

/** Embeddings via GigaChat API when configured; otherwise token-frequency vector. */
export async function gigachatEmbed(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 4000);
  if (!trimmed) return tokenVector('');

  const token = await getAccessToken();
  if (!token) return tokenVector(trimmed);

  try {
    const res = await fetch(EMBED_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'Embeddings',
        input: trimmed,
      }),
    });
    if (!res.ok) return tokenVector(trimmed);
    const data = await res.json() as { data?: { embedding?: number[] }[] };
    const emb = data.data?.[0]?.embedding;
    if (emb?.length) return emb;
  } catch (err) {
    console.error('GigaChat embed error:', err);
  }
  return tokenVector(trimmed);
}
