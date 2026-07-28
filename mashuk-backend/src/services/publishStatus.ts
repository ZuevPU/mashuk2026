/** Unified publish status for admin content (draft vs published). */

export type PublishStatus = 'draft' | 'published' | 'archived';

export function isPublishedStatus(status: string | null | undefined): boolean {
  return !status || status === 'published';
}

export function materialCountsForAnalytics<T extends { status?: string | null }>(rows: T[]) {
  const published = rows.filter(r => isPublishedStatus(r.status));
  return {
    published,
    publishedCount: published.length,
    excludedCount: rows.length - published.length,
  };
}
