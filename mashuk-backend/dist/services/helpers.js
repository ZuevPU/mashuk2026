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
export function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
export function formatTime(date) {
    if (!date)
        return '';
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
export function isPublished(publishTime, closeTime, now = new Date()) {
    if (publishTime && publishTime > now)
        return false;
    if (closeTime && closeTime < now)
        return false;
    return true;
}
