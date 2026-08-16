export function parseAdminListPage(
  query: { limit?: unknown; offset?: unknown },
  fallbackLimit = 500,
): { limit: number; offset: number } {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(1000, Math.floor(rawLimit))
    : fallbackLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}
