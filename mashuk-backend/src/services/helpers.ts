import { eq, and, lte, gte, or, isNull, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { forumSettings } from '../db/schema.js';

export async function getForumSettings() {
  const [settings] = await db.select().from(forumSettings).limit(1);
  return settings ?? {
    currentDay: 1,
    totalDays: 4,
    recommendationThreshold: 1,
    sectionsVisibility: {},
  };
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
