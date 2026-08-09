/** Flat program event row used by evening questionnaire admin UI. */
export type ProgramEventRow = {
  id: number;
  title: string;
  dayNumber: number;
  blockType?: string | null;
  parentEventId?: number | null;
  sortOrder?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  hasSubSessions?: boolean | null;
  children?: ProgramEventRow[];
};

export type ProgramPickNode = {
  id: number;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  children: ProgramPickNode[];
};

function isBreak(ev: { blockType?: string | null }): boolean {
  return String(ev.blockType || '').toLowerCase() === 'break';
}

/** Admin /events returns a nested tree — flatten for parentEventId lookups. */
export function flattenProgramEvents(nodes: ProgramEventRow[] | undefined | null): ProgramEventRow[] {
  const out: ProgramEventRow[] = [];
  const walk = (n: ProgramEventRow) => {
    const { children, ...rest } = n;
    out.push(rest as ProgramEventRow);
    if (Array.isArray(children)) {
      for (const ch of children) walk(ch);
    }
  };
  for (const n of nodes || []) walk(n);
  return out;
}

export function buildEveningProgramPickNodes(
  events: ProgramEventRow[],
  day: number,
  linkedIds?: number[] | null,
): ProgramPickNode[] {
  const flat = flattenProgramEvents(events).filter(e => !isBreak(e));
  const byParent = new Map<number, ProgramEventRow[]>();
  for (const e of flat) {
    if (e.parentEventId) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }
  const sort = (arr: ProgramEventRow[]) =>
    [...arr].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

  const build = (e: ProgramEventRow): ProgramPickNode => ({
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    children: sort(byParent.get(e.id) || []).map(build),
  });

  const linked = (linkedIds || []).filter(id => Number.isFinite(id));
  const byId = new Map(flat.map(e => [e.id, e]));
  let roots: ProgramEventRow[];
  if (linked.length) {
    roots = linked.map(id => byId.get(id)).filter((e): e is ProgramEventRow => !!e);
    // Prefer outermost: drop linked nodes whose ancestor is also linked
    const rootSet = new Set(roots.map(r => r.id));
    roots = roots.filter(e => {
      let pid = e.parentEventId ?? null;
      while (pid != null) {
        if (rootSet.has(pid)) return false;
        pid = byId.get(pid)?.parentEventId ?? null;
      }
      return true;
    });
  } else {
    roots = sort(flat.filter(e => !e.parentEventId && e.dayNumber === day));
  }
  return roots.map(build);
}

export function flattenSelectableLeaves(node: ProgramPickNode): ProgramPickNode[] {
  if (!node.children.length) return [node];
  return node.children.flatMap(flattenSelectableLeaves);
}

export function countProgramLeaves(nodes: ProgramPickNode[] | undefined): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((n, ch) => n + (ch.children.length ? countProgramLeaves(ch.children) : 1), 0);
}
