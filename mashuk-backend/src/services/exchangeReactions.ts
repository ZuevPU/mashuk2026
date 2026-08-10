export type ExchangeReactionKind = 'like' | 'discuss';

export type ExchangeReactions = {
  likes: number;
  discuss: number;
  likedBy: number[];
  discussBy: number[];
};

export function normalizeExchangeReactions(raw: unknown): ExchangeReactions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ExchangeReactions>;
  const likedBy = Array.isArray(r.likedBy) ? r.likedBy.map(Number).filter(n => Number.isFinite(n)) : [];
  const discussBy = Array.isArray(r.discussBy) ? r.discussBy.map(Number).filter(n => Number.isFinite(n)) : [];
  return {
    likes: likedBy.length,
    discuss: discussBy.length,
    likedBy,
    discussBy,
  };
}

/** Toggle-style: second tap removes the reaction. Mutual exclusivity not required. */
export function toggleExchangeReaction(
  raw: unknown,
  participantId: number,
  kind: ExchangeReactionKind,
): { reactions: ExchangeReactions; removed: boolean } {
  const reactions = normalizeExchangeReactions(raw);
  if (kind === 'like') {
    const idx = reactions.likedBy.indexOf(participantId);
    if (idx >= 0) {
      reactions.likedBy.splice(idx, 1);
      reactions.likes = reactions.likedBy.length;
      return { reactions, removed: true };
    }
    reactions.likedBy.push(participantId);
    reactions.likes = reactions.likedBy.length;
    return { reactions, removed: false };
  }

  const idx = reactions.discussBy.indexOf(participantId);
  if (idx >= 0) {
    reactions.discussBy.splice(idx, 1);
    reactions.discuss = reactions.discussBy.length;
    return { reactions, removed: true };
  }
  reactions.discussBy.push(participantId);
  reactions.discuss = reactions.discussBy.length;
  return { reactions, removed: false };
}
