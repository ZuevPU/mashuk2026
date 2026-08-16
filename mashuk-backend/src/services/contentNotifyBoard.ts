import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { getMoscowParts } from './timePhase.js';
import { db } from '../db/index.js';
import {
  adminPushNotifications,
  events,
  pushLog,
  questions,
  tasks,
} from '../db/schema.js';
import { questionMatchesDay } from './questionAdminHelpers.js';
import { isTaskOnForumDay } from './taskAdminHelpers.js';
import { pushCopy } from './pushCopy.js';
import { touchpointOpenTrigger } from './questionAutoNotify.js';

export type ContentNotifyKind = 'question' | 'task' | 'event' | 'evening' | 'forum_wrap';

export type ContentNotifyItem = {
  kind: ContentNotifyKind;
  id: number;
  title: string;
  subtitle: string;
  status: string;
  canSend: boolean;
  cannotSendReason: string | null;
  defaultText: string;
  appLinkHash: string;
  lastSentAt: string | null;
  lastTrigger: string | null;
  scheduledAt: string | null;
  scheduledId: number | null;
};

export function questionOpenTriggers(questionId: number): string[] {
  return [
    touchpointOpenTrigger(questionId),
    `question_publish_${questionId}`,
    `question_notify_${questionId}`,
  ];
}

export function taskNotifyTriggers(taskId: number): string[] {
  return [`task_publish_${taskId}`, `task_notify_${taskId}`];
}

export function eventNotifyTriggers(eventId: number): string[] {
  return [`event_notify_${eventId}`, `program_event_${eventId}`];
}

export function eveningNotifyTrigger(day: number): string {
  return `evening_questionnaire_notify_d${day}`;
}

export function eveningNotifyTriggers(day: number): string[] {
  return [eveningNotifyTrigger(day), 'evening_questionnaire_notify'];
}

export function forumWrapNotifyTriggers(): string[] {
  return ['forum_wrap_questionnaire_notify'];
}

export function contentItemKindLabel(kind: string | null | undefined): string {
  const k = String(kind || '').toLowerCase();
  if (k === 'state_check') return 'Проверка состояния';
  if (k === 'after_blocks' || k === 'after_event') return 'После блоков';
  if (k === 'extra') return 'Дополнительные';
  if (k === 'evening_summary' || k === 'day_summary') return 'Итоги дня';
  if (k === 'point_a') return 'Точка А';
  if (k === 'point_b') return 'Точка Б';
  if (k === 'diagnostic') return 'Диагностика';
  if (k === 'input') return 'Вводный';
  return 'Вопрос';
}

export function questionStatusLabel(q: {
  status?: string | null;
  isHidden?: boolean | null;
}): string {
  if (q.isHidden) return 'Скрыт';
  if (q.status === 'published') return 'Опубликован';
  if (q.status === 'archived') return 'Архив';
  return 'Черновик';
}

export function defaultTextForContent(kind: ContentNotifyKind, title: string, day: number): string {
  if (kind === 'task') return pushCopy.taskPublished(title);
  if (kind === 'event') return pushCopy.eventSoon(title);
  if (kind === 'evening') return pushCopy.eveningQuestionnaireOpen(day);
  if (kind === 'forum_wrap') {
    return 'Итоговая анкета форума уже доступна. Откройте главную и заполните — займёт несколько минут.';
  }
  return pushCopy.touchpointOpen(title);
}

export function appLinkForContent(kind: ContentNotifyKind, id: number): string {
  if (kind === 'question') return `#/questions?q=${id}`;
  if (kind === 'task') return '#/tasks';
  if (kind === 'event') return `#/program?event=${id}`;
  if (kind === 'forum_wrap') return '#/?forumWrap=1';
  return '#/?evening=1';
}

export function triggersForContent(kind: ContentNotifyKind, id: number, day: number): string[] {
  if (kind === 'question') return questionOpenTriggers(id);
  if (kind === 'task') return taskNotifyTriggers(id);
  if (kind === 'event') return eventNotifyTriggers(id);
  if (kind === 'forum_wrap') return forumWrapNotifyTriggers();
  return eveningNotifyTriggers(day);
}

export function sendTriggerForContent(kind: ContentNotifyKind, id: number, day: number): string {
  if (kind === 'question') return `question_notify_${id}`;
  if (kind === 'task') return `task_notify_${id}`;
  if (kind === 'event') return `event_notify_${id}`;
  if (kind === 'forum_wrap') return 'forum_wrap_questionnaire_notify';
  return eveningNotifyTrigger(day);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function lastPushForTriggers(triggers: string[]): Promise<{
  sentAt: Date;
  triggerType: string;
} | null> {
  if (!triggers.length) return null;
  const [row] = await db.select({
    sentAt: pushLog.sentAt,
    triggerType: pushLog.triggerType,
  }).from(pushLog)
    .where(inArray(pushLog.triggerType, triggers))
    .orderBy(desc(pushLog.sentAt))
    .limit(1);
  if (!row?.sentAt || !row.triggerType) return null;
  return { sentAt: row.sentAt, triggerType: row.triggerType };
}

async function loadQueuedByItem(shiftId: number): Promise<Map<string, { id: number; publishAt: Date | null }>> {
  const rows = await db.select({
    id: adminPushNotifications.id,
    publishAt: adminPushNotifications.publishAt,
    triggerConfig: adminPushNotifications.triggerConfig,
  }).from(adminPushNotifications).where(and(
    eq(adminPushNotifications.shiftId, shiftId),
    eq(adminPushNotifications.status, 'queued'),
  ));
  const map = new Map<string, { id: number; publishAt: Date | null }>();
  for (const r of rows) {
    const cfg = (r.triggerConfig ?? {}) as { itemKind?: string; itemId?: number };
    if (!cfg.itemKind || cfg.itemId == null) continue;
    map.set(`${cfg.itemKind}:${cfg.itemId}`, { id: r.id, publishAt: r.publishAt });
  }
  return map;
}

async function lastPushMap(triggers: string[]): Promise<Map<string, { sentAt: Date; triggerType: string }>> {
  const map = new Map<string, { sentAt: Date; triggerType: string }>();
  if (!triggers.length) return map;
  const rows = await db.select({
    sentAt: pushLog.sentAt,
    triggerType: pushLog.triggerType,
  }).from(pushLog)
    .where(inArray(pushLog.triggerType, triggers))
    .orderBy(desc(pushLog.sentAt));
  for (const row of rows) {
    if (!row.sentAt || !row.triggerType || map.has(row.triggerType)) continue;
    map.set(row.triggerType, { sentAt: row.sentAt, triggerType: row.triggerType });
  }
  return map;
}

function pickLast(
  map: Map<string, { sentAt: Date; triggerType: string }>,
  triggers: string[],
): { sentAt: Date; triggerType: string } | null {
  let best: { sentAt: Date; triggerType: string } | null = null;
  for (const t of triggers) {
    const row = map.get(t);
    if (!row) continue;
    if (!best || row.sentAt > best.sentAt) best = row;
  }
  return best;
}

function toItem(
  base: Omit<ContentNotifyItem, 'lastSentAt' | 'lastTrigger' | 'scheduledAt' | 'scheduledId'>,
  last: { sentAt: Date; triggerType: string } | null,
  queued: { id: number; publishAt: Date | null } | null,
): ContentNotifyItem {
  return {
    ...base,
    lastSentAt: iso(last?.sentAt),
    lastTrigger: last?.triggerType ?? null,
    scheduledAt: iso(queued?.publishAt),
    scheduledId: queued?.id ?? null,
  };
}

export async function loadContentNotifyBoard(opts: {
  day: number;
  shiftId: number;
  totalDays: number;
}): Promise<{
  day: number;
  questions: ContentNotifyItem[];
  tasks: ContentNotifyItem[];
  events: ContentNotifyItem[];
}> {
  const { day, shiftId, totalDays } = opts;

  const [qRows, tRows, eRows] = await Promise.all([
    db.select().from(questions).where(or(
      eq(questions.shiftId, shiftId),
      isNull(questions.shiftId),
    )),
    db.select().from(tasks).where(eq(tasks.shiftId, shiftId)),
    db.select().from(events).where(and(
      eq(events.shiftId, shiftId),
      eq(events.dayNumber, day),
    )),
  ]);

  const dayQuestions = qRows.filter(q => questionMatchesDay(q, day));
  const dayTasks = tRows.filter(t => isTaskOnForumDay(t, day));
  const dayEvents = eRows.filter(ev => !ev.parentEventId);

  const eveningTitle = day >= totalDays
    ? 'Итоговая анкета форума'
    : `Итоговая анкета дня ${day}`;
  const eveningKind: ContentNotifyKind = day >= totalDays ? 'forum_wrap' : 'evening';
  const eveningId = day;

  const allTriggers = [
    ...triggersForContent(eveningKind, eveningId, day),
    ...dayQuestions.flatMap(q => questionOpenTriggers(q.id)),
    ...dayTasks.flatMap(t => taskNotifyTriggers(t.id)),
    ...dayEvents.flatMap(e => eventNotifyTriggers(e.id)),
  ];
  const [sentMap, queuedMap] = await Promise.all([
    lastPushMap(allTriggers),
    loadQueuedByItem(shiftId),
  ]);

  const questionItems: ContentNotifyItem[] = [];
  questionItems.push(toItem({
    kind: eveningKind,
    id: eveningId,
    title: eveningTitle,
    subtitle: 'Анкета дня · все участники смены, кто ещё не сдал',
    status: 'Системная',
    canSend: true,
    cannotSendReason: null,
    defaultText: defaultTextForContent(eveningKind, eveningTitle, day),
    appLinkHash: appLinkForContent(eveningKind, eveningId),
  }, pickLast(sentMap, triggersForContent(eveningKind, eveningId, day)), queuedMap.get(`${eveningKind}:${eveningId}`) ?? null));

  for (const q of dayQuestions) {
    const published = q.status === 'published' && !q.isHidden;
    questionItems.push(toItem({
      kind: 'question',
      id: q.id,
      title: q.title,
      subtitle: contentItemKindLabel(q.questionKind || q.reflectionKind),
      status: questionStatusLabel(q),
      canSend: published,
      cannotSendReason: published ? null : 'Сначала опубликуйте вопрос',
      defaultText: (q.pushTemplate || '').trim() || defaultTextForContent('question', q.title, day),
      appLinkHash: appLinkForContent('question', q.id),
    }, pickLast(sentMap, questionOpenTriggers(q.id)), queuedMap.get(`question:${q.id}`) ?? null));
  }

  const taskItems: ContentNotifyItem[] = [];
  for (const t of dayTasks) {
    const published = t.status === 'published' && !t.isHidden;
    taskItems.push(toItem({
      kind: 'task',
      id: t.id,
      title: t.title,
      subtitle: t.category || 'Задание',
      status: t.isHidden ? 'Скрыто' : (t.status === 'published' ? 'Опубликовано' : 'Черновик'),
      canSend: published,
      cannotSendReason: published ? null : 'Сначала опубликуйте задание',
      defaultText: defaultTextForContent('task', t.title, day),
      appLinkHash: appLinkForContent('task', t.id),
    }, pickLast(sentMap, taskNotifyTriggers(t.id)), queuedMap.get(`task:${t.id}`) ?? null));
  }

  const eventItems: ContentNotifyItem[] = [];
  for (const e of dayEvents) {
    const published = !!e.isPublished && !!e.dayPublished;
    const when = e.timeSlot || '';
    eventItems.push(toItem({
      kind: 'event',
      id: e.id,
      title: e.title,
      subtitle: [when, e.place, e.blockType].filter(Boolean).join(' · ') || 'Слот программы',
      status: published ? 'В программе' : 'Черновик',
      canSend: published,
      cannotSendReason: published ? null : 'Опубликуйте слот в программе дня',
      defaultText: defaultTextForContent('event', e.title, day),
      appLinkHash: appLinkForContent('event', e.id),
    }, pickLast(sentMap, eventNotifyTriggers(e.id)), queuedMap.get(`event:${e.id}`) ?? null));
  }

  return { day, questions: questionItems, tasks: taskItems, events: eventItems };
}

export function alreadySentToday(lastSentAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastSentAt) return false;
  return getMoscowParts(now).dateKey === getMoscowParts(lastSentAt).dateKey;
}
