import { randomUUID } from 'crypto';

export type PracticeSource = 'participant' | 'manual';

export type PracticeItem = {
  id: string;
  title: string;
  description: string;
  source: PracticeSource;
  participantId?: number | null;
  participantName: string;
  direction: string;
  resultPlace?: string | null;
  resultTime?: string | null;
  sortOrder: number;
};

export type PracticesConfig = {
  preamble: string;
  likesPerParticipant: number;
  resultsPublished: boolean;
  practices: PracticeItem[];
};

export const DEFAULT_PRACTICES_CONFIG: PracticesConfig = {
  preamble: '',
  likesPerParticipant: 3,
  resultsPublished: false,
  practices: [],
};

export function newPracticeId(): string {
  return randomUUID();
}

export function normalizePracticesConfig(raw: unknown): PracticesConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRACTICES_CONFIG, practices: [] };
  const o = raw as Record<string, unknown>;
  const likes = Number(o.likesPerParticipant);
  const practicesRaw = Array.isArray(o.practices) ? o.practices : [];
  const practices: PracticeItem[] = practicesRaw.map((p, i) => {
    const row = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const source: PracticeSource = row.source === 'manual' ? 'manual' : 'participant';
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newPracticeId();
    return {
      id,
      title: String(row.title ?? '').trim(),
      description: String(row.description ?? '').trim(),
      source,
      participantId: row.participantId != null && Number.isFinite(Number(row.participantId))
        ? Number(row.participantId)
        : null,
      participantName: String(row.participantName ?? '').trim(),
      direction: String(row.direction ?? '').trim(),
      resultPlace: row.resultPlace != null ? String(row.resultPlace).trim() || null : null,
      resultTime: row.resultTime != null ? String(row.resultTime).trim() || null : null,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : i,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    preamble: String(o.preamble ?? '').trim(),
    likesPerParticipant: Number.isFinite(likes) && likes > 0 ? Math.min(50, Math.floor(likes)) : 3,
    resultsPublished: o.resultsPublished === true,
    practices,
  };
}

/** Public payload for participants (hide nothing essential; results fields only if published). */
export function practicesConfigForParticipant(config: PracticesConfig): {
  preamble: string;
  likesPerParticipant: number;
  resultsPublished: boolean;
  practices: Array<{
    id: string;
    title: string;
    description: string;
    participantName: string;
    direction: string;
    resultPlace?: string | null;
    resultTime?: string | null;
  }>;
} {
  return {
    preamble: config.preamble,
    likesPerParticipant: config.likesPerParticipant,
    resultsPublished: config.resultsPublished,
    practices: config.practices.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      participantName: p.participantName,
      direction: p.direction,
      ...(config.resultsPublished
        ? { resultPlace: p.resultPlace ?? null, resultTime: p.resultTime ?? null }
        : {}),
    })),
  };
}

export function parseLikedPracticeIds(answerData: unknown): string[] {
  if (!answerData || typeof answerData !== 'object') return [];
  const ids = (answerData as { likedPracticeIds?: unknown }).likedPracticeIds;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(x => String(x)).filter(Boolean))];
}

export function validatePracticesVote(
  answerData: unknown,
  config: PracticesConfig,
): { ok: true; likedPracticeIds: string[] } | { ok: false; error: string } {
  const liked = parseLikedPracticeIds(answerData);
  const allowed = new Set(config.practices.map(p => p.id));
  if (liked.some(id => !allowed.has(id))) {
    return { ok: false, error: 'Выбранная практика недоступна' };
  }
  if (liked.length > config.likesPerParticipant) {
    return { ok: false, error: `Можно отметить не больше ${config.likesPerParticipant} практик` };
  }
  return { ok: true, likedPracticeIds: liked };
}

export function aggregatePracticeLikes(
  config: PracticesConfig,
  answerRows: Array<{ answerData: unknown }>,
): Array<PracticeItem & { likes: number }> {
  const counts = new Map<string, number>();
  for (const p of config.practices) counts.set(p.id, 0);
  for (const row of answerRows) {
    for (const id of parseLikedPracticeIds(row.answerData)) {
      if (counts.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return config.practices.map(p => ({ ...p, likes: counts.get(p.id) || 0 }));
}
