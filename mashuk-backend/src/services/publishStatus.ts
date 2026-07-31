/** Unified publish status for admin content (draft vs published). */

export type PublishStatus = 'draft' | 'published' | 'archived';

export function isPublishedStatus(status: string | null | undefined): boolean {
  return !status || status === 'published';
}

/** Prefer published status for analytics inclusion. */
export function materialIncludedInAnalytics(m: {
  status?: string | null;
}): boolean {
  return isPublishedStatus(m.status);
}

export function materialCountsForAnalytics<T extends { status?: string | null }>(rows: T[]) {
  const published = rows.filter(r => materialIncludedInAnalytics(r));
  return {
    published,
    publishedCount: published.length,
    excludedCount: rows.length - published.length,
  };
}
