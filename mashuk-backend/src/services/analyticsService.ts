import { db } from '../db/index.js';
import { dailyStats, participants, answers, questions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function recalculateDailyStats(_direction = 'all'): Promise<void> {
  const allParticipants = await db.select().from(participants);
  const allAnswers = await db.select().from(answers);
  const publishedQuestions = await db.select().from(questions)
    .where(eq(questions.status, 'published'));
  const questionsPerParticipant = Math.max(publishedQuestions.length, 1);

  const wordCounts = allAnswers.map(a => a.wordCount || 0).filter(w => w > 0).sort((a, b) => a - b);
  const medianWordCount = wordCounts.length
    ? wordCounts[Math.floor(wordCounts.length / 2)]
    : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const directions = ['all', ...new Set(allParticipants.map(p => p.direction).filter(Boolean) as string[])];
  for (const dir of directions) {
    const dirParticipants = dir === 'all' ? allParticipants : allParticipants.filter(p => p.direction === dir);
    const dirParticipantIds = new Set(dirParticipants.map(p => p.id));
    const dirAnswers = allAnswers.filter(a => dirParticipantIds.has(a.participantId));
    const dirCheckins = dirAnswers.filter(a => {
      const data = a.answerData as { energy?: number } | null;
      return data && typeof data.energy === 'number';
    });
    const dirAvgEnergy = dirCheckins.length
      ? Math.round(dirCheckins.reduce((sum, a) => sum + ((a.answerData as { energy: number }).energy || 0), 0) / dirCheckins.length)
      : 0;
    const dirEmotions: Record<string, number> = {};
    for (const a of dirCheckins) {
      const emo = (a.answerData as { emotion?: string }).emotion;
      if (emo) dirEmotions[emo] = (dirEmotions[emo] || 0) + 1;
    }
    const dirCompletion = dirParticipants.length
      ? Math.min(100, Math.round((dirAnswers.length / (dirParticipants.length * questionsPerParticipant)) * 100))
      : 0;

    const [existing] = await db.select().from(dailyStats)
      .where(eq(dailyStats.direction, dir))
      .limit(1);

    const values = {
      direction: dir,
      statDate: today,
      timePoint: 'день',
      avgEnergy: dirAvgEnergy,
      emotionsDistribution: dirEmotions,
      completionPercent: dirCompletion,
      medianWordCount,
      redFlag: dirAvgEnergy < 3 && dirCheckins.length > 0,
    };

    if (existing) {
      await db.update(dailyStats).set(values).where(eq(dailyStats.id, existing.id));
    } else {
      await db.insert(dailyStats).values(values);
    }
  }
}

export function startAnalyticsScheduler(): void {
  const HOUR_MS = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      if (new Date().getHours() === 23) {
        await recalculateDailyStats();
        console.log('[analytics] Daily stats recalculated');
      }
    } catch (err) {
      console.error('[analytics] Scheduler error:', err);
    }
  }, HOUR_MS);
}
