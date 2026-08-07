import { Response } from 'express';
import { eq, and, asc, lte, or, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, eventAttendance, materials, questions, answers, scheduleDays, dayFocus, kbDayUnlocks, programSpeakers } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  getForumSettings, formatTime, resolveEffectiveCurrentDay,
  resolveLiveScheduleDateKey, resolveLiveScheduleDay,
} from '../services/helpers.js';
import { isPublishedStatus } from '../services/publishStatus.js';
import { getForumDayDateLabel } from '../services/timePhase.js';
import {
  getEventLiveStatus,
  calendarDateKeyFromTimestamp,
  recommendationSubtitle,
  resolveProgramRecEmptyTexts,
  resolveEventInterval,
} from '../services/eventSchedule.js';
import { cache } from '../services/cache.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from '../services/touchpointProgress.js';
import { TOUCHPOINT_SLOTS } from '../services/touchpointTemplates.js';
import { resolveActiveShiftId } from '../services/shiftService.js';
import { clusterOverlappingTimedItems, formatSlotLabel } from '../services/programSlots.js';
import { eventVisibleForParticipantDirection } from '../services/eventAudience.js';

export const getProgramSettings = async (req: ParticipantRequest, res: Response): Promise<void> => {
  const settings = await getForumSettings();
  const now = new Date();
  const shiftId = await resolveActiveShiftId();
  const publishedRows = await db.select({
    dayNumber: scheduleDays.dayNumber,
  }).from(scheduleDays).where(and(
    eq(scheduleDays.shiftId, shiftId),
    eq(scheduleDays.isPublished, true),
  ));
  const currentDay = resolveEffectiveCurrentDay(settings, now);
  const liveScheduleDay = resolveLiveScheduleDay(settings, now);
  res.json({
    // Same “today” as home — not raw admin currentDay (often stuck at 1)
    currentDay,
    liveScheduleDay,
    totalDays: settings.totalDays ?? 8,
    recommendationThreshold: settings.recommendationThreshold ?? 1,
    sectionsVisibility: settings.sectionsVisibility ?? {},
    startDate: settings.startDate ?? null,
    publishedDays: publishedRows.map(r => r.dayNumber).sort((a, b) => a - b),
  });
};

/** Count answered touchpoint slots for a forum day (7-slot template). */
export async function countTouchpointsForDay(participantId: number, dayNumber: number): Promise<{
  completed: number;
  total: number;
}> {
  const shiftId = await resolveActiveShiftId();
  // Include all published day questions (even future windows) so answered twins still count
  const published = await db.select().from(questions)
    .where(and(
      eq(questions.shiftId, shiftId),
      eq(questions.status, 'published'),
    ));
  const dayQuestions = published.filter(q => isTouchpointQuestionForForumDay(q, dayNumber));
  const participantAnswers = await db.select().from(answers)
    .where(eq(answers.participantId, participantId));
  const answeredIds = new Set(participantAnswers.map(a => a.questionId));
  const { completed, expected } = touchpointCompletionRatio(dayQuestions, answeredIds, dayNumber);
  return { completed, total: expected || TOUCHPOINT_SLOTS.length };
}

export function materialIsNew(m: typeof materials.$inferSelect, now: Date): boolean {
  if (m.isNew === true) return true;
  if (m.createdAt) {
    return now.getTime() - new Date(m.createdAt).getTime() < 24 * 60 * 60 * 1000;
  }
  return false;
}

/** Per-material KB unlock after the day gate is open. */
export function isMaterialUnlockedForParticipant(
  m: Pick<typeof materials.$inferSelect, 'kbUnlockMode' | 'kbUnlockMinTouchpoints'>,
  touchpointsCompleted: number,
  forumDefaultN: number,
): boolean {
  const mode = m.kbUnlockMode ?? 'touchpoints';
  if (mode === 'immediate') return true;
  const required = m.kbUnlockMinTouchpoints ?? forumDefaultN;
  return touchpointsCompleted >= required;
}

function mapMaterialForClient(m: typeof materials.$inferSelect, now: Date) {
  const type = (m.type || '').toLowerCase();
  let typeLabel = '📎 Материал';
  if (type === 'notes' || type === 'конспект') typeLabel = '📄 Конспект';
  else if (type === 'pdf' || type === 'presentation') typeLabel = '🖼 PDF';
  else if (type === 'video' || type === 'vk') typeLabel = '🎥 VK Video';
  else if (type === 'links' || type === 'resources') typeLabel = '🔗 Ресурсы';

  return {
    id: m.id,
    title: m.title,
    type: m.type,
    typeLabel,
    description: m.description,
    url: m.url,
    isNew: materialIsNew(m, now),
    speakerName: m.speakerName,
    speakerInitials: m.speakerInitials || (m.speakerName ? m.speakerName.slice(0, 2).toUpperCase() : undefined),
    eventTitle: m.eventTitle,
    topic: m.eventTitle || m.title,
  };
}

export async function evaluateKbDayAccess(
  participantId: number,
  day: number,
  settings: Awaited<ReturnType<typeof getForumSettings>>,
  now = new Date(),
): Promise<{
  unlocked: boolean;
  lockReason: string | null;
  touchpointsCompleted: number;
  touchpointsTotal: number;
  requiredTouchpoints: number;
  remaining: number;
  unlockDisabled: boolean;
  ruleLabel: string;
  kbStatus: 'open' | 'progress' | 'locked';
  switcherLabel: string;
}> {
  const { completed: touchpointsCompleted, total: touchpointsTotal } =
    await countTouchpointsForDay(participantId, day);
  const requiredTouchpoints = settings.kbUnlockThreshold ?? 4;
  const unlockDisabled = settings.kbUnlockDisabled === true;
  const currentDay = resolveEffectiveCurrentDay(settings, now);
  const dayReached = day <= currentDay;
  const pastPolicy = (settings as { kbPastDaysPolicy?: string }).kbPastDaysPolicy ?? 'locked';

  const [adminUnlock] = await db.select().from(kbDayUnlocks).where(
    and(eq(kbDayUnlocks.participantId, participantId), eq(kbDayUnlocks.dayNumber, day)),
  ).limit(1);

  let unlocked = unlockDisabled || (dayReached && touchpointsCompleted >= requiredTouchpoints);
  if (adminUnlock) unlocked = true;
  if (!unlockDisabled && day < currentDay && pastPolicy === 'auto_open') unlocked = true;
  if (!unlockDisabled && day < currentDay && pastPolicy === 'locked' && !adminUnlock
    && touchpointsCompleted < requiredTouchpoints) {
    unlocked = false;
  }

  let lockReason: string | null = null;
  if (day === 8 && !unlockDisabled) {
    lockReason = 'point_b';
  } else if (!dayReached && !unlockDisabled) {
    lockReason = 'future_day';
  } else if (!unlocked) {
    lockReason = 'touchpoints';
  }

  let kbStatus: 'open' | 'progress' | 'locked' = 'locked';
  let switcherLabel = '🔒';
  if (unlocked) {
    kbStatus = 'open';
    switcherLabel = '✓ открыт';
  } else if (lockReason === 'touchpoints' && dayReached) {
    kbStatus = 'progress';
    switcherLabel = `${touchpointsCompleted}/${requiredTouchpoints} →`;
  } else {
    switcherLabel = '🔒';
  }

  const ruleLabel = unlockDisabled
    ? 'Разблокировка отключена администратором'
    : `≥ ${requiredTouchpoints} из ${touchpointsTotal || 7} точек осмысления за день`;

  return {
    unlocked,
    lockReason,
    touchpointsCompleted,
    touchpointsTotal,
    requiredTouchpoints,
    remaining: Math.max(0, requiredTouchpoints - touchpointsCompleted),
    unlockDisabled,
    ruleLabel,
    kbStatus,
    switcherLabel,
  };
}

export const getKnowledgeBaseDays = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const settings = await getForumSettings();
    const totalDays = settings.totalDays ?? 8;
    const now = new Date();
    const days: Record<string, unknown>[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const access = await evaluateKbDayAccess(req.participant!.id, day, settings, now);
      const [focus] = await db.select().from(dayFocus).where(eq(dayFocus.dayNumber, day)).limit(1);
      days.push({
        day,
        ...access,
        dayTitle: focus?.title ?? `День ${day}`,
        dayDescription: focus?.text ?? null,
        opensOn: getForumDayDateLabel(settings.startDate ?? null, day),
      });
    }
    res.json({ days, currentDay: resolveEffectiveCurrentDay(settings, now) });
  } catch (error) {
    console.error('getKnowledgeBaseDays:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProgram = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const day = Number(req.query.day) || (await getForumSettings()).currentDay || 1;
    const shiftId = await resolveActiveShiftId();

    const [dayMeta] = await db.select().from(scheduleDays).where(and(
      eq(scheduleDays.dayNumber, day),
      eq(scheduleDays.shiftId, shiftId),
    )).limit(1);

    const dayIsLive = dayMeta?.isPublished === true;
    const cacheKey = `events_day_${shiftId}_${day}_pub`;
    let list = cache.get(cacheKey) as typeof events.$inferSelect[] | undefined;

    if (list === undefined) {
      // Strict: participants see a day only after Forum/Program «Опубликовать день»
      if (!dayIsLive) {
        list = [];
      } else {
        list = await db.select().from(events)
          .where(and(
            eq(events.shiftId, shiftId),
            eq(events.dayNumber, day),
            eq(events.isPublished, true),
            eq(events.dayPublished, true),
          ))
          .orderBy(asc(events.startTime));
      }
      cache.set(cacheKey, list);
    }
    const eventsList = list ?? [];

    const attendance = await db.select().from(eventAttendance)
      .where(eq(eventAttendance.participantId, req.participant!.id));
    const attendedIds = new Set(attendance.map(a => a.eventId));

    const speakerRows = await db.select().from(programSpeakers);
    const speakerMap = new Map(speakerRows.map(s => [s.id, s]));
    const mapSpeakers = (rawIds: unknown) => {
      const ids = Array.isArray(rawIds) ? (rawIds as number[]) : [];
      return ids
        .map(id => speakerMap.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map(s => ({
          id: s.id,
          name: s.name,
          credentials: s.credentials,
          initials: s.initials,
        }));
    };

    const settings = await getForumSettings();
    const now = new Date();
    const liveScheduleDay = resolveLiveScheduleDay(settings, now);
    const scheduleContext = {
      startDate: settings.startDate ?? null,
      dayCalendarDateKey: day === liveScheduleDay
        ? resolveLiveScheduleDateKey(settings, liveScheduleDay, now, dayMeta?.calendarDate ?? null)
        : calendarDateKeyFromTimestamp(dayMeta?.calendarDate ?? null),
    };
    type NestedProgramChild = {
      id: number;
      title: string;
      place: string | null;
      time: string;
      endTime: string;
      tags: string[];
      speakers: ReturnType<typeof mapSpeakers>;
      hasSubSessions: boolean;
      children: NestedProgramChild[];
    };

    const pid = req.participant!.directionId;
    const visible = eventsList.filter(e => eventVisibleForParticipantDirection(e, pid));
    const childByParent = new Map<number, typeof eventsList>();
    for (const e of visible) {
      if (e.parentEventId) {
        const arr = childByParent.get(e.parentEventId) || [];
        arr.push(e);
        childByParent.set(e.parentEventId, arr);
      }
    }
    const topLevel = visible.filter(e => !e.parentEventId);
    const sortEvents = (arr: typeof eventsList) =>
      [...arr].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

    const mapNestedChild = (c: typeof eventsList[0]): NestedProgramChild => {
      const iv = resolveEventInterval(c, scheduleContext);
      const nested = sortEvents(childByParent.get(c.id) || []).map(mapNestedChild);
      const speakers = mapSpeakers(c.speakerIds);
      return {
        id: c.id,
        title: c.title,
        place: c.place,
        time: c.timeSlot ? formatTime(iv.start) : '',
        endTime: c.timeSlot ? formatTime(iv.end) : '',
        tags: (c.tags as string[]) || [],
        speakers,
        hasSubSessions: nested.length > 0 || c.hasSubSessions === true,
        children: nested,
      };
    };

    const mapEvent = (e: typeof eventsList[0]) => {
      const { start, end } = resolveEventInterval(e, scheduleContext);
      const status = getEventLiveStatus(day, liveScheduleDay, start, end, now);
      const childMapped = sortEvents(childByParent.get(e.id) || []).map(mapNestedChild);
      const speakers = mapSpeakers(e.speakerIds);
      const speakerLine = speakers
        .map(s => (s.credentials?.trim() ? `${s.name} — ${s.credentials.trim()}` : s.name))
        .join(', ');

      return {
        id: e.id,
        time: formatTime(start),
        endTime: formatTime(end),
        title: e.title,
        description: e.description,
        descriptionHtml: e.descriptionHtml,
        subtitle: [e.place, speakerLine].filter(Boolean).join(' · ') || '',
        place: e.place,
        tags: (e.tags as string[]) || [],
        speakers,
        timeSlot: e.timeSlot ?? formatTime(start),
        status,
        attended: attendedIds.has(e.id),
        hasSubSessions: childMapped.length > 0 || e.hasSubSessions === true,
        children: childMapped,
      };
    };

    const timed = topLevel.map(e => {
      const iv = resolveEventInterval(e, scheduleContext);
      return { item: mapEvent(e), start: iv.start, end: iv.end };
    }).filter((row): row is { item: ReturnType<typeof mapEvent>; start: Date; end: Date | null } => !!row.start);

    const clusters = clusterOverlappingTimedItems(timed);
    const slots = clusters.map(cluster => {
      const events = cluster.map(c => c.item);
      const starts = cluster.map(c => c.start.getTime());
      const ends = cluster.map(c => (c.end ? c.end.getTime() : c.start.getTime()));
      const spanStart = new Date(Math.min(...starts));
      const spanEnd = new Date(Math.max(...ends));
      const fallback = events[0]?.timeSlot || events[0]?.time || '';
      return {
        timeSlot: formatSlotLabel(spanStart, cluster.length === 1 ? cluster[0].end : spanEnd, fallback),
        events,
        parallel: events.length > 1,
      };
    });

    res.json({
      day,
      dayPublished: dayIsLive,
      events: timed.map(t => t.item),
      slots,
    });
  } catch (error) {
    console.error('getProgram:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRecommendations = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const day = Number(req.query.day) || (await getForumSettings()).currentDay || 1;
    const settings = await getForumSettings();
    const interests = Array.isArray(req.participant!.interests)
      ? (req.participant!.interests as string[])
      : [];
    const threshold = settings.recommendationThreshold ?? 1;
    const norm = (s: string) => s.trim().toLowerCase();
    const interestSet = new Set(interests.map(norm));

    const shiftId = await resolveActiveShiftId();
    const [dayMeta] = await db.select().from(scheduleDays).where(and(
      eq(scheduleDays.dayNumber, day),
      eq(scheduleDays.shiftId, shiftId),
    )).limit(1);
    const dayIsLive = dayMeta?.isPublished === true;
    const eventListRaw = dayIsLive
      ? await db.select().from(events)
        .where(and(
          eq(events.shiftId, shiftId),
          eq(events.dayNumber, day),
          eq(events.isPublished, true),
          eq(events.dayPublished, true),
        ))
      : [];
    const pid = req.participant!.directionId;
    const eventList = eventListRaw.filter(e => eventVisibleForParticipantDirection(e, pid));

    const childByParent = new Map<number, typeof eventList>();
    for (const e of eventList) {
      if (e.parentEventId) {
        const arr = childByParent.get(e.parentEventId) || [];
        arr.push(e);
        childByParent.set(e.parentEventId, arr);
      }
    }

    /** Tags on the block itself + all nested subblocks (for ranking parents). */
    const subtreeTags = (rootId: number): string[] => {
      const out: string[] = [];
      const walk = (id: number) => {
        const node = eventList.find(e => e.id === id);
        if (!node) return;
        const tags = Array.isArray(node.tags) ? (node.tags as string[]) : [];
        out.push(...tags);
        for (const ch of childByParent.get(id) || []) walk(ch.id);
      };
      walk(rootId);
      return out;
    };

    // Top-level blocks that match participant interests (via own or nested tags)
    const topLevel = eventList.filter(e => !e.parentEventId);
    const scored = topLevel.map(e => {
      const tags = subtreeTags(e.id);
      const matchedByNorm = new Map<string, string>();
      for (const raw of tags) {
        const key = norm(raw);
        if (!key || !interestSet.has(key)) continue;
        if (!matchedByNorm.has(key)) matchedByNorm.set(key, raw.trim());
      }
      return {
        event: e,
        score: matchedByNorm.size,
        matchedThemes: [...matchedByNorm.values()],
      };
    }).filter(x => x.score >= threshold)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ta = a.event.startTime ? new Date(a.event.startTime).getTime() : 0;
        const tb = b.event.startTime ? new Date(b.event.startTime).getTime() : 0;
        return ta - tb;
      });

    res.json({
      recommendations: scored.map(s => ({
        id: s.event.id,
        eventId: s.event.id,
        title: s.event.title,
        subtitle: s.matchedThemes.length
          ? `Тема: ${s.matchedThemes.join(' · ')}`
          : recommendationSubtitle(s.score, threshold),
        score: s.score,
        matchedThemes: s.matchedThemes,
        tags: s.matchedThemes,
      })),
      interests,
      publishedEventsCount: eventList.length,
      ...resolveProgramRecEmptyTexts(settings),
    });
  } catch (error) {
    console.error('getRecommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAttendance = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const eventId = Number(req.params.eventId);
    const qrToken = typeof req.body?.qrToken === 'string' ? req.body.qrToken
      : typeof req.query.qr === 'string' ? req.query.qr
      : undefined;
    const { recordEventAttendance } = await import('../services/eventAttendanceService.js');
    const result = await recordEventAttendance(req.participant!.id, eventId, { qrToken });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      record: result.record,
      duplicate: result.duplicate,
      xpAwarded: result.xpAwarded,
      track: result.track,
    });
  } catch (error) {
    console.error('markAttendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getKnowledgeBase = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const settings = await getForumSettings();
    const day = Number(req.query.day) || settings.currentDay || 1;
    const shiftId = await resolveActiveShiftId();
    const dayEventRows = await db.select({ id: events.id }).from(events).where(and(
      eq(events.dayNumber, day),
      eq(events.shiftId, shiftId),
    ));
    const dayEventIdList = dayEventRows.map(e => e.id);
    const dayEventIds = new Set(dayEventIdList);
    const interests = (req.participant!.interests as string[]) || [];
    const direction = req.participant!.direction;

    const dayOrGeneral = and(
      eq(materials.shiftId, shiftId),
      or(eq(materials.dayNumber, day), eq(materials.isGeneral, true)),
    );
    const mats = dayEventIdList.length > 0
      ? await db.select().from(materials).where(or(dayOrGeneral, inArray(materials.eventId, dayEventIdList)))
      : await db.select().from(materials).where(dayOrGeneral);
    const now = new Date();
    const access = await evaluateKbDayAccess(req.participant!.id, day, settings, now);
    const [focus] = await db.select().from(dayFocus).where(eq(dayFocus.dayNumber, day)).limit(1);
    const opensOn = getForumDayDateLabel(settings.startDate ?? null, day);

    const filtered = mats.filter(m => {
      if (!isPublishedStatus(m.status)) return false;
      if (m.isGeneral) return true;
      if (m.direction && direction && m.direction !== direction) return false;
      const tags = (m.tags as string[]) || [];
      const onDay = m.dayNumber === day;
      const onEvent = m.eventId != null && dayEventIds.has(m.eventId);
      const tagHit = tags.length > 0 && interests.length > 0 && tags.some(t => interests.includes(t));
      if (onDay || onEvent || tagHit) return true;
      if (!m.direction && tags.length === 0 && !m.eventId && onDay) return true;
      if (!m.direction && !m.eventId && tags.length === 0) return onDay;
      return false;
    });

    const forumDefaultN = access.requiredTouchpoints;
    const unlockedMaterials = access.unlocked
      ? filtered.filter(m => isMaterialUnlockedForParticipant(m, access.touchpointsCompleted, forumDefaultN))
      : [];
    const mapped = unlockedMaterials.map(m => mapMaterialForClient(m, now));

    let lockMessage: string | null = null;
    if (!access.unlocked) {
      if (access.lockReason === 'point_b') {
        lockMessage = 'Заполни Точку Б — финальную рефлексию смены';
      } else if (access.lockReason === 'future_day') {
        lockMessage = opensOn
          ? `День ещё не наступил. Откроется ${opensOn} после прохождения ≥${access.requiredTouchpoints} из ${access.touchpointsTotal || 7} точек`
          : `День ещё не наступил. Откроется, когда наступит день ${day}`;
      } else if (access.lockReason === 'touchpoints') {
        lockMessage = `🔒 Материалы откроются при ≥${access.requiredTouchpoints} из ${access.touchpointsTotal || 7} точек. Выполни ещё ${access.remaining} точек`;
      }
    }

    res.json({
      day,
      ...access,
      dayTitle: focus?.title ?? `День ${day}`,
      dayDescription: focus?.text ?? null,
      opensOn,
      lockMessage,
      materials: mapped,
    });
  } catch (error) {
    console.error('getKnowledgeBase:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveMaterialToPiggybank = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [mat] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
    if (!mat) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }
    if (!isPublishedStatus(mat.status)) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }
    const settings = await getForumSettings();
    const day = mat.dayNumber ?? settings.currentDay ?? 1;
    const now = new Date();
    const access = await evaluateKbDayAccess(req.participant!.id, day, settings, now);
    const forumDefaultN = access.requiredTouchpoints;
    if (!access.unlocked || !isMaterialUnlockedForParticipant(mat, access.touchpointsCompleted, forumDefaultN)) {
      res.status(403).json({ error: 'Material locked', lockReason: access.lockReason ?? 'touchpoints' });
      return;
    }
    const { events: eventsTable } = await import('../db/schema.js');
    const { createPiggybankEntry, inferSourceFromEventTitle } = await import('../services/piggybankService.js');

    let eventTitle: string | null = mat.eventTitle ?? null;
    if (mat.eventId) {
      const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, mat.eventId)).limit(1);
      eventTitle = ev?.title ?? eventTitle;
    }

    const body = req.body as { tags?: string[]; tag?: string; source?: string; note?: string };
    const tags = body.tags ?? body.tag ?? 'на будущее';
    const source = body.source;
    if (!source) {
      res.status(400).json({ error: 'source required' });
      return;
    }

    const text = [
      eventTitle ? `Блок: ${eventTitle}` : null,
      `Материал: ${mat.title}`,
      mat.description ? `— ${mat.description}` : '',
      body.note?.trim() ? `Заметка: ${body.note.trim()}` : '',
      mat.url ? `Ссылка: ${mat.url}` : '',
    ].filter(Boolean).join('\n');

    const entry = await createPiggybankEntry({
      participantId: req.participant!.id,
      text,
      tags,
      source,
    });
    res.json({ entry, suggestedSource: inferSourceFromEventTitle(eventTitle) });
  } catch (error) {
    if (error instanceof Error && (error.message === 'source required' || error.message === 'tags required')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('saveMaterialToPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
