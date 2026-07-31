import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { medals, tasks, userMedals } from '../db/schema.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';

export async function awardTaskLinkedMedals(
  participantId: number,
  task: Pick<typeof tasks.$inferSelect, 'medalId' | 'medalCount' | 'medalTask' | 'title'>,
  submissionId?: number,
): Promise<{ userMedalId: number | null }> {
  let userMedalId: number | null = null;
  const linkedMedalId = task.medalId ?? null;
  if (linkedMedalId) {
    const [medal] = await db.select().from(medals).where(eq(medals.id, linkedMedalId)).limit(1);
    if (medal?.isActive !== false) {
      const [existing] = await db.select({ id: userMedals.id }).from(userMedals)
        .where(and(eq(userMedals.participantId, participantId), eq(userMedals.medalId, linkedMedalId)))
        .limit(1);
      if (!existing) {
        const [inserted] = await db.insert(userMedals).values({
          participantId,
          medalId: linkedMedalId,
          submissionId: submissionId ?? null,
          way: 'task',
        }).returning({ id: userMedals.id });
        userMedalId = inserted.id;
        await sendPushNotification(
          [participantId],
          pushCopy.medalForTask(medal.name, task.title),
          'transactional_medal',
        ).catch(() => undefined);
      } else {
        userMedalId = existing.id;
        if (submissionId) {
          await db.update(userMedals).set({ submissionId }).where(eq(userMedals.id, existing.id));
        }
      }
    }
  }
  if (task.medalTask || task.medalId) {
    await evaluateMedalsForParticipant(participantId);
  }
  return { userMedalId };
}
