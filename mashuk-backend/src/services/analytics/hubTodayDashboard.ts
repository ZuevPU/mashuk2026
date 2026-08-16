import { and, count, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  eventAttendance,
  events,
  exchangeQuestions,
  participants,
  taskSubmissions,
  tasks,
} from '../../db/schema.js';
import { getScheduleDayPublished } from '../eveningScheduleGate.js';
import {
  isEveningOpenForDay,
  isForcePublishedActive,
  resolveEveningConfigForDay,
} from '../eveningQuestionnaireConfig.js';
import { alreadySentToday, loadContentNotifyBoard } from '../contentNotifyBoard.js';
import { isPublishedStatus } from '../publishStatus.js';
import { isTaskOnForumDay } from '../taskAdminHelpers.js';
import { getShiftById, shiftOpsToForumShape } from '../shiftService.js';

export async function buildHubTodayDashboard(shiftId: number, dayRaw?: number) {
  const shift = await getShiftById(shiftId);
  if (!shift) return null;
  const currentDay = Math.max(1, Number(shift.currentDay) || 1);
  const totalDays = Math.max(1, Number(shift.totalDays) || 8);
  const day = Number.isFinite(dayRaw) && (dayRaw as number) >= 1
    ? Math.min(totalDays, Math.floor(dayRaw as number))
    : currentDay;

  const settings = shiftOpsToForumShape(shift);
  const eveningConfig = resolveEveningConfigForDay(settings as never, Math.min(7, day));
  const scheduleDayPublished = await getScheduleDayPublished(day, shiftId);
  const eveningOpen = isEveningOpenForDay(eveningConfig, Math.min(7, day), new Date(), {
    settings: settings as never,
    scheduleDayPublished,
  });

  const [taskRows, dayEvents, exchangeRow, tasksModRow, board] = await Promise.all([
    db.select({
      id: tasks.id,
      status: tasks.status,
      isHidden: tasks.isHidden,
      dayNumber: tasks.dayNumber,
      dayNumbers: tasks.dayNumbers,
    }).from(tasks).where(eq(tasks.shiftId, shiftId)),
    db.select({
      id: events.id,
      title: events.title,
      isPublished: events.isPublished,
      dayPublished: events.dayPublished,
      place: events.place,
      parentEventId: events.parentEventId,
    }).from(events).where(and(
      eq(events.shiftId, shiftId),
      eq(events.dayNumber, day),
    )),
    db.select({ count: count() }).from(exchangeQuestions)
      .innerJoin(participants, eq(exchangeQuestions.participantId, participants.id))
      .where(and(
        eq(exchangeQuestions.moderationStatus, 'pending'),
        eq(participants.shiftId, shiftId),
      )),
    db.select({ count: count() }).from(taskSubmissions)
      .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(and(
        or(
          eq(taskSubmissions.status, 'pending'),
          eq(taskSubmissions.status, 'pending_team'),
        ),
        eq(tasks.shiftId, shiftId),
      )),
    loadContentNotifyBoard({ day, shiftId, totalDays }),
  ]);

  const dayTasks = taskRows.filter(t => isTaskOnForumDay(t, day));
  const publishedTasks = dayTasks.filter(t => isPublishedStatus(t.status) && !t.isHidden);
  const topEvents = dayEvents.filter(e => !e.parentEventId);
  const publishedEvents = topEvents.filter(e => e.isPublished && e.dayPublished);
  const eventIds = publishedEvents.map(e => e.id);
  const attendanceRows = eventIds.length
    ? await db.select({ eventId: eventAttendance.eventId, c: count() })
      .from(eventAttendance)
      .where(inArray(eventAttendance.eventId, eventIds))
      .groupBy(eventAttendance.eventId)
    : [];
  const attendanceMap = new Map(attendanceRows.map(r => [r.eventId, Number(r.c)]));

  const notifyItems = [
    ...board.questions,
    ...board.tasks,
    ...board.events,
  ].map(item => ({
    kind: item.kind,
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    canSend: item.canSend,
    cannotSendReason: item.cannotSendReason,
    defaultText: item.defaultText,
    lastSentAt: item.lastSentAt,
    alreadySentToday: alreadySentToday(item.lastSentAt ? new Date(item.lastSentAt) : null),
  }));

  return {
    shiftId,
    day,
    currentDay,
    totalDays,
    kbOpenAllTooEarly: currentDay < totalDays,
    dayPublished: scheduleDayPublished === true,
    dayPublishUnknown: scheduleDayPublished == null,
    tasksVisible: publishedTasks.length,
    tasksTotalDay: dayTasks.length,
    kbLocked: shift.kbUnlockDisabled !== true,
    kbUnlockThreshold: shift.kbUnlockThreshold ?? 4,
    eveningOpen: !!eveningOpen,
    eveningForcePublished: isForcePublishedActive(eveningConfig),
    pendingExchange: Number(exchangeRow[0]?.count ?? 0),
    pendingTasks: Number(tasksModRow[0]?.count ?? 0),
    events: publishedEvents.map(e => ({
      id: e.id,
      title: e.title,
      place: e.place,
      published: true,
      attendance: attendanceMap.get(e.id) ?? 0,
    })),
    eventsDraft: topEvents.length - publishedEvents.length,
    notifyItems,
  };
}
