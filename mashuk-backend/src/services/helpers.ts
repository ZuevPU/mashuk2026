import { eq, and, lte, gte, or, isNull, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { forumSettings } from '../db/schema.js';
import { cache } from './cache.js';

export async function getForumSettings() {
  const cached = cache.get('forumSettings');
  if (cached) return cached;

  const [settings] = await db.select().from(forumSettings).limit(1);
  const result = settings ?? {
    currentDay: 1,
    totalDays: 4,
    recommendationThreshold: 1,
    sectionsVisibility: {},
  };
  
  cache.set('forumSettings', result);
  return result;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function formatTime(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function isPublished(publishTime: Date | null, closeTime: Date | null, now = new Date()): boolean {
  if (publishTime && publishTime > now) return false;
  if (closeTime && closeTime < now) return false;
  return true;
}
