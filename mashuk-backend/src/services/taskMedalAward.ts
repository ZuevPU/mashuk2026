import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { medals, participants, tasks, userMedals } from '../db/schema.js';
import { evaluateMedalsForParticipant } from './medalEvaluator.js';
import { pushCopy } from './pushCopy.js';
import { sendPushNotification } from './pushService.js';

export async function resolveMedalForParticipantShift(
  medalId: number,
  shiftId: number | null,
): Promise<typeof medals.$inferSelect | null> {
  const [medal] = await db.select().from(medals).where(eq(medals.id, medalId)).limit(1);
  if (!medal || medal.isActive === false) return null;
  if (shiftId == null || medal.shiftId === shiftId) return medal;
  const [local] = await db.select().from(medals).where(and(
    eq(medals.shiftId, shiftId),
    eq(medals.name, medal.name),
  )).limit(1);
  if (!local || local.isActive === false) return null;
  return local;
}

export async function awardTaskLinkedMedals(
  participantId: number,
  task: Pick<typeof tasks.$inferSelect, 'medalId' | 'medalCount' | 'medalTask' | 'title'>,
  submissionId?: number,
): Promise<{ userMedalId: number | null; medal: { id: number; name: string } | null }> {
  let userMedalId: number | null = null;
  let awardedMedal: { id: number; name: string } | null = null;
  const [owner] = await db.select({ shiftId: participants.shiftId })
    .from(participants).where(eq(participants.id, participantId)).limit(1);
  const linkedMedalId = task.medalId ?? null;
  if (linkedMedalId) {
    const medal = await resolveMedalForParticipantShift(linkedMedalId, owner?.shiftId ?? null);
    if (medal) {
      const [existing] = await db.select({ id: userMedals.id }).from(userMedals)
        .where(and(eq(userMedals.participantId, participantId), eq(userMedals.medalId, medal.id)))
        .limit(1);
      if (!existing) {
        const [inserted] = await db.insert(userMedals).values({
          participantId,
          medalId: medal.id,
          submissionId: submissionId ?? null,
          way: 'task',
        }).returning({ id: userMedals.id });
        userMedalId = inserted.id;
        awardedMedal = { id: medal.id, name: medal.name };
        await sendPushNotification(
          [participantId],
          pushCopy.medalForTask(medal.name, task.title),
          'transactional_medal',
        ).catch(() => undefined);
      } else {
        userMedalId = existing.id;
        awardedMedal = { id: medal.id, name: medal.name };
        if (submissionId) {
          await db.update(userMedals).set({ submissionId }).where(eq(userMedals.id, existing.id));
        }
      }
    }
  }
  if (task.medalTask || task.medalId) {
    await evaluateMedalsForParticipant(participantId);
  }
  return { userMedalId, medal: awardedMedal };
}
