import { Response } from 'express';
import { eq, and, asc, lte, or, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, eventAttendance, materials, questions, answers, scheduleDays, dayFocus, kbDayUnlocks } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings, formatTime, resolveEffectiveCurrentDay } from '../services/helpers.js';
import { isPublishedStatus } from '../services/publishStatus.js';
import { getForumDayDateLabel } from '../services/timePhase.js';
import {
  getEventLiveStatus,
  recommendationSubtitle,
  resolveEventInterval,
} from '../services/eventSchedule.js';
import { cache } from '../services/cache.js';

export const getProgramSettings = async (req: ParticipantRequest, res: Response): Promise<void> => {
  const settings = await getForumSettings();
  res.json({
    currentDay: settings.currentDay ?? 1,
    totalDays: settings.totalDays ?? 8,
    recommendationThreshold: settings.recommendationThreshold ?? 1,
    sectionsVisibility: settings.sectionsVisibility ?? {},
    startDate: settings.startDate ?? null,
  });
};

/** Count answered published questions for a specific day (touchpoints). */
export async function countTouchpointsForDay(participantId: number, dayNumber: number): Promise<{
  completed: number;
  total: number;
}> {
  const now = new Date();
  const dayQuestions = await db.select().from(questions)
    .where(and(
      eq(questions.status, 'published'),
      eq(questions.dayNumber, dayNumber),
      or(isNull(questions.publishTime), lte(questions.publishTime, now)),
    ));
  if (dayQuestions.length === 0) {
    return { completed: 0, total: 7 };
  }
  const participantAnswers = await db.select().from(answers)
    .where(eq(answers.participantId, participantId));
  const answeredIds = new Set(participantAnswers.map(a => a.questionId));
  const completed = dayQuestions.filter(q => answeredIds.has(q.id)).length;
  return { completed, total: dayQuestions.length };
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

    const [dayMeta] = await db.select().from(scheduleDays).where(eq(scheduleDays.dayNumber, day)).limit(1);

    const cacheKey = `events_day_${day}_pub`;
    let list = cache.get(cacheKey) as typeof events.$inferSelect[] | undefined;

    if (!list) {
      // Participant sees events only after schedule day publish (day_published) + isPublished
      list = await db.select().from(events)
        .where(and(
          eq(events.dayNumber, day),
          eq(events.isPublished, true),
          eq(events.dayPublished, true),
        ))
        .orderBy(asc(events.startTime));
      // Fallback: if schedule_days row missing (pre-publish workflow), show classic isPublished events
      if (list.length === 0 && !dayMeta) {
        list = await db.select().from(events)
          .where(and(eq(events.dayNumber, day), eq(events.isPublished, true)))
          .orderBy(asc(events.startTime));
      }
      cache.set(cacheKey, list);
    }

    const attendance = await db.select().from(eventAttendance)
      .where(eq(eventAttendance.participantId, req.participant!.id));
    const attendedIds = new Set(attendance.map(a => a.eventId));

    const settings = await getForumSettings();
    const now = new Date();
    const effectiveDay = resolveEffectiveCurrentDay(settings, now);
    const mapEvent = (e: typeof list[0], children: typeof list = []) => {
      const { start, end } = resolveEventInterval(e, settings);
      const status = getEventLiveStatus(day, effectiveDay, start, end, now);
      const childMapped = children.map(c => {
        const iv = resolveEventInterval(c, settings);
        return {
          id: c.id,
          title: c.title,
          place: c.place,
          time: formatTime(iv.start),
          endTime: formatTime(iv.end),
        };
      });

      return {
        id: e.id,
        time: formatTime(start),
        endTime: formatTime(end),
        title: e.title,
        description: e.description,
        subtitle: [e.place, e.description?.slice(0, 120)].filter(Boolean).join(' · ') || '',
        place: e.place,
        tags: (e.tags as string[]) || [],
        timeSlot: e.timeSlot ?? formatTime(start),
        status,
        attended: attendedIds.has(e.id),
        hasSubSessions: e.hasSubSessions === true,
        children: childMapped,
      };
    };

    const pid = req.participant!.directionId;
    const visible = list.filter(e => {
      if (e.audienceType === 'direction' && e.audienceDirectionId && pid && e.audienceDirectionId !== pid) {
        return false;
      }
      return true;
    });
    const childByParent = new Map<number, typeof list>();
    for (const e of visible) {
      if (e.parentEventId) {
        const arr = childByParent.get(e.parentEventId) || [];
        arr.push(e);
        childByParent.set(e.parentEventId, arr);
      }
    }
    const topLevel = visible.filter(e => !e.parentEventId);

    const mapped = topLevel.map(e => mapEvent(e, (childByParent.get(e.id) || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))));
    const slotMap = new Map<string, typeof mapped>();
    for (const ev of mapped) {
      const slot = ev.timeSlot || ev.time;
      if (!slotMap.has(slot)) slotMap.set(slot, []);
      slotMap.get(slot)!.push(ev);
    }

    const slots = Array.from(slotMap.entries()).map(([timeSlot, slotEvents]) => ({
      timeSlot,
      events: slotEvents,
      parallel: slotEvents.length > 1,
    }));

    res.json({
      day,
      dayPublished: dayMeta?.isPublished === true || (!dayMeta && list.length > 0),
      events: mapped,
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
    const interests = (req.participant!.interests as string[]) || [];
    const threshold = settings.recommendationThreshold ?? 1;

    const list = await db.select().from(events)
      .where(and(
        eq(events.dayNumber, day),
        eq(events.isPublished, true),
        eq(events.dayPublished, true),
      ));

    let eventList = list;
    if (eventList.length === 0) {
      const [dayMeta] = await db.select().from(scheduleDays).where(eq(scheduleDays.dayNumber, day)).limit(1);
      if (!dayMeta) {
        eventList = await db.select().from(events)
          .where(and(eq(events.dayNumber, day), eq(events.isPublished, true)))
          .orderBy(asc(events.startTime));
      }
    }

    const scored = eventList.map(e => {
      const tags = (e.tags as string[]) || [];
      const overlap = tags.filter(t => interests.includes(t)).length;
      return { event: e, score: overlap };
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
        subtitle: recommendationSubtitle(s.score, threshold),
        score: s.score,
        tags: s.event.tags,
      })),
    });
  } catch (error) {
    console.error('getRecommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAttendance = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const eventId = Number(req.params.eventId);
    const [existing] = await db.select().from(eventAttendance)
      .where(and(
        eq(eventAttendance.participantId, req.participant!.id),
        eq(eventAttendance.eventId, eventId),
      )).limit(1);
    if (existing) {
      res.json({ ok: true, record: existing, duplicate: true });
      return;
    }
    const [record] = await db.insert(eventAttendance).values({
      participantId: req.participant!.id,
      eventId,
    }).returning();

    const { awardPoints } = await import('../services/pointsService.js');
    const pointsResult = await awardPoints(req.participant!.id, 'attendance');

    res.json({
      ok: true,
      record,
      xpAwarded: pointsResult?.awarded ?? 0,
      track: pointsResult?.track ?? 'path',
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
    const dayEventRows = await db.select({ id: events.id }).from(events).where(eq(events.dayNumber, day));
    const dayEventIdList = dayEventRows.map(e => e.id);
    const dayEventIds = new Set(dayEventIdList);
    const interests = (req.participant!.interests as string[]) || [];
    const direction = req.participant!.direction;

    const dayOrGeneral = or(eq(materials.dayNumber, day), eq(materials.isGeneral, true));
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
