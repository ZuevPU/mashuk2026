import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLog, levelsConfig, participants } from '../db/schema.js';
const PATH_ACTIONS = new Set(['question_answer', 'piggybank_idea', 'piggybank_thought', 'piggybank_question']);
const EXP_ACTIONS = new Set(['task_complete', 'exchange_question', 'exchange_answer', 'piggybank_entry']);
const DEFAULT_THRESHOLDS = [0, 100, 250, 500, 1000];
export async function awardPoints(participantId, actionType, overridePoints) {
    const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
    const points = overridePoints ?? config?.pointsPerUnit ?? 0;
    if (points <= 0)
        return null;
    if (config?.maxAccruals) {
        const [{ count }] = await db
            .select({ count: sql `count(*)::int` })
            .from(pointsLog)
            .where(and(eq(pointsLog.participantId, participantId), eq(pointsLog.actionType, actionType)));
        if (count >= config.maxAccruals)
            return null;
    }
    await db.insert(pointsLog).values({ participantId, actionType, points });
    const track = PATH_ACTIONS.has(actionType) ? 'path' : 'experience';
    if (track === 'path') {
        await db.update(participants)
            .set({ pathPoints: sql `${participants.pathPoints} + ${points}` })
            .where(eq(participants.id, participantId));
    }
    else {
        await db.update(participants)
            .set({ experiencePoints: sql `${participants.experiencePoints} + ${points}` })
            .where(eq(participants.id, participantId));
    }
    return { awarded: points, track };
}
export async function getLevelThresholds(track) {
    const actionType = track === 'path' ? 'path_level' : 'exp_level';
    const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
    const thresholds = config?.levelThresholds;
    return thresholds?.length ? thresholds : DEFAULT_THRESHOLDS;
}
export async function getLevel(points, track = 'path') {
    const thresholds = await getLevelThresholds(track);
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
        if (points >= thresholds[i])
            level = i + 1;
    }
    return level;
}
export function getLevelSync(points, thresholds = DEFAULT_THRESHOLDS) {
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
        if (points >= thresholds[i])
            level = i + 1;
    }
    return level;
}
