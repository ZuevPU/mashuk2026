import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { medals, tasks, userMedals } from '../db/schema.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import { sendPushNotification } from './pushService.js';

export async function awardTaskLinkedMedals(
  participantId: number,
  task: Pick<typeof tasks.$inferSelect, 'medalId' | 'medalCount' | 'medalTask' | 'title'>,
): Promise<void> {
  if (task.medalId) {
    const [medal] = await db.select().from(medals).where(eq(medals.id, task.medalId)).limit(1);
    if (medal?.isActive !== false) {
      const [existing] = await db.select({ id: userMedals.id }).from(userMedals)
        .where(and(eq(userMedals.participantId, participantId), eq(userMedals.medalId, task.medalId)))
        .limit(1);
      if (!existing) {
        await db.insert(userMedals).values({
          participantId,
          medalId: task.medalId,
          way: 'task',
        });
        await sendPushNotification(
          [participantId],
          `Новая медаль: «${medal.name}» за задание «${task.title}»`,
          'transactional_medal',
        ).catch(() => undefined);
      }
    }
  }
  if (task.medalTask || task.medalId) {
    await evaluateMedalsForParticipant(participantId);
  }
}
