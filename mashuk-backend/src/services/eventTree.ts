/** Max nesting: root block (1) → nested subblocks (2…MAX). */
export const MAX_EVENT_DEPTH = 4;

export type EventTreeNode<T extends { id: number; parentEventId?: number | null; sortOrder?: number | null }> =
  T & { children: EventTreeNode<T>[] };

/** Build recursive children trees; returns only roots (parentEventId null/undefined). */
export function attachEventChildren<T extends { id: number; parentEventId?: number | null; sortOrder?: number | null }>(
  all: T[],
): EventTreeNode<T>[] {
  const byParent = new Map<number, T[]>();
  for (const e of all) {
    if (e.parentEventId) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e);
      byParent.set(e.parentEventId, list);
    }
  }
  const sortKids = (list: T[]) =>
    [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

  const build = (node: T): EventTreeNode<T> => ({
    ...node,
    children: sortKids(byParent.get(node.id) || []).map(build),
  });

  return sortKids(all.filter(e => !e.parentEventId)).map(build);
}

/** Depth of a node: root = 1. Missing parent treated as root. */
export function eventDepth(
  eventId: number,
  byId: Map<number, { id: number; parentEventId?: number | null }>,
): number {
  let depth = 1;
  let cur = byId.get(eventId);
  const seen = new Set<number>();
  while (cur?.parentEventId) {
    if (seen.has(cur.id)) return MAX_EVENT_DEPTH + 1; // cycle
    seen.add(cur.id);
    depth += 1;
    if (depth > MAX_EVENT_DEPTH + 2) return depth;
    cur = byId.get(cur.parentEventId);
  }
  return depth;
}

/** Depth a new child of parentId would have. */
export function childDepthOfParent(
  parentId: number | null | undefined,
  byId: Map<number, { id: number; parentEventId?: number | null }>,
): number {
  if (!parentId) return 1;
  return eventDepth(parentId, byId) + 1;
}

export function wouldCreateCycle(
  eventId: number,
  newParentId: number,
  byId: Map<number, { id: number; parentEventId?: number | null }>,
): boolean {
  if (eventId === newParentId) return true;
  let cur = byId.get(newParentId);
  const seen = new Set<number>();
  while (cur) {
    if (cur.id === eventId) return true;
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    if (!cur.parentEventId) break;
    cur = byId.get(cur.parentEventId);
  }
  return false;
}

/** All descendant ids (BFS), not including rootId. */
export function collectDescendantIds(
  rootId: number,
  all: { id: number; parentEventId?: number | null }[],
): number[] {
  const byParent = new Map<number, number[]>();
  for (const e of all) {
    if (e.parentEventId) {
      const list = byParent.get(e.parentEventId) || [];
      list.push(e.id);
      byParent.set(e.parentEventId, list);
    }
  }
  const out: number[] = [];
  const queue = [...(byParent.get(rootId) || [])];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const c of byParent.get(id) || []) queue.push(c);
  }
  return out;
}

/** Walk tree depth-first; useful for copy/clone in parent-before-child order. */
export function flattenEventTreeDepthFirst<T extends { children?: T[] }>(nodes: T[]): T[] {
  const out: T[] = [];
  const walk = (list: T[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
