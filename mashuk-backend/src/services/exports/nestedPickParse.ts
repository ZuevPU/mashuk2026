/**
 * Parsers for nested program picks used in Excel exports:
 * — after_blocks: theme → subtheme → reflection text
 * — evening program_event: theme → subtheme → score 1–10
 */

export type AfterBlocksPick = {
  text: string;
  eventTitle: string | null;
  eventId: number | null;
  parentEventTitle: string | null;
  parentEventId: number | null;
  pathLabel: string | null;
};

export type ProgramEventPick = {
  eventTitle: string | null;
  eventId: number | null;
  parentEventTitle: string | null;
  parentEventId: number | null;
  pathLabel: string | null;
  score: number | null;
};

function asNum(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pathOf(parent: string | null, leaf: string | null): string | null {
  const p = (parent || '').trim();
  const t = (leaf || '').trim();
  if (p && t && p !== t) return `${p} → ${t}`;
  return t || p || null;
}

function extractText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return '';
    try {
      return extractText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const t = extractText(item);
      if (t) return t;
    }
    return '';
  }
  if (typeof data !== 'object') return String(data);
  const o = data as Record<string, unknown>;
  for (const key of ['text', 'reason', 'reflection', 'comment', 'content', 'body', 'message', 'value', 'answer']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickFromListItem(raw: unknown, outerParentTitle: string | null, outerParentId: number | null): AfterBlocksPick | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return {
      text,
      eventTitle: null,
      eventId: null,
      parentEventTitle: outerParentTitle,
      parentEventId: outerParentId,
      pathLabel: pathOf(outerParentTitle, null),
    };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === 'string'
    ? r.text.trim()
    : (typeof r.reflection === 'string'
      ? r.reflection.trim()
      : (typeof r.comment === 'string'
        ? r.comment.trim()
        : (typeof r.value === 'string' ? r.value.trim() : extractText(r))));
  const eventTitle = typeof r.eventTitle === 'string'
    ? r.eventTitle
    : (typeof r.title === 'string'
      ? r.title
      : (typeof r.topicTitle === 'string' ? r.topicTitle : null));
  const parentEventTitle = typeof r.parentEventTitle === 'string'
    ? r.parentEventTitle
    : outerParentTitle;
  const parentEventId = asNum(r.parentEventId) ?? outerParentId;
  if (!text && !eventTitle && !parentEventTitle) return null;
  return {
    text: text || '',
    eventTitle,
    eventId: asNum(r.eventId ?? r.id),
    parentEventTitle,
    parentEventId,
    pathLabel: pathOf(parentEventTitle, eventTitle),
  };
}

export function parseAfterBlocksPicks(data: unknown): AfterBlocksPick[] {
  if (data == null) return [];

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return [];
    try {
      return parseAfterBlocksPicks(JSON.parse(trimmed));
    } catch {
      return [{
        text: trimmed,
        eventTitle: null,
        eventId: null,
        parentEventTitle: null,
        parentEventId: null,
        pathLabel: null,
      }];
    }
  }

  if (Array.isArray(data)) {
    const items = data
      .map(raw => pickFromListItem(raw, null, null))
      .filter((x): x is AfterBlocksPick => Boolean(x));
    return items;
  }

  if (typeof data !== 'object') {
    const text = extractText(data);
    return text
      ? [{
        text,
        eventTitle: null,
        eventId: null,
        parentEventTitle: null,
        parentEventId: null,
        pathLabel: null,
      }]
      : [];
  }

  const o = data as Record<string, unknown>;
  // Некоторые клиенты кладут payload в value / data / answer (не разворачиваем скаляры вроде энергии).
  for (const wrapKey of ['value', 'data', 'answer', 'payload']) {
    const inner = o[wrapKey];
    if (!inner || inner === data) continue;
    if (typeof inner === 'object') {
      const nested = parseAfterBlocksPicks(inner);
      if (nested.length) return nested;
      continue;
    }
    if (typeof inner === 'string') {
      const t = inner.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        const nested = parseAfterBlocksPicks(t);
        if (nested.length) return nested;
      }
    }
  }

  const parentEventTitle = typeof o.parentEventTitle === 'string' ? o.parentEventTitle : null;
  const parentEventId = asNum(o.parentEventId);

  const nestedLists = [o.reflections, o.items, o.picks, o.answers, o.blocks, o.entries]
    .filter(Array.isArray) as unknown[][];
  for (const list of nestedLists) {
    if (!list.length) continue;
    const items = list
      .map(raw => pickFromListItem(raw, parentEventTitle, parentEventId))
      .filter((x): x is AfterBlocksPick => Boolean(x));
    if (items.length) return items;
  }

  const text = extractText(data);
  const eventTitle = typeof o.eventTitle === 'string'
    ? o.eventTitle
    : (typeof o.title === 'string' ? o.title : null);
  const item: AfterBlocksPick = {
    text: text || '',
    eventTitle,
    eventId: asNum(o.eventId),
    parentEventTitle,
    parentEventId,
    pathLabel: pathOf(parentEventTitle, eventTitle),
  };
  if (!item.text && !item.pathLabel) return [];
  return [item];
}

export function isAfterBlocksQuestion(q: {
  questionKind?: string | null;
  reflectionKind?: string | null;
} | null | undefined): boolean {
  const kind = String(q?.questionKind || q?.reflectionKind || '').toLowerCase();
  return kind === 'after_blocks';
}

export function parseProgramEventPicks(raw: unknown): ProgramEventPick[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const o = raw as Record<string, unknown>;

  const toItem = (row: Record<string, unknown>): ProgramEventPick | null => {
    const eventTitle = typeof row.eventTitle === 'string' ? row.eventTitle.trim() : null;
    const parentEventTitle = typeof row.parentEventTitle === 'string' ? row.parentEventTitle.trim() : null;
    const eventId = asNum(row.eventId);
    const parentEventId = asNum(row.parentEventId);
    const scoreRaw = asNum(row.score);
    const score = scoreRaw != null && scoreRaw >= 1 && scoreRaw <= 10 ? Math.floor(scoreRaw) : null;
    if (!eventTitle && !parentEventTitle && eventId == null) return null;
    return {
      eventTitle,
      eventId,
      parentEventTitle,
      parentEventId,
      pathLabel: pathOf(parentEventTitle, eventTitle),
      score,
    };
  };

  if (Array.isArray(o.items) && o.items.length) {
    return o.items
      .map((it) => (it && typeof it === 'object' ? toItem(it as Record<string, unknown>) : null))
      .filter((x): x is ProgramEventPick => Boolean(x));
  }

  const single = toItem(o);
  return single ? [single] : [];
}
