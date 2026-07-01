import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { piggybank, answers, taskSubmissions } from '../db/schema.js';
import { getLevel, awardPoints } from '../services/pointsService.js';
export const getProfile = async (req, res) => {
    try {
        const p = req.participant;
        const userAnswers = await db.select().from(answers).where(eq(answers.participantId, p.id));
        const userTasks = await db.select().from(taskSubmissions).where(eq(taskSubmissions.participantId, p.id));
        const allPiggy = await db.select().from(piggybank).where(eq(piggybank.participantId, p.id));
        const ideas = allPiggy.filter(e => e.tag === 'идея');
        const pathLevel = await getLevel(p.pathPoints ?? 0, 'path');
        const experienceLevel = await getLevel(p.experiencePoints ?? 0, 'experience');
        res.json({
            user: {
                firstName: p.firstName,
                lastName: p.lastName,
                direction: p.direction,
            },
            stats: {
                activities: userAnswers.length + userTasks.length,
                tasksDone: userTasks.filter(t => t.status === 'approved').length,
                ideas: ideas.length,
                answers: userAnswers.length,
            },
            points: {
                path: p.pathPoints ?? 0,
                experience: p.experiencePoints ?? 0,
                pathLevel,
                experienceLevel,
            },
            trajectory: {
                from: p.direction || 'Старт',
                to: Array.isArray(p.interests) && p.interests.length ? p.interests[0] : 'Цель',
            },
            goalSetting: p.interests ? { interests: p.interests } : null,
            outcomes: {
                summary: userAnswers.length >= 3
                    ? `Вы ответили на ${userAnswers.length} вопросов и выполнили ${userTasks.filter(t => t.status === 'approved').length} заданий`
                    : null,
            },
            piggybankCount: allPiggy.length,
        });
    }
    catch (error) {
        console.error('getProfile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const listPiggybank = async (req, res) => {
    try {
        const tag = req.query.tag;
        const source = req.query.source;
        let query = db.select().from(piggybank).where(eq(piggybank.participantId, req.participant.id)).orderBy(desc(piggybank.createdAt));
        const entries = await query;
        const filtered = entries.filter(e => {
            if (tag && e.tag !== tag)
                return false;
            if (source && e.source !== source)
                return false;
            return true;
        });
        res.json({ entries: filtered });
    }
    catch (error) {
        console.error('listPiggybank:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const createPiggybank = async (req, res) => {
    try {
        const { tag, text, source } = req.body;
        const [entry] = await db.insert(piggybank).values({
            participantId: req.participant.id,
            tag,
            text,
            source,
        }).returning();
        const actionMap = {
            идея: 'piggybank_idea',
            мысль: 'piggybank_thought',
            вопрос: 'piggybank_question',
            контакт: 'piggybank_entry',
            'подумать над этим': 'piggybank_entry',
            'на будущее': 'piggybank_entry',
            'забрать в работу': 'piggybank_entry',
            'обсудить с командой': 'piggybank_entry',
        };
        await awardPoints(req.participant.id, actionMap[tag] || 'piggybank_entry');
        res.json({ entry });
    }
    catch (error) {
        console.error('createPiggybank:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
