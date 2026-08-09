import { Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  participantDayState, dayExperiments, pedagogicalRoles, questions, answers, events,
} from '../db/schema.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import {
  eveningProgramEventFields,
  getEveningOpensAtMsk,
  isEveningOpenForConfig,
  resolveEveningConfigForDay,
  type EveningQuestionnaireConfig,
} from '../services/eveningQuestionnaireConfig.js';
import { getForumSettings, resolveEffectiveCurrentDay } from '../services/helpers.js';
import { resolveEveningSurveyDayForParticipant } from '../services/eveningSurveyDay.js';
import { ROLE_KEYS, getRoleMeta } from '../services/roleService.js';
import { EVENING_SCALE_KEYS } from '../services/touchpointTemplates.js';
import { awardPoints } from '../services/pointsService.js';
import {
  collectEveningProgramPickTree,
  filterEventsForEveningProgramPick,
} from '../services/eveningProgramPickTree.js';
import { resolveActiveShiftId } from '../services/shiftService.js';

const scaleField = z.coerce.number().int().min(1).max(5).optional();

const programEventItemSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  eventTitle: z.string().max(500),
  parentEventId: z.coerce.number().int().positive(),
  parentEventTitle: z.string().max(500),
  score: z.coerce.number().int().min(1).max(10),
});

const programEventRatingValue = z.union([
  z.object({
    items: z.array(programEventItemSchema).min(1).max(40),
  }),
  // Legacy single pick — only if score already filled
  z.object({
    eventId: z.coerce.number().int().positive(),
    eventTitle: z.string().max(500),
    parentEventId: z.coerce.number().int().positive().nullable().optional(),
    parentEventTitle: z.string().max(500).nullable().optional(),
    score: z.coerce.number().int().min(1).max(10),
  }),
]);

const eveningSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(7).optional(),
  // Dynamic keys from admin evening builder (choice / text / scales / yes_no / program_event).
  ratings: z.record(z.union([
    z.string().max(4000),
    z.number(),
    z.boolean(),
    z.null(),
    programEventRatingValue,
  ])).default({}),
  tomorrowRoleKey: z.enum(ROLE_KEYS as unknown as [string, ...string[]]).optional(),
  experimentStatus: z.enum(['none', 'in_progress', 'done']).optional(),
});

const eveningDraftSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(7).optional(),
  step: z.coerce.number().int().min(0).max(20),
  form: z.record(z.unknown()).default({}),
  tomorrowRoleKey: z.string().optional(),
});

export const patchEveningDraft = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const parsed = eveningDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const settings = await getForumSettings();
    const dayNumber = parsed.data.dayNumber
      ?? await resolveEveningSurveyDayForParticipant(req.participant!.id, settings);
    const draft = {
      step: parsed.data.step,
      form: parsed.data.form,
      tomorrowRoleKey: parsed.data.tomorrowRoleKey,
      updatedAt: new Date().toISOString(),
    };
    const state = await upsertDayState(req.participant!.id, dayNumber, { eveningDraft: draft });
    res.json({ ok: true, draft: state?.eveningDraft, dayNumber });
  } catch (error) {
    console.error('patchEveningDraft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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
    // Server picks forum day of the evening being closed (not clock/admin day).
    const dayNumber = await resolveEveningSurveyDayForParticipant(req.participant!.id, settings);
    if (dayNumber < 1 || dayNumber > 7) {
      res.status(400).json({ error: 'Evening questionnaire is for days 1–7' });
      return;
    }

    const eveningConfig = resolveEveningConfigForDay(settings, dayNumber);
    const opensAt = getEveningOpensAtMsk(eveningConfig);
    if (!isEveningOpenForConfig(eveningConfig) && process.env.NODE_ENV !== 'test') {
      res.status(400).json({
        error: eveningConfig.forceUnpublished
          ? 'Итоговая анкета снята с публикации'
          : `Итоговая анкета доступна с ${opensAt} МСК (или после публикации организатором)`,
      });
      return;
    }

    const ratings = parsed.data.ratings;
    const patch: Partial<typeof participantDayState.$inferInsert> = {
      eveningRatings: ratings,
      tomorrowRoleKey: parsed.data.tomorrowRoleKey ?? null,
      eveningDraft: null,
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

    // Отметить точку 7 «Итоги дня» выполненным, если есть вопрос-маркер
    const summaryConds = [
      eq(questions.dayNumber, dayNumber),
      eq(questions.status, 'published'),
      or(
        eq(questions.block, 'Итоги дня'),
        eq(questions.questionKind, 'day_summary'),
        eq(questions.reflectionKind, 'evening_summary'),
      )!,
    ];
    const participantShiftId = req.participant!.shiftId;
    if (participantShiftId != null) {
      summaryConds.push(eq(questions.shiftId, participantShiftId));
    }
    const [summaryQ] = await db.select().from(questions)
      .where(and(...summaryConds)).limit(1);
    if (summaryQ) {
      const [existing] = await db.select().from(answers)
        .where(and(
          eq(answers.participantId, req.participant!.id),
          eq(answers.questionId, summaryQ.id),
        )).limit(1);
      const eveningPoints = 15;
      const wordCount = String(ratings.mainThesis || ratings.freeNote || '')
        .split(/\s+/).filter(Boolean).length;
      if (!existing) {
        await db.insert(answers).values({
          participantId: req.participant!.id,
          questionId: summaryQ.id,
          answerData: ratings,
          questionTextSnapshot: summaryQ.text,
          pointsAwarded: eveningPoints,
          wordCount,
        });
        // Single Path award: evening questionnaire covers touchpoint 7 (avoid question_answer + evening_complete).
        await awardPoints(req.participant!.id, 'evening_complete', eveningPoints, dayNumber);
      } else {
        await db.update(answers).set({
          answerData: ratings,
          wordCount,
        }).where(eq(answers.id, existing.id));
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

export async function loadDayContext(
  participantId: number,
  dayNumber: number,
  pedagogicalRole: string | null,
  opts?: { now?: Date; settings?: Awaited<ReturnType<typeof getForumSettings>>; hasPointB?: boolean; pointBQuestionId?: number | null },
) {
  const now = opts?.now ?? new Date();
  const settings = opts?.settings ?? await getForumSettings();
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
        iconKey: row.iconKey || '',
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
        eq(dayExperiments.status, 'published'),
      )).limit(1);
    if (exp) {
      experiment = {
        id: exp.id,
        title: exp.title,
        body: exp.body,
        hint: exp.hint,
        title2: exp.title2,
        body2: exp.body2,
        hint2: exp.hint2,
        title3: exp.title3,
        body3: exp.body3,
        hint3: exp.hint3,
        status: state?.experimentStatus || 'none',
        roleKey: activeRoleKey,
        roleName: roleMeta?.name,
      };
    }
  }

  const showRoleOfDay = dayNumber >= 1 && dayNumber <= 7 && !!roleMeta;
  const eveningDone = !!state?.eveningRatings;
  const askTomorrowRole = dayNumber >= 1 && dayNumber <= 6;
  const config: EveningQuestionnaireConfig = resolveEveningConfigForDay(settings, dayNumber);
  const opensAt = getEveningOpensAtMsk(config);
  const eveningOpen = dayNumber >= 1 && dayNumber <= 7 && isEveningOpenForConfig(config, now);
  const draft = state?.eveningDraft as {
    step?: number;
    form?: Record<string, unknown>;
    tomorrowRoleKey?: string;
  } | null;

  const programEventFieldDefs = eveningProgramEventFields(config);
  let programEventOptions: Record<string, {
    events: ReturnType<typeof collectEveningProgramPickTree>['events'];
    emptyReason: 'none' | 'none_in_program';
  }> = {};
  if (programEventFieldDefs.length > 0) {
    const shiftId = typeof (settings as { shiftId?: number }).shiftId === 'number'
      ? (settings as { shiftId: number }).shiftId
      : await resolveActiveShiftId();
    // Load whole shift: nested sub-events sometimes inherit day visually but may
    // miss day_number; tree builder still anchors roots to the survey day.
    const shiftEv = await db.select().from(events).where(eq(events.shiftId, shiftId));
    const published = filterEventsForEveningProgramPick(shiftEv);
    for (const field of programEventFieldDefs) {
      const tree = collectEveningProgramPickTree(
        published,
        field.linkedEventIds,
        settings,
        dayNumber,
      );
      programEventOptions[field.key] = {
        events: tree.events,
        emptyReason: tree.events.length > 0 ? 'none' : 'none_in_program',
      };
    }
  }

  return {
    roleOfDay: showRoleOfDay ? {
      roleKey: activeRoleKey,
      name: roleMeta!.name,
      quadrant: roleMeta!.quadrant,
      essence: roleMeta!.essence,
    } : null,
    experiment,
    eveningQuestionnaire: {
      available: eveningOpen && !eveningDone,
      open: eveningOpen,
      opensAt,
      forcePublished: !!config.forcePublished,
      forceUnpublished: !!config.forceUnpublished,
      completed: eveningDone,
      askTomorrowRole,
      config,
      programEventOptions,
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
      savedDraft: draft,
      pointBQuestionId: opts?.pointBQuestionId ?? null,
      hasPointB: opts?.hasPointB ?? false,
    },
    dayState: state || null,
  };
}
