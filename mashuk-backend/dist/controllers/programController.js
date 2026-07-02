import { eq, and, asc, lte, or, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, eventAttendance, materials, questions, answers } from '../db/schema.js';
import { getForumSettings, formatTime } from '../services/helpers.js';
import { cache } from '../services/cache.js';
export const getProgramSettings = async (req, res) => {
    const settings = await getForumSettings();
    res.json({
        currentDay: settings.currentDay ?? 1,
        totalDays: settings.totalDays ?? 4,
        recommendationThreshold: settings.recommendationThreshold ?? 1,
        sectionsVisibility: settings.sectionsVisibility ?? {},
    });
};
async function countTouchpoints(participantId) {
    const now = new Date();
    const publishedQuestions = await db.select().from(questions)
        .where(and(eq(questions.status, 'published'), or(isNull(questions.publishTime), lte(questions.publishTime, now))));
    const participantAnswers = await db.select().from(answers)
        .where(eq(answers.participantId, participantId));
    const answeredIds = new Set(participantAnswers.map(a => a.questionId));
    return participantAnswers.filter(a => publishedQuestions.some(q => q.id === a.questionId)).length;
}
export const getProgram = async (req, res) => {
    try {
        const day = Number(req.query.day) || (await getForumSettings()).currentDay || 1;
        const cacheKey = `events_day_${day}`;
        let list = cache.get(cacheKey);
        if (!list) {
            list = await db.select().from(events)
                .where(and(eq(events.dayNumber, day), eq(events.isPublished, true)))
                .orderBy(asc(events.startTime));
            cache.set(cacheKey, list);
        }
        const attendance = await db.select().from(eventAttendance)
            .where(eq(eventAttendance.participantId, req.participant.id));
        const attendedIds = new Set(attendance.map(a => a.eventId));
        const now = new Date();
        const mapEvent = (e) => {
            let status = 'future';
            if (e.endTime && e.endTime < now)
                status = 'past';
            else if (e.startTime && e.startTime <= now && (!e.endTime || e.endTime >= now))
                status = 'now';
            return {
                id: e.id,
                time: formatTime(e.startTime),
                endTime: formatTime(e.endTime),
                title: e.title,
                description: e.description,
                subtitle: e.place || e.description,
                place: e.place,
                tags: e.tags || [],
                timeSlot: e.timeSlot ?? formatTime(e.startTime),
                status,
                attended: attendedIds.has(e.id),
            };
        };
        const mapped = list.map(mapEvent);
        const slotMap = new Map();
        for (const ev of mapped) {
            const slot = ev.timeSlot || ev.time;
            if (!slotMap.has(slot))
                slotMap.set(slot, []);
            slotMap.get(slot).push(ev);
        }
        const slots = Array.from(slotMap.entries()).map(([timeSlot, slotEvents]) => ({
            timeSlot,
            events: slotEvents,
            parallel: slotEvents.length > 1,
        }));
        res.json({ day, events: mapped, slots });
    }
    catch (error) {
        console.error('getProgram:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const getRecommendations = async (req, res) => {
    try {
        const day = Number(req.query.day) || (await getForumSettings()).currentDay || 1;
        const settings = await getForumSettings();
        const interests = req.participant.interests || [];
        const threshold = settings.recommendationThreshold ?? 1;
        const list = await db.select().from(events)
            .where(and(eq(events.dayNumber, day), eq(events.isPublished, true)));
        const scored = list.map(e => {
            const tags = e.tags || [];
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
    }
    catch (error) {
        console.error('getRecommendations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const markAttendance = async (req, res) => {
    try {
        const eventId = Number(req.params.eventId);
        const [existing] = await db.select().from(eventAttendance)
            .where(and(eq(eventAttendance.participantId, req.participant.id), eq(eventAttendance.eventId, eventId))).limit(1);
        if (existing) {
            res.json({ ok: true, record: existing, duplicate: true });
            return;
        }
        const [record] = await db.insert(eventAttendance).values({
            participantId: req.participant.id,
            eventId,
        }).returning();
        res.json({ ok: true, record });
    }
    catch (error) {
        console.error('markAttendance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const getKnowledgeBase = async (req, res) => {
    try {
        const day = Number(req.query.day) || 1;
        const mats = await db.select().from(materials).where(eq(materials.dayNumber, day));
        const touchpointsCompleted = await countTouchpoints(req.participant.id);
        const requiredTouchpoints = 4;
        const unlocked = touchpointsCompleted >= requiredTouchpoints;
        res.json({ day, unlocked, materials: mats, touchpointsCompleted, requiredTouchpoints });
    }
    catch (error) {
        console.error('getKnowledgeBase:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
