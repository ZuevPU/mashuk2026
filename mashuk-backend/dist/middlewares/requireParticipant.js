import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
export const requireParticipant = async (req, res, next) => {
    const vkUserId = req.vkUserId;
    if (!vkUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const [user] = await db.select().from(participants).where(eq(participants.vkId, vkUserId)).limit(1);
    if (!user) {
        res.status(403).json({ error: 'Registration required', status: 'needs_registration' });
        return;
    }
    req.participant = user;
    next();
};
