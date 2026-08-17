import { and, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { kbDayUnlocks, materials, participants } from '../db/schema.js';
import { updateShift } from './shiftService.js';

/**
 * Participant KB list: always AND shiftId. A bare `eventId IN (today's events)`
 * leaked another shift's rows whenever ids collided after copy / shared events.
 */
export function knowledgeBaseMaterialsWhere(
  shiftId: number,
  day: number,
  dayEventIds: number[],
): SQL | undefined {
  const ownShift = eq(materials.shiftId, shiftId);
  const dayOrGeneral = or(eq(materials.dayNumber, day), eq(materials.isGeneral, true));
  if (dayEventIds.length === 0) return and(ownShift, dayOrGeneral);
  return and(ownShift, or(dayOrGeneral, inArray(materials.eventId, dayEventIds)));
}

export function materialBelongsToParticipantShift(
  material: { shiftId?: number | null },
  shiftId: number | null | undefined,
): boolean {
  if (shiftId == null || material.shiftId == null) return false;
  return material.shiftId === shiftId;
}

export type OpenKnowledgeBaseResult = {
  shiftId: number;
  published: number;
  daysUnlocked: number;
  participantsUnlocked: number;
  kbUnlockDisabled: true;
};

/** Live people of this shift — same rule as group seats. */
export function liveShiftParticipantWhere(shiftId: number) {
  return and(
    eq(participants.shiftId, shiftId),
    isNotNull(participants.onboardingCompletedAt),
    isNull(participants.selfDeletedAt),
  );
}

/**
 * Make the knowledge base of one shift visible to every live participant
 * with no touchpoint / day gate. Does not touch other shifts.
 */
export async function openKnowledgeBaseForShift(
  shiftId: number,
  adminId?: number | null,
): Promise<OpenKnowledgeBaseResult> {
  const publishedRows = await db.update(materials)
    .set({
      status: 'published',
      kbUnlockMode: 'immediate',
      kbUnlockMinTouchpoints: null,
    })
    .where(and(
      eq(materials.shiftId, shiftId),
      or(eq(materials.status, 'draft'), eq(materials.status, 'published')),
    ))
    .returning({ id: materials.id });

  const shift = await updateShift(shiftId, { kbUnlockDisabled: true });
  const totalDays = Math.max(1, Math.min(31, Number(shift?.totalDays) || 8));
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  const people = await db.select({ id: participants.id }).from(participants)
    .where(liveShiftParticipantWhere(shiftId));

  let participantsUnlocked = 0;
  if (people.length > 0) {
    const now = new Date();
    const rows = people.flatMap(p => dayNumbers.map(dayNumber => ({
      participantId: p.id,
      dayNumber,
      unlockedByAdminId: adminId ?? null,
      unlockedAt: now,
    })));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await db.insert(kbDayUnlocks).values(chunk).onConflictDoUpdate({
        target: [kbDayUnlocks.participantId, kbDayUnlocks.dayNumber],
        set: { unlockedAt: now, unlockedByAdminId: adminId ?? null },
      });
    }
    participantsUnlocked = people.length;
  }

  return {
    shiftId,
    published: publishedRows.length,
    daysUnlocked: dayNumbers.length,
    participantsUnlocked,
    kbUnlockDisabled: true,
  };
}

/** Day unlocked + optional per-material gate. Admin «open all» skips the material gate. */
export function materialVisibleWhenShiftOpen(
  unlockDisabled: boolean,
  dayUnlocked: boolean,
  materialUnlocked: boolean,
): boolean {
  if (!dayUnlocked) return false;
  if (unlockDisabled) return true;
  return materialUnlocked;
}
