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
    try {
      return extractText(JSON.parse(data));
    } catch {
      return data.trim();
    }
  }
  if (typeof data !== 'object' || Array.isArray(data)) return String(data);
  const o = data as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
  if (typeof o.reason === 'string' && o.reason.trim()) return o.reason.trim();
  return '';
}

export function parseAfterBlocksPicks(data: unknown): AfterBlocksPick[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
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
  const parentEventTitle = typeof o.parentEventTitle === 'string' ? o.parentEventTitle : null;
  const parentEventId = asNum(o.parentEventId);

  const toItem = (eventTitle: string | null, eventIdRaw: unknown, text: string): AfterBlocksPick => {
    const eventId = asNum(eventIdRaw);
    return {
      text,
      eventTitle,
      eventId,
      parentEventTitle,
      parentEventId,
      pathLabel: pathOf(parentEventTitle, eventTitle),
    };
  };

  if (Array.isArray(o.reflections) && o.reflections.length > 0) {
    const items = o.reflections.map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const text = typeof r.text === 'string' ? r.text.trim() : '';
      if (!text) return null;
      const eventTitle = typeof r.eventTitle === 'string' ? r.eventTitle : null;
      return toItem(eventTitle, r.eventId, text);
    }).filter((x): x is AfterBlocksPick => Boolean(x));
    if (items.length) return items;
  }

  const text = extractText(data);
  const eventTitle = typeof o.eventTitle === 'string' ? o.eventTitle : null;
  const item = toItem(eventTitle, o.eventId, text);
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
