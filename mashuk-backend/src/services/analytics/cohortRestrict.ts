/** Hub slice answers must follow the cohort, not a name heuristic. */
export function restrictToCohort<T>(
  rows: T[],
  cohortIds: Iterable<number>,
  idOf: (row: T) => number,
): T[] {
  const allowed = cohortIds instanceof Set ? cohortIds : new Set(cohortIds);
  if (!allowed.size) return [];
  return rows.filter(row => allowed.has(idOf(row)));
}

export function filterAnswersByCohort<T extends { participantId: number }>(
  rows: T[],
  ids: Set<number>,
): T[] {
  return restrictToCohort(rows, ids, r => r.participantId);
}
