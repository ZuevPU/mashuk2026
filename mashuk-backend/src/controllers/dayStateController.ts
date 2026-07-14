import { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { participantDayState, dayExperiments, pedagogicalRoles, questions, answers } from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { getForumSettings, resolveEffectiveCurrentDay } from '../services/helpers.js';
import { ROLE_KEYS, getRoleMeta } from '../services/roleService.js';
import { EVENING_SCALE_KEYS } from '../services/touchpointTemplates.js';
import { awardPoints } from '../services/pointsService.js';

const scaleField = z.coerce.number().int().min(1).max(5).optional();

const eveningSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(7).optional(),
  ratings: z.object({
    // 9 шкал ТЗ
    direction: scaleField,
    lessonsImportant: scaleField,
    openLessons: scaleField,
    morningHealth: scaleField,
    workshops: scaleField,
    eveningAtmosphere: scaleField,
    food: scaleField,
    housing: scaleField,
    curator: scaleField,
    // legacy
    energy: scaleField,
    usefulness: scaleField,
    // условные
    tripYes: z.boolean().optional(),
    tripScore: z.coerce.number().int().min(1).max(5).optional(),
    practiceYes: z.boolean().optional(),
    practiceName: z.string().max(500).optional(),
    recommendYes: z.boolean().optional(),
    recommendScore: z.coerce.number().int().min(1).max(10).optional(),
    // открытые
    mainThesis: z.string().max(2000).optional(),
    understandingChange: z.string().max(2000).optional(),
    likedMost: z.string().max(2000).optional(),
    improveTomorrow: z.string().max(2000).optional(),
    freeNote: z.string().max(4000).optional(),
    experimentResult: z.string().max(2000).optional(),
    note: z.string().max(2000).optional(),
  }).default({}),
  tomorrowRoleKey: z.enum(ROLE_KEYS as unknown as [string, ...string[]]).optional(),
  experimentStatus: z.enum(['none', 'in_progress', 'done']).optional(),
});

const experimentSchema = z.object({
  status: z.enum(['none', 'in_progress', 'done']),
  dayNumber: z.coerce.number().int().min(1).max(8).optional(),
});

async function upsertDayState(
  participantId: number,
  dayNumber: number,
  patch: Partial<typeof participantDayState.$inferInsert>,
) {
  const [existing] = await db.select().from(participantDayState)
    .where(and(
      eq(participantDayState.participantId, participantId),
      eq(participantDayState.dayNumber, dayNumber),
    )).limit(1);

  if (existing) {
    const [updated] = await db.update(participantDayState)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(participantDayState.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(participantDayState).values({
    participantId,
    dayNumber,
    ...patch,
  }).returning();
  return created;
}

export const updateExperimentStatus = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const parsed = experimentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const settings = await getForumSettings();
    const dayNumber = parsed.data.dayNumber ?? resolveEffectiveCurrentDay(settings);
    if (dayNumber < 2 || dayNumber > 7) {
      res.status(400).json({ error: 'Experiments are only available on days 2–7' });
      return;
    }

    const state = await upsertDayState(req.participant!.id, dayNumber, {
      experimentStatus: parsed.data.status,
    });

    res.json({ ok: true, state });
  } catch (error) {
    console.error('updateExperimentStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitEveningQuestionnaire = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const parsed = eveningSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const settings = await getForumSettings();
    const dayNumber = parsed.data.dayNumber ?? resolveEffectiveCurrentDay(settings);
    if (dayNumber < 1 || dayNumber > 7) {
      res.status(400).json({ error: 'Evening questionnaire is for days 1–7' });
      return;
    }

    if (dayNumber <= 6 && !parsed.data.tomorrowRoleKey) {
      res.status(400).json({ error: 'tomorrowRoleKey required on days 1–6' });
      return;
    }

    const ratings = parsed.data.ratings;
    const patch: Partial<typeof participantDayState.$inferInsert> = {
      eveningRatings: ratings,
      tomorrowRoleKey: parsed.data.tomorrowRoleKey ?? null,
    };
    if (parsed.data.experimentStatus) {
      patch.experimentStatus = parsed.data.experimentStatus;
    }

    const state = await upsertDayState(req.participant!.id, dayNumber, patch);

    const nextDay = dayNumber + 1;
    if (parsed.data.tomorrowRoleKey && nextDay <= 7) {
      await upsertDayState(req.participant!.id, nextDay, {
        activeRoleKey: parsed.data.tomorrowRoleKey,
      });
    }

    // Отметить точку 7 «Итоги дня» выполненным, если есть
    const [summaryQ] = await db.select().from(questions)
      .where(and(
        eq(questions.dayNumber, dayNumber),
        eq(questions.block, 'Итоги дня'),
        eq(questions.status, 'published'),
      )).limit(1);
    if (summaryQ) {
      const [existing] = await db.select().from(answers)
        .where(and(
          eq(answers.participantId, req.participant!.id),
          eq(answers.questionId, summaryQ.id),
        )).limit(1);
      if (!existing) {
        await db.insert(answers).values({
          participantId: req.participant!.id,
          questionId: summaryQ.id,
          answerData: ratings,
          questionTextSnapshot: summaryQ.text,
          pointsAwarded: summaryQ.points ?? 15,
          wordCount: String(ratings.mainThesis || ratings.freeNote || '').split(/\s+/).filter(Boolean).length,
        });
        await awardPoints(req.participant!.id, 'question_answer', summaryQ.points ?? 15);
        await awardPoints(req.participant!.id, 'evening_complete', 15);
      }
    }

    res.json({
      ok: true,
      state,
      tomorrowRole: parsed.data.tomorrowRoleKey
        ? getRoleMeta(parsed.data.tomorrowRoleKey)
        : null,
      scales: EVENING_SCALE_KEYS,
    });
  } catch (error) {
    console.error('submitEveningQuestionnaire:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export async function loadDayContext(participantId: number, dayNumber: number, pedagogicalRole: string | null) {
  const [state] = await db.select().from(participantDayState)
    .where(and(
      eq(participantDayState.participantId, participantId),
      eq(participantDayState.dayNumber, dayNumber),
    )).limit(1);

  const activeRoleKey = state?.activeRoleKey
    || (dayNumber === 1 ? pedagogicalRole : null)
    || pedagogicalRole;

  let roleMeta = activeRoleKey ? getRoleMeta(activeRoleKey) : null;
  if (activeRoleKey && !roleMeta) {
    const [row] = await db.select().from(pedagogicalRoles)
      .where(eq(pedagogicalRoles.roleKey, activeRoleKey)).limit(1);
    if (row) {
      roleMeta = {
        roleKey: row.roleKey as import('../services/roleService.js').RoleKey,
        name: row.name,
        quadrant: row.quadrant || '',
        essence: row.essence || '',
        inClass: row.inClass || '',
        keywords: row.keywords || '',
        sortOrder: row.sortOrder ?? 0,
      };
    }
  }

  let experiment = null;
  if (dayNumber >= 2 && dayNumber <= 7 && activeRoleKey) {
    const [exp] = await db.select().from(dayExperiments)
      .where(and(
        eq(dayExperiments.dayNumber, dayNumber),
        eq(dayExperiments.roleKey, activeRoleKey),
      )).limit(1);
    if (exp) {
      experiment = {
        id: exp.id,
        title: exp.title,
        body: exp.body,
        hint: exp.hint,
        status: state?.experimentStatus || 'none',
        roleKey: activeRoleKey,
        roleName: roleMeta?.name,
      };
    }
  }

  const showRoleOfDay = dayNumber >= 2 && dayNumber <= 7 && !!roleMeta;
  const eveningDone = !!state?.eveningRatings;
  const askTomorrowRole = dayNumber >= 1 && dayNumber <= 6;

  return {
    roleOfDay: showRoleOfDay ? {
      roleKey: activeRoleKey,
      name: roleMeta!.name,
      quadrant: roleMeta!.quadrant,
      essence: roleMeta!.essence,
    } : null,
    experiment,
    eveningQuestionnaire: {
      available: dayNumber >= 1 && dayNumber <= 7,
      completed: eveningDone,
      askTomorrowRole,
      scales: EVENING_SCALE_KEYS.map(key => ({
        key,
        label: ({
          direction: 'Работа в рамках тематического направления',
          lessonsImportant: 'Уроки о важном',
          openLessons: 'Открытые уроки / практики',
          morningHealth: 'Утренняя программа здоровья',
          workshops: 'Мастер-классы и альтернативная программа',
          eveningAtmosphere: 'Вечерняя атмосферная программа',
          food: 'Организация питания',
          housing: 'Организация проживания и быта',
          curator: 'Работа куратора группы',
        } as Record<string, string>)[key],
      })),
      roles: askTomorrowRole ? ROLE_KEYS.map(k => getRoleMeta(k)).filter(Boolean) : [],
      saved: state?.eveningRatings || null,
    },
    dayState: state || null,
  };
}
