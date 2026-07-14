import { Response } from 'express';
import { eq, and, asc, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, eventAttendance, materials, questions, answers, scheduleDays } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings, formatTime } from '../services/helpers.js';
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

    const now = new Date();
    const mapEvent = (e: typeof list[0]) => {
      let status: 'past' | 'now' | 'future' = 'future';
      if (e.endTime && e.endTime < now) status = 'past';
      else if (e.startTime && e.startTime <= now && (!e.endTime || e.endTime >= now)) status = 'now';

      return {
        id: e.id,
        time: formatTime(e.startTime),
        endTime: formatTime(e.endTime),
        title: e.title,
        description: e.description,
        subtitle: e.place || e.description,
        place: e.place,
        tags: (e.tags as string[]) || [],
        timeSlot: e.timeSlot ?? formatTime(e.startTime),
        status,
        attended: attendedIds.has(e.id),
      };
    };

    const mapped = list.map(mapEvent);
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
      .where(and(eq(events.dayNumber, day), eq(events.isPublished, true)));

    const scored = list.map(e => {
      const tags = (e.tags as string[]) || [];
      const overlap = tags.filter(t => interests.includes(t)).length;
      return { event: e, score: overlap };
    }).filter(x => x.score >= threshold)
      .sort((a, b) => b.score - a.score);

    res.json({
      recommendations: scored.map(s => ({
        id: s.event.id,
        eventId: s.event.id,
        title: s.event.title,
        subtitle: s.score > 1 ? 'высокое совпадение' : 'под твой запрос',
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

    res.json({ ok: true, record });
  } catch (error) {
    console.error('markAttendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getKnowledgeBase = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const settings = await getForumSettings();
    const day = Number(req.query.day) || settings.currentDay || 1;
    const mats = await db.select().from(materials).where(
      or(eq(materials.dayNumber, day), eq(materials.isGeneral, true)),
    );
    const currentDay = settings.currentDay ?? 1;

    const { completed: touchpointsCompleted, total: touchpointsTotal } =
      await countTouchpointsForDay(req.participant!.id, day);
    const requiredTouchpoints = settings.kbUnlockThreshold ?? 4;
    const unlockDisabled = settings.kbUnlockDisabled === true;
    const dayReached = day <= currentDay;
    const unlocked = unlockDisabled || (dayReached && touchpointsCompleted >= requiredTouchpoints);

    let lockReason: string | null = null;
    if (day === 8 && !unlockDisabled) {
      lockReason = 'point_b';
    } else if (!dayReached && !unlockDisabled) {
      lockReason = 'future_day';
    } else if (!unlocked) {
      lockReason = 'touchpoints';
    }

    // Filter by participant direction when material has direction set
    const filtered = mats.filter(m => {
      if (m.isGeneral) return true;
      if (!m.direction) return true;
      return m.direction === req.participant!.direction;
    });

    res.json({
      day,
      unlocked,
      materials: unlocked ? filtered : [],
      allMaterials: filtered,
      touchpointsCompleted,
      touchpointsTotal,
      requiredTouchpoints,
      remaining: Math.max(0, requiredTouchpoints - touchpointsCompleted),
      lockReason: unlocked ? null : lockReason,
      unlockDisabled,
      ruleLabel: unlockDisabled
        ? 'Разблокировка отключена администратором'
        : `≥ ${requiredTouchpoints} из ${touchpointsTotal || 7} точек осмысления за день`,
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
    const { piggybank } = await import('../db/schema.js');
    const { awardPoints } = await import('../services/pointsService.js');

    const [entry] = await db.insert(piggybank).values({
      participantId: req.participant!.id,
      tag: 'мысль',
      source: 'Своя мысль',
      text: [
        `Материал: ${mat.title}`,
        mat.description ? `— ${mat.description}` : '',
        mat.url ? `Ссылка: ${mat.url}` : '',
      ].filter(Boolean).join('\n'),
    }).returning();

    await awardPoints(req.participant!.id, 'piggybank_thought');
    res.json({ entry });
  } catch (error) {
    console.error('saveMaterialToPiggybank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
